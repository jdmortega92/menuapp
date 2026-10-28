// Reglas PURAS de la conciliacion del cobro automatico (CIERRE 5b): sin red,
// sin DB. El ejecutor (lib/pagos/conciliarCobros) solo lee, consulta y escribe
// lo que estas funciones deciden.
//
// Problema que resuelve (AUDIT C-3 / D-HIGH-4): el cron reclama el periodo
// (INICIADO) y Wompi responde 201 PENDING; si el webhook nunca llega, el cobro
// pudo entrar sin que nada lo vea. La conciliacion mira las filas INICIADO de
// hace mas de UNA HORA y pregunta por la transaccion con GET /transactions/{id}.
// JAMAS hace POST: conciliar es leer, nunca cobrar.

import { esIdTransaccionValido, type ResultadoAplicar } from './transaccion'
import {
  esReferenciaAutomatica,
  parsearReferencia,
  periodoDeReferenciaAutomatica,
  type WompiTransaction,
} from '@/lib/wompi'
import { fechaCalendario } from '@/lib/suscripciones'
import type { ResultadoWompi } from '@/lib/wompiApi'

/** Una fila INICIADO se concilia pasada una hora del reclamo: el APPROVED
 *  normal llega en segundos, asi que una hora sin desenlace ya es anomala. */
export const UMBRAL_CONCILIACION_MS = 60 * 60 * 1000

/** PENDING (o consulta que no responde) por mas de 7 dias: deja de esperarse
 *  y pasa a REVISION. Antes de eso se reintenta en la corrida siguiente. */
export const PLAZO_PENDIENTE_MS = 7 * 24 * 60 * 60 * 1000

/** Corte para el filtro SQL: ultimo_cobro_en < corte. */
export function corteConciliacion(ahora: Date): string {
  return new Date(ahora.getTime() - UMBRAL_CONCILIACION_MS).toISOString()
}

/** true si el reclamo tiene mas de 7 dias. Una fecha ilegible cuenta como
 *  vencida: mejor que la vea un humano que esperarla para siempre. */
export function plazoPendienteVencido(ultimoCobroEn: string | null | undefined, ahora: Date): boolean {
  const t = ultimoCobroEn ? Date.parse(ultimoCobroEn) : NaN
  if (Number.isNaN(t)) return true
  return ahora.getTime() - t > PLAZO_PENDIENTE_MS
}

/** Una fila que entro a REVISION en esta corrida, para la alerta al admin.
 *  Sin datos personales ni secretos: ids nuestros y de Wompi, y el motivo. */
export interface FilaRevision {
  restauranteId: string
  motivo: string
  referencia: string | null
  txId: string | null
}

/** Lo que la conciliacion necesita de la fila de fuentes_pago. */
export interface FilaConciliable {
  ultimo_cobro_tx_id: string | null
  ultimo_cobro_referencia: string | null
  ultimo_cobro_en: string | null
}

export type DecisionConciliacion =
  /** Consultar a Wompi por este id (GET, nunca POST). */
  | { accion: 'consultar'; txId: string }
  /** Aplicar el APPROVED por el camino compartido. */
  | { accion: 'aplicar'; transaccion: WompiTransaction }
  /** Rechazo definitivo: FALLIDO y correo al dueno (camino de fallo compartido). */
  | { accion: 'fallar'; estadoWompi: string }
  /** Ni exito ni fallo todavia: se vuelve a mirar en la corrida siguiente. */
  | { accion: 'esperar' }
  | { accion: 'revision'; motivo: string }

/** Primer paso, sin red: hay con que preguntarle a Wompi? Sin tx id (el proceso
 *  murio entre el reclamo y el POST, o la escritura del id fallo) no hay
 *  consulta posible: la busqueda por referencia queda para 5c. */
export function decidirInicio(fila: FilaConciliable): DecisionConciliacion {
  if (!fila.ultimo_cobro_tx_id) return { accion: 'revision', motivo: 'sin tx id' }
  if (!esIdTransaccionValido(fila.ultimo_cobro_tx_id)) return { accion: 'revision', motivo: 'tx id invalido' }
  return { accion: 'consultar', txId: fila.ultimo_cobro_tx_id }
}

// ── FACTURA PRIMERO ──────────────────────────────────────────────────────
// La factura con numero == referencia y estado 'aprobada' es la huella de un
// pago ya aplicado (la escribe aplicar_pago_aprobado junto con el plan). Si
// existe, el cobro YA prospero: solo falta la marca APROBADO, que es
// best-effort en el camino compartido y pudo fallar. En ese caso no hay guarda
// (plan_expira ya se movio, la guarda daria un falso 'estado cambio'), ni
// aplicar, ni alerta, ni correo. Por eso se mira ANTES que todo lo demas.

/** Resultado de leer facturas por numero. 'error' = la lectura fallo. */
export type FacturaLeida = 'aprobada' | 'otra' | 'ninguna' | 'error'

export function clasificarFactura(r: { error: unknown; data: { estado?: unknown } | null }): FacturaLeida {
  if (r.error) return 'error'
  if (!r.data) return 'ninguna'
  return r.data.estado === 'aprobada' ? 'aprobada' : 'otra'
}

export type DecisionFactura =
  /** Ya aplicado: escribir la marca APROBADO y nada mas. */
  | { accion: 'aprobar' }
  /** No se pudo leer: la fila sigue INICIADO para la corrida siguiente. */
  | { accion: 'reintentar' }
  /** No hay factura aprobada: seguir con la conciliacion normal. */
  | { accion: 'seguir' }

export function decidirPorFactura(f: FacturaLeida): DecisionFactura {
  if (f === 'aprobada') return { accion: 'aprobar' }
  if (f === 'error') return { accion: 'reintentar' }
  return { accion: 'seguir' }
}

/** Primer paso completo para una fila: factura, y solo sin factura aprobada,
 *  decidirInicio. `sin_referencia` = fila de antes de 5b: su factura se busca
 *  despues del GET, con la referencia de la transaccion ya verificada. */
export function decidirInicioConFactura(
  fila: FilaConciliable,
  factura: FacturaLeida | 'sin_referencia'
): DecisionConciliacion | { accion: 'aprobar' } | { accion: 'reintentar' } {
  if (factura !== 'sin_referencia') {
    const d = decidirPorFactura(factura)
    if (d.accion !== 'seguir') return d
  }
  return decidirInicio(fila)
}

/** Referencia con la que buscar la factura de una fila SIN referencia guardada:
 *  la de la transaccion, solo si es automatica, es de ESE restaurante y es del
 *  periodo que la fila reclamo. Si no, null (y decidirPorConsulta /
 *  decidirAntesDeAplicar se encargan). */
export function referenciaVerificada(
  tx: WompiTransaction | undefined,
  restauranteId: string,
  periodoFacturado: string
): string | null {
  const ref = tx?.reference
  if (typeof ref !== 'string' || !esReferenciaAutomatica(ref)) return null
  if (parsearReferencia(ref)?.restauranteId !== restauranteId) return null
  if (periodoDeReferenciaAutomatica(ref) !== periodoFacturado) return null
  return ref
}

/** Segundo paso: que hacer con la respuesta del GET. */
export function decidirPorConsulta(
  fila: FilaConciliable,
  consulta: ResultadoWompi<WompiTransaction>,
  ahora: Date
): DecisionConciliacion {
  const vencido = plazoPendienteVencido(fila.ultimo_cobro_en, ahora)

  if (!consulta.ok) {
    // Transitorio: se reintenta manana, hasta el plazo.
    if (consulta.status === 0 || consulta.status >= 500) {
      return vencido ? { accion: 'revision', motivo: 'consulta sin respuesta 7 dias' } : { accion: 'esperar' }
    }
    return { accion: 'revision', motivo: `consulta ${consulta.status}` }
  }

  const tx = consulta.datos
  if (!tx) return { accion: 'revision', motivo: 'consulta sin datos' }
  // La transaccion tiene que ser la nuestra: mismo id, y la referencia que
  // emitimos al reclamar (si la fila la tiene; las de antes de 5b no).
  if (tx.id !== fila.ultimo_cobro_tx_id) return { accion: 'revision', motivo: 'tx id no coincide' }
  if (typeof tx.reference !== 'string' || !esReferenciaAutomatica(tx.reference)) {
    return { accion: 'revision', motivo: 'referencia no automatica' }
  }
  if (fila.ultimo_cobro_referencia && tx.reference !== fila.ultimo_cobro_referencia) {
    return { accion: 'revision', motivo: 'referencia no coincide' }
  }

  switch (tx.status) {
    case 'APPROVED':
      return { accion: 'aplicar', transaccion: tx }
    case 'DECLINED':
    case 'VOIDED':
    case 'ERROR':
      return { accion: 'fallar', estadoWompi: tx.status }
    case 'PENDING':
      return vencido ? { accion: 'revision', motivo: 'pendiente 7 dias' } : { accion: 'esperar' }
    default:
      return { accion: 'revision', motivo: 'estado desconocido' }
  }
}

/** La fila de restaurantes, tal como esta AHORA. */
export interface EstadoRestaurante {
  plan?: string | null
  periodo_plan?: string | null
  plan_expira?: string | null
}

export const MOTIVO_ESTADO_CAMBIO = 'estado cambio'

/** Guarda ANTES de aplicar un APPROVED conciliado: el restaurante tiene que
 *  seguir en el estado en que se le cobro. plan y periodo_plan iguales a los
 *  de la referencia, y plan_expira igual al periodo facturado que la
 *  referencia lleva escrito. Si algo cambio (un upgrade manual, un cambio de
 *  periodo, otra renovacion, un vencimiento del barrido B) aplicar el cobro
 *  viejo encima otorgaria un plan que ya no corresponde: REVISION y nada se
 *  aplica. Desde CIERRE 6a el webhook y el retorno tambien pasan por aqui, a
 *  traves de decidirCobroAutomatico (C-15).
 *  Entre esta lectura y el RPC aplicar_pago_aprobado vuelve a exigir la fila
 *  como se leyo (MA409 -> conflicto -> se reintenta y esta guarda decide). */
export function decidirAntesDeAplicar(
  reference: string | undefined,
  restauranteId: string,
  rest: EstadoRestaurante
): { accion: 'aplicar' } | { accion: 'revision'; motivo: string } {
  const parsed = typeof reference === 'string' ? parsearReferencia(reference) : null
  const facturado = typeof reference === 'string' ? periodoDeReferenciaAutomatica(reference) : ''
  if (!parsed || !facturado) return { accion: 'revision', motivo: 'referencia no automatica' }
  if (parsed.restauranteId !== restauranteId) return { accion: 'revision', motivo: 'referencia ajena' }
  if (
    rest.plan !== parsed.plan ||
    rest.periodo_plan !== parsed.periodo ||
    fechaCalendario(rest.plan_expira) !== facturado
  ) {
    return { accion: 'revision', motivo: MOTIVO_ESTADO_CAMBIO }
  }
  return { accion: 'aplicar' }
}

export const MOTIVO_CAMBIO_AGENDADO = 'cambio agendado'

/** Guarda de TODO APPROVED con referencia automatica, por cualquier camino
 *  (CIERRE 6a). Lo de decidirAntesDeAplicar (C-15: un cobro viejo no pisa un
 *  upgrade manual) mas un cambio agendado pendiente: un cobro que el usuario
 *  no pidio no puede borrar su cancelacion (C-5; aplicar_pago_aprobado limpia
 *  plan_programado sin mirarlo). La ventana entre esta lectura y el RPC queda
 *  abierta hasta que el RPC exija plan_programado (cierre 6b). */
export function decidirCobroAutomatico(
  reference: string | undefined,
  restauranteId: string,
  rest: EstadoRestaurante & { plan_programado?: string | null }
): { accion: 'aplicar' } | { accion: 'revision'; motivo: string } {
  const d = decidirAntesDeAplicar(reference, restauranteId, rest)
  if (d.accion === 'revision') return d
  if (rest.plan_programado) return { accion: 'revision', motivo: MOTIVO_CAMBIO_AGENDADO }
  return d
}

/** Tercer paso, tras el camino compartido del APPROVED. 'aplicado' y
 *  'duplicado' ya dejaron la marca APROBADO (la escribe aplicarTransaccion). */
export type CierreAprobado = { accion: 'aprobada' } | { accion: 'esperar' } | { accion: 'revision'; motivo: string }

export function decidirTrasAplicar(r: ResultadoAplicar): CierreAprobado {
  switch (r.tipo) {
    case 'aplicado':
    case 'duplicado':
      return { accion: 'aprobada' }
    // La fila cambio en medio, o fallo la DB: la corrida siguiente recalcula.
    case 'conflicto':
    case 'error':
      return { accion: 'esperar' }
    // Plata cobrada sin plan otorgado: un humano.
    case 'monto_invalido':
      return { accion: 'revision', motivo: 'aprobado con monto invalido' }
    case 'referencia_invalida':
      return { accion: 'revision', motivo: 'aprobado con referencia invalida' }
    case 'restaurante_inexistente':
      return { accion: 'revision', motivo: 'aprobado sin restaurante' }
    // La guarda del camino compartido no aplico: la conciliacion marca y alerta
    // (con origen 'conciliacion' el camino compartido no escribe la marca).
    case 'estado_cambio':
      return { accion: 'revision', motivo: r.motivo }
  }
}
