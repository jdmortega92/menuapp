// Partes PURAS del estado del cobro automatico (CIERRE 5b): sin red, sin DB,
// unit-testeables. Las usan el cron (/api/cron/suscripciones), el webhook
// (/api/wompi/eventos) y la conciliacion (lib/pagos/conciliarCobros) a traves
// de lib/pagos/cobroFallido y lib/pagos/aplicarTransaccion.
//
// fuentes_pago.ultimo_cobro_estado:
//   INICIADO  el cron reclamo el periodo; el POST esta en vuelo o ya salio.
//   APROBADO  un APPROVED (webhook, retorno o conciliacion) paso por el camino
//             compartido. Es la UNICA marca de exito y la escribe quien vio el
//             desenlace, nunca el cron al recibir el 201.
//   FALLIDO   rechazo definitivo: no se cobro. El dueno recibe el correo.
//   REVISION  no sabemos si se cobro (o el dato no cuadra). Sin correo al
//             dueno: va en la alerta al admin de esa corrida.

import { esIdTransaccionValido } from './transaccion'
import { fechaCalendario } from '@/lib/suscripciones'
import { CONTACTO_EMAIL } from '@/lib/contacto'
import type { ResultadoWompi, TransaccionWompi } from '@/lib/wompiApi'

export type EstadoCobro = 'INICIADO' | 'FALLIDO' | 'APROBADO' | 'REVISION'
export type DestinoFallo = 'FALLIDO' | 'REVISION'

/** Largo maximo de ultimo_cobro_error: codigo corto de NUESTRO vocabulario. */
export const LARGO_MOTIVO = 60

/** Estados desde los que un fallo puede escribirse (compare-and-swap).
 *  - Nunca desde APROBADO: un DECLINED tardio o reentregado no puede tapar un
 *    cobro que si prospero.
 *  - Nunca FALLIDO -> FALLIDO: es la idempotencia de las reentregas de Wompi
 *    (solo la primera manda el correo).
 *  - REVISION -> FALLIDO si: un rechazo definitivo resuelve la duda.
 *  - REVISION -> REVISION no: no cambia nada y volveria a alertar al admin.
 *  NULL entra por las filas viejas (antes de 5b el estado podia quedar NULL). */
export function estadosOrigenFallo(destino: DestinoFallo): (EstadoCobro | null)[] {
  return destino === 'FALLIDO' ? [null, 'INICIADO', 'REVISION'] : [null, 'INICIADO']
}

/** El mismo conjunto, como filtro .or() de PostgREST. `in.(...)` no matchea
 *  NULL en SQL, por eso el is.null explicito. */
export function filtroOrigenFallo(destino: DestinoFallo): string {
  const conValor = estadosOrigenFallo(destino).filter((e): e is EstadoCobro => e !== null)
  return `ultimo_cobro_estado.is.null,ultimo_cobro_estado.in.(${conValor.join(',')})`
}

/** Filtro .or() para la marca de exito: desde cualquier estado menos APROBADO.
 *  Un APPROVED es plata cobrada y gana sobre FALLIDO o REVISION. */
export const FILTRO_ORIGEN_APROBADO = 'ultimo_cobro_estado.is.null,ultimo_cobro_estado.neq.APROBADO'

// ── Cobro automatico en vuelo (CIERRE 6a, D-HIGH-3) ──────────────────────
// Un pago MANUAL mientras el cobro automatico del MISMO periodo esta en vuelo
// (INICIADO) o en duda (REVISION) puede cobrar dos veces: las referencias son
// distintas, asi que ni el latch ni el 422 de Wompi lo frenan. El checkout se
// niega en esos dos estados SOLO para el periodo vigente (ultimo_cobro_periodo
// == plan_expira): un APROBADO ya movio plan_expira, y un FALLIDO es justo el
// caso en que el dueno tiene que poder pagar a mano.

export type CobroEnVuelo = 'INICIADO' | 'REVISION'

export const MENSAJE_COBRO_EN_VUELO: Record<CobroEnVuelo, string> = {
  INICIADO: 'Estamos procesando el cobro automático de tu plan. Cuando se confirme verás la nueva fecha aquí.',
  REVISION: `Estamos revisando el último cobro automático de tu plan. Escríbenos a ${CONTACTO_EMAIL} y lo resolvemos.`,
}

/** El estado que bloquea el pago manual, o null si se puede pagar. REVISION
 *  gana sobre INICIADO si hubiera dos filas (la duda pesa mas). */
export function cobroEnVuelo(
  fuentes: { ultimo_cobro_estado?: string | null; ultimo_cobro_periodo?: string | null }[],
  planExpira: string | null | undefined
): CobroEnVuelo | null {
  const vigente = fechaCalendario(planExpira)
  if (!vigente) return null
  let hallado: CobroEnVuelo | null = null
  for (const f of fuentes) {
    if (fechaCalendario(f.ultimo_cobro_periodo) !== vigente) continue
    if (f.ultimo_cobro_estado === 'REVISION') return 'REVISION'
    if (f.ultimo_cobro_estado === 'INICIADO') hallado = 'INICIADO'
  }
  return hallado
}

export function motivoCorto(motivo: string): string {
  return motivo.slice(0, LARGO_MOTIVO)
}

/** Que paso con el POST /v1/transactions, en los terminos que el cron necesita.
 *  - iniciado: 201 con un id de transaccion valido (NO es "cobrado").
 *  - sin_tx_id: 201 sin un id usable. Hubo transaccion y no podemos seguirla.
 *  - rechazado: 4xx. Wompi dijo que no; no hay cobro. Incluye el 422 por
 *    referencia repetida (la proteccion anti-doble-cobro).
 *  - desconocido: red caida (status 0), excepcion o >= 500. El cobro PUDO
 *    haber entrado: jamas se le dice al dueno que no se le cobro. */
export type ResultadoPost =
  | { tipo: 'iniciado'; txId: string; estadoWompi: string }
  | { tipo: 'sin_tx_id' }
  | { tipo: 'rechazado'; motivo: string }
  | { tipo: 'desconocido'; motivo: string }

export const MOTIVO_DESCONOCIDO = 'resultado desconocido'
export const MOTIVO_SIN_TX_ID = 'sin tx id en la respuesta'

/** `excepcion` = el POST lanzo (no deberia: pedir() no lanza). */
export function clasificarPost(
  r: ResultadoWompi<TransaccionWompi> | { excepcion: true }
): ResultadoPost {
  if ('excepcion' in r) return { tipo: 'desconocido', motivo: MOTIVO_DESCONOCIDO }
  if (!r.ok) {
    if (r.status === 0 || r.status >= 500) return { tipo: 'desconocido', motivo: MOTIVO_DESCONOCIDO }
    return { tipo: 'rechazado', motivo: motivoCorto(`transactions ${r.status} ${r.mensaje}`) }
  }
  const txId = r.datos?.id
  if (!esIdTransaccionValido(txId)) return { tipo: 'sin_tx_id' }
  return { tipo: 'iniciado', txId, estadoWompi: typeof r.datos?.status === 'string' ? r.datos.status : 'sin estado' }
}
