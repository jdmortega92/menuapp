// Ejecutor de la CONCILIACION del cobro automatico (CIERRE 5b). SOLO SERVIDOR.
// Lo llama el cron PRIMERO, antes de los barridos A/B/C y aunque el freno del
// cobro automatico este puesto: conciliar no cobra, solo averigua que paso con
// cobros que YA se iniciaron.
//
// Por fila INICIADO de hace mas de una hora (cualquiera sea fuentes_pago.estado:
// una fuente revocada despues del reclamo puede tener un cobro en vuelo):
//   FACTURA PRIMERO: factura aprobada con numero == referencia -> solo la marca
//                     APROBADO (el webhook ya aplico y su marca fallo). Sin
//                     guarda, sin aplicar, sin alerta, sin correo. Si la lectura
//                     falla, la fila sigue INICIADO para manana.
//   sin tx id                 -> REVISION (la busqueda por referencia es 5c)
//   GET /transactions/{id}:
//     APPROVED                -> si el restaurante sigue como se le cobro (plan,
//                                periodo_plan, plan_expira): camino compartido
//                                (otorga el plan si el webhook no llego; deja la
//                                marca APROBADO). Si cambio: REVISION 'estado cambio'.
//     DECLINED/VOIDED/ERROR   -> FALLIDO + correo al dueno (camino de fallo compartido)
//     PENDING                 -> esperar; REVISION pasados 7 dias
//     lo que no cuadre        -> REVISION
// Las decisiones son de lib/pagos/conciliacion (puro, testeado). Aqui JAMAS hay
// un POST: el unico llamado a Wompi es obtenerTransaccion (GET, llave privada).
// Sin llave privada o sin entorno coherente no se consulta nada.

import type { createAdminClient } from '@/lib/supabase-admin'
import { credencialesListas, obtenerTransaccion } from '@/lib/wompiApi'
import { entornoWompiActual } from '@/lib/wompiEntorno'
import { parsearReferencia } from '@/lib/wompi'
import { aplicarTransaccionAprobada, marcarCobroAutomaticoAprobado } from './aplicarTransaccion'
import { fallarCobroAutomatico } from './cobroFallido'
import {
  clasificarFactura,
  corteConciliacion,
  decidirAntesDeAplicar,
  decidirInicioConFactura,
  decidirPorConsulta,
  decidirPorFactura,
  referenciaVerificada,
  type FacturaLeida,
  decidirTrasAplicar,
  type FilaConciliable,
  type FilaRevision,
} from './conciliacion'

type Admin = ReturnType<typeof createAdminClient>

const ETQ = 'cron/conciliacion'
/** Tope por corrida: una avalancha de filas no puede comerse el timeout. */
const MAXIMO_FILAS = 200

export interface ResumenConciliacion {
  omitida: boolean
  revisadas: number
  aprobadas: number
  fallidas: number
  revision: number
  pendientes: number
  errores: number
}

export interface DepsConciliacion {
  obtener?: typeof obtenerTransaccion
  aplicar?: typeof aplicarTransaccionAprobada
  fallar?: typeof fallarCobroAutomatico
  marcarAprobado?: typeof marcarCobroAutomaticoAprobado
  ahora?: Date
}

interface FilaFuente extends FilaConciliable {
  id: string
  restaurante_id: string
  ultimo_cobro_periodo: string | null
}

export async function conciliarCobros(
  admin: Admin,
  alertas: FilaRevision[],
  deps: DepsConciliacion = {}
): Promise<ResumenConciliacion> {
  const obtener = deps.obtener ?? obtenerTransaccion
  const aplicar = deps.aplicar ?? aplicarTransaccionAprobada
  const fallar = deps.fallar ?? fallarCobroAutomatico
  const marcarAprobado = deps.marcarAprobado ?? marcarCobroAutomaticoAprobado
  const ahora = deps.ahora ?? new Date()
  const resumen: ResumenConciliacion = {
    omitida: false, revisadas: 0, aprobadas: 0, fallidas: 0, revision: 0, pendientes: 0, errores: 0,
  }

  if (!credencialesListas(ETQ, ['privada']) || !entornoWompiActual().ok) {
    console.error(`[${ETQ}] sin llave privada o entorno de Wompi; conciliacion omitida`)
    resumen.omitida = true
    return resumen
  }

  const leer = () =>
    admin
      .from('fuentes_pago')
      .select('id, restaurante_id, ultimo_cobro_periodo, ultimo_cobro_referencia, ultimo_cobro_tx_id, ultimo_cobro_en')
      .eq('ultimo_cobro_estado', 'INICIADO')
      .lt('ultimo_cobro_en', corteConciliacion(ahora))
      .order('ultimo_cobro_en', { ascending: true })
      .limit(MAXIMO_FILAS)
  let lectura = await leer()
  if (lectura.error) lectura = await leer() // un reintento
  if (lectura.error) {
    console.error(`[${ETQ}] lectura de filas INICIADO fallo:`, lectura.error.message)
    resumen.errores++
    return resumen
  }

  for (const fila of (lectura.data ?? []) as FilaFuente[]) {
    resumen.revisadas++
    try {
      await conciliarFila(fila)
    } catch {
      // Una fila rota no tumba la conciliacion del resto.
      console.error(`[${ETQ}] fila lanzo restaurante=${fila.restaurante_id}`)
      resumen.errores++
    }
  }

  console.info(
    `[${ETQ}] revisadas=${resumen.revisadas} aprobadas=${resumen.aprobadas} fallidas=${resumen.fallidas} ` +
      `revision=${resumen.revision} pendientes=${resumen.pendientes} errores=${resumen.errores}`
  )
  return resumen

  async function conciliarFila(fila: FilaFuente) {
    const periodoFacturado = fila.ultimo_cobro_periodo
    if (!periodoFacturado) {
      // INICIADO sin latch no lo escribe ningun camino: no hay CAS posible.
      console.error(`[${ETQ}] fila INICIADO sin periodo restaurante=${fila.restaurante_id}`)
      resumen.errores++
      return
    }

    const revision = async (motivo: string) => {
      const r = await fallar(admin, {
        fuenteId: fila.id,
        restauranteId: fila.restaurante_id,
        periodoFacturado,
        destino: 'REVISION',
        motivo,
        etiqueta: ETQ,
      })
      if (r.marca === 'marcado') {
        resumen.revision++
        alertas.push({
          restauranteId: fila.restaurante_id,
          motivo,
          referencia: fila.ultimo_cobro_referencia,
          txId: fila.ultimo_cobro_tx_id,
        })
      } else if (r.marca === 'error') {
        resumen.errores++
      }
    }

    const leerFactura = async (numero: string): Promise<FacturaLeida> => {
      const r = await admin.from('facturas').select('estado').eq('numero', numero).maybeSingle()
      const f = clasificarFactura(r)
      if (f === 'error') {
        console.error(`[${ETQ}] lectura de factura fallo restaurante=${fila.restaurante_id}; queda para la proxima corrida`)
      }
      return f
    }
    // Ya aplicado: la MISMA marca (y CAS) del camino compartido, nada mas.
    const aprobar = async (referencia: string) => {
      const m = await marcarAprobado(
        admin,
        { reference: referencia, id: fila.ultimo_cobro_tx_id ?? undefined },
        fila.restaurante_id,
        ETQ
      )
      if (m === 'marcado') resumen.aprobadas++
      else if (m === 'error') resumen.errores++
    }

    // ── FACTURA PRIMERO (filas con referencia guardada) ──
    const referencia = fila.ultimo_cobro_referencia
    const inicio = decidirInicioConFactura(fila, referencia ? await leerFactura(referencia) : 'sin_referencia')
    if (inicio.accion === 'aprobar') return aprobar(referencia!)
    if (inicio.accion === 'reintentar') {
      resumen.errores++
      return
    }
    if (inicio.accion === 'revision') return revision(inicio.motivo)
    if (inicio.accion !== 'consultar') return

    const consulta = await obtener(inicio.txId, ETQ)

    // ── FACTURA PRIMERO (filas de antes de 5b, sin referencia guardada) ──
    // Con la referencia de la transaccion, solo si es automatica, de este
    // restaurante y de este periodo.
    if (!referencia && consulta.ok) {
      const refTx = referenciaVerificada(consulta.datos, fila.restaurante_id, periodoFacturado)
      if (refTx) {
        const d = decidirPorFactura(await leerFactura(refTx))
        if (d.accion === 'aprobar') return aprobar(refTx)
        if (d.accion === 'reintentar') {
          resumen.errores++
          return
        }
      }
    }

    // Solo sin factura aprobada: la decision normal (y, para APPROVED, la guarda).
    const decision = decidirPorConsulta(fila, consulta, ahora)

    switch (decision.accion) {
      case 'esperar':
        resumen.pendientes++
        return
      case 'revision':
        return revision(decision.motivo)
      case 'fallar': {
        // Filas de antes de 5b no guardaron la referencia: sale de la
        // transaccion, que decidirPorConsulta ya verifico como automatica.
        const referencia = fila.ultimo_cobro_referencia ?? (consulta.ok ? consulta.datos?.reference : undefined)
        const ref = parsearReferencia(referencia ?? '')
        const r = await fallar(admin, {
          fuenteId: fila.id,
          restauranteId: fila.restaurante_id,
          periodoFacturado,
          destino: 'FALLIDO',
          motivo: `conciliacion ${decision.estadoWompi}`,
          etiqueta: ETQ,
          ...(ref ? { aviso: { plan: ref.plan, periodo: ref.periodo } } : {}),
        })
        if (r.marca === 'marcado') resumen.fallidas++
        else if (r.marca === 'error') resumen.errores++
        return
      }
      case 'aplicar': {
        // Guarda de estado (decidirAntesDeAplicar): el restaurante tiene que
        // seguir como cuando se le cobro, o no se aplica nada.
        const { data: rest, error: errRest } = await admin
          .from('restaurantes')
          .select('plan, periodo_plan, plan_expira')
          .eq('id', fila.restaurante_id)
          .maybeSingle()
        if (errRest) {
          // Sin lectura no hay guarda: la fila sigue INICIADO para manana.
          console.error(`[${ETQ}] lectura del restaurante fallo restaurante=${fila.restaurante_id}:`, errRest.message)
          resumen.errores++
          return
        }
        if (!rest) return revision('aprobado sin restaurante')
        const guarda = decidirAntesDeAplicar(decision.transaccion.reference, fila.restaurante_id, rest)
        if (guarda.accion === 'revision') return revision(guarda.motivo)

        const cierre = decidirTrasAplicar(await aplicar(decision.transaccion, 'conciliacion'))
        if (cierre.accion === 'aprobada') resumen.aprobadas++
        else if (cierre.accion === 'esperar') resumen.pendientes++
        else return revision(cierre.motivo)
        return
      }
    }
  }
}
