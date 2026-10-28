// Camino COMPARTIDO "un cobro automatico no prospero" (CIERRE 5b). SOLO
// SERVIDOR: recibe el cliente de service role. Lo usan los TRES que pueden ver
// un fallo:
//   - el cron, cuando el cobro no se pudo ni iniciar o el POST no tuvo respuesta;
//   - el webhook, cuando Wompi rechazo una transaccion ya iniciada;
//   - la conciliacion, cuando el GET muestra un rechazo o algo que no cuadra.
// Antes eran dos copias (cron y webhook) con compare-and-swap distintos.
//
// ── UN FALLO NO ESCRIBE EN facturas. NUNCA. ──
// facturas es el libro contable y lo escribe UNICAMENTE el camino del APPROVED
// (lib/pagos/aplicarTransaccion). La referencia automatica es determinista
// (lleva el periodo), asi que una factura 'rechazada' secuestraria para siempre
// la factura real de ese periodo. El rastro del intento vive en
// fuentes_pago.ultimo_cobro_*, que es estado operativo y se sobreescribe.
//
// EL LATCH NO SE SUELTA: ultimo_cobro_periodo queda como esta (politica v1 sin
// escalera de reintentos, F4-DECISIONES). Solo un APPROVED mueve plan_expira y,
// con el, el periodo que el cron va a reclamar despues.

import type { createAdminClient } from '@/lib/supabase-admin'
import { notificarCobroFallido } from '@/lib/email/notificaciones'
import { precioDe, type Periodo } from '@/lib/planes'
import type { Plan } from '@/types'
import { filtroOrigenFallo, motivoCorto, type DestinoFallo } from './cobroEstado'

type Admin = ReturnType<typeof createAdminClient>

export type MarcaFallo = 'marcado' | 'ya_registrado' | 'error'
export type CorreoFallo = 'enviado' | 'sin_destinatario' | 'fallo' | 'no_aplica'

export interface FalloCobro {
  fuenteId: string
  restauranteId: string
  /** El latch de la fila: solo se marca la fila que reclamo ESTE periodo. */
  periodoFacturado: string
  destino: DestinoFallo
  /** Codigo corto de NUESTRO vocabulario. Nunca el cuerpo de Wompi. */
  motivo: string
  etiqueta: string
  /** Solo para FALLIDO. REVISION no le escribe al dueno: no sabemos si se le
   *  cobro, y "no se te cobro nada" podria ser falso. */
  aviso?: {
    plan: Plan
    periodo: Periodo
    /** undefined = buscarlo (restaurante -> usuario_id -> auth.users);
     *  null = quien llama ya sabe que no hay. Nunca sale de un payload. */
    destino?: string | null
  }
}

/** COMPARE-AND-SWAP: solo desde NULL, INICIADO o (para FALLIDO) REVISION; ver
 *  estadosOrigenFallo. Es tambien la IDEMPOTENCIA: Wompi reentrega el mismo
 *  evento hasta recibir 200 y solo la primera entrega encuentra la fila sin
 *  marcar. ultimo_cobro_en NO se toca: conserva la hora del reclamo. */
export async function registrarFalloCobro(admin: Admin, p: FalloCobro): Promise<MarcaFallo> {
  const { data: marcada, error } = await admin
    .from('fuentes_pago')
    .update({
      ultimo_cobro_estado: p.destino,
      ultimo_cobro_error: motivoCorto(p.motivo),
      updated_at: new Date().toISOString(),
    })
    .eq('id', p.fuenteId)
    .eq('ultimo_cobro_periodo', p.periodoFacturado)
    .or(filtroOrigenFallo(p.destino))
    .select('id')

  if (error) {
    console.error(`[${p.etiqueta}] marca ${p.destino} no se pudo escribir restaurante=${p.restauranteId}:`, error.message)
    return 'error'
  }
  if (!marcada || marcada.length === 0) {
    console.info(`[${p.etiqueta}] ${p.destino} no aplica (ya registrado o la fila cambio) restaurante=${p.restauranteId}`)
    return 'ya_registrado'
  }
  return 'marcado'
}

/** Marca el fallo y, SOLO si este llamador gano el compare-and-swap de un
 *  FALLIDO, avisa al dueno. Nunca lanza. */
export async function fallarCobroAutomatico(
  admin: Admin,
  p: FalloCobro
): Promise<{ marca: MarcaFallo; correo: CorreoFallo }> {
  let marca: MarcaFallo
  try {
    marca = await registrarFalloCobro(admin, p)
  } catch {
    console.error(`[${p.etiqueta}] marca ${p.destino} lanzo restaurante=${p.restauranteId}`)
    return { marca: 'error', correo: 'no_aplica' }
  }
  if (marca !== 'marcado' || p.destino !== 'FALLIDO' || !p.aviso) return { marca, correo: 'no_aplica' }

  const destino = p.aviso.destino === undefined
    ? await buscarDestino(admin, p.restauranteId, p.etiqueta)
    : p.aviso.destino
  if (!destino) {
    console.error(`[${p.etiqueta}] sin destinatario para cobro fallido restaurante=${p.restauranteId}`)
    return { marca, correo: 'sin_destinatario' }
  }
  try {
    await notificarCobroFallido({
      to: destino,
      plan: p.aviso.plan,
      monto: precioDe(p.aviso.plan, p.aviso.periodo),
      // El plan sigue vivo hasta el periodo que se intento cobrar: es la fecha
      // que hace accionable el correo.
      planExpira: p.periodoFacturado,
    })
    return { marca, correo: 'enviado' }
  } catch {
    console.error(`[${p.etiqueta}] email de cobro fallido no se envio restaurante=${p.restauranteId}`)
    return { marca, correo: 'fallo' }
  }
}

async function buscarDestino(admin: Admin, restauranteId: string, etiqueta: string): Promise<string | undefined> {
  try {
    const { data: rest } = await admin
      .from('restaurantes')
      .select('usuario_id')
      .eq('id', restauranteId)
      .maybeSingle()
    const usuarioId = rest?.usuario_id as string | undefined
    if (!usuarioId) return undefined
    const { data, error } = await admin.auth.admin.getUserById(usuarioId)
    if (error) console.error(`[${etiqueta}] lookup del dueno fallo:`, error.message)
    return data?.user?.email ?? undefined
  } catch {
    return undefined
  }
}
