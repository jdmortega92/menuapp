import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { fechaColombia } from '@/lib/fechas'
import { fechaCalendario, fechaCancelacionProgramada } from '@/lib/suscripciones'
import { registrarConsentimiento } from '@/lib/consentimientos'

// CIERRE 1 — CANCELAR LA SUSCRIPCION. Reemplaza el flujo del navegador, que
// eran DOS idas y vueltas: POST /api/wompi/cobro-automatico {activar:false} y
// despues un UPDATE suelto de plan_programado (o de plan) con la llave anon.
// Entre las dos habia una ventana en la que una activacion pasaba la guarda y
// quedaba armada junto a la bajada (D-HIGH-1b), y un fallo del update se veia
// igual que un exito (C-05). Aqui es UN solo UPDATE condicional que apaga la
// renovacion y agenda (o aplica) la bajada a la vez.
//
// Ademas es requisito del proximo cierre: las 8 columnas de facturacion de
// restaurantes se van a revocar a nivel GRANT para anon/authenticated, y
// despues de eso el navegador ya no podria escribirlas.
//
// El body se IGNORA: la identidad sale de la sesion y la decision (agendar o
// inmediata) de la fila, nunca de lo que mande el cliente.
//
// fue_pago NO se toca en ninguna rama: es un latch one-way (STRATEGIC.2).

// Mensajes que la pagina pinta tal cual (van con acentos por eso).
const MSG_SIN_PLAN = 'No tienes un plan pago para cancelar.'
const MSG_CAMBIO = 'Tu suscripción cambió mientras la cancelabas. Recarga la página e intenta de nuevo.'
const MSG_ERROR = 'No pudimos cancelar tu suscripción. Intenta de nuevo.'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Identidad SIEMPRE desde la sesion (misma regla que /api/wompi/*).
  const { data: rest, error: restError } = await supabase
    .from('restaurantes')
    .select('id, plan, periodo_plan, plan_expira, plan_programado, fecha_cambio_programado, cobro_automatico')
    .eq('usuario_id', user.id)
    .maybeSingle()
  if (restError || !rest) {
    console.error('[suscripcion/cancelar] lectura de restaurante fallo:', restError?.message)
    return NextResponse.json({ error: MSG_ERROR }, { status: 500 })
  }

  if (!rest.plan || rest.plan === 'gratis') {
    return NextResponse.json({ error: MSG_SIN_PLAN }, { status: 409 })
  }

  // Ya cancelada: idempotente, sin escribir nada. idempotente=true le dice a la
  // pagina que no vuelva a mandar el correo de cambio de plan.
  if (rest.plan_programado) {
    const fecha = fechaCalendario(rest.fecha_cambio_programado as string | null)
    return NextResponse.json(
      { ok: true, modo: 'programado', ...(fecha ? { fecha } : {}), idempotente: true },
      { status: 200 }
    )
  }

  // MISMA regla que pinta la hoja de confirmacion (lib/suscripciones).
  const fecha = fechaCancelacionProgramada(rest.plan, rest.plan_expira as string | null, fechaColombia())
  const desarme = { cobro_automatico: false, cobro_automatico_desde: null }
  const cambios = fecha
    ? { plan_programado: 'gratis', fecha_cambio_programado: fecha, ...desarme }
    // Inmediata: lo mismo que escribia la pagina (solo plan; periodo_plan es el
    // periodo COMPRADO y no se toca) mas el desarme.
    : { plan: 'gratis', ...desarme }

  // Condicional sobre lo que se LEYO: si la fila cambio entre la lectura y la
  // escritura (un pago que entro, otra pestana que cancelo), no se escribe nada
  // y el usuario lo ve, en vez de pisar un estado que no conocemos.
  const admin = createAdminClient()
  const { data: filas, error: errUpd } = await admin
    .from('restaurantes')
    .update(cambios)
    .eq('id', rest.id)
    .eq('plan', rest.plan)
    .is('plan_programado', null)
    .select('id')
  if (errUpd) {
    console.error('[suscripcion/cancelar] update fallo:', errUpd.message)
    return NextResponse.json({ error: MSG_ERROR }, { status: 500 })
  }
  if (!filas || filas.length === 0) {
    console.info(`[suscripcion/cancelar] fila cambio entre lectura y escritura restaurante=${rest.id}`)
    return NextResponse.json({ error: MSG_CAMBIO }, { status: 409 })
  }

  // Evidencia del desarme: la MISMA fila REVOCADO que deja
  // /api/wompi/cobro-automatico al apagar por cancelacion. Solo si la bandera
  // estaba armada y solo despues de un update que de verdad aplico.
  if (rest.cobro_automatico === true) {
    const { data: fuente } = await admin
      .from('fuentes_pago')
      .select('id')
      .eq('restaurante_id', rest.id)
      .eq('estado', 'AVAILABLE')
      .eq('predeterminada', true)
      .maybeSingle()
    await registrarConsentimiento(
      admin,
      {
        restauranteId: rest.id,
        fuentePagoId: fuente?.id ?? null,
        evento: 'REVOCADO',
        motivo: 'suscripcion_cancelada',
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      },
      'suscripcion/cancelar'
    )
  }

  const modo = fecha ? 'programado' : 'inmediato'
  console.info(`[suscripcion/cancelar] restaurante=${rest.id} modo=${modo}${fecha ? ` fecha=${fecha}` : ''}`)
  return NextResponse.json({ ok: true, modo, ...(fecha ? { fecha } : {}) }, { status: 200 })
}
