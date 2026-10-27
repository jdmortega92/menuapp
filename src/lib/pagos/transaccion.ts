// Partes PURAS del camino "aplicar pago aprobado" (CIERRE 5a): sin red, sin DB,
// unit-testeables. Las usan el webhook (/api/wompi/eventos) y el retorno del
// checkout (/api/wompi/confirmar-pago) a traves de lib/pagos/aplicarTransaccion.

import { parsearReferencia, type WompiTransaction } from '@/lib/wompi'
import { centavosDe, type Periodo } from '@/lib/planes'
import type { Plan } from '@/types'

/** Id de transaccion de Wompi: tres bloques de digitos ('12147249-1792514092-65778'). */
const ID_TRANSACCION = /^\d+-\d+-\d+$/

export function esIdTransaccionValido(id: unknown): id is string {
  return typeof id === 'string' && id.length <= 64 && ID_TRANSACCION.test(id)
}

/** true solo si la referencia la emitimos nosotros Y es de ESE restaurante. */
export function referenciaEsDelRestaurante(reference: unknown, restauranteId: string): boolean {
  if (typeof reference !== 'string' || !restauranteId) return false
  return parsearReferencia(reference)?.restauranteId === restauranteId
}

export type MotivoMontoInvalido = 'monto' | 'moneda'

/** Defensa en profundidad antes de otorgar un plan: el monto debe ser el precio
 *  real del plan/periodo de la referencia, y la moneda, SI VIENE, debe ser COP
 *  (D-LOW-1). Una moneda AUSENTE no bloquea: Wompi Colombia solo opera en COP y
 *  el monto ya se valido (quien llama deja un warning). Devuelve null si
 *  cuadra, o el motivo si no. */
export function motivoMontoInvalido(
  tx: Pick<WompiTransaction, 'amount_in_cents' | 'currency'>,
  plan: Plan,
  periodo: Periodo
): MotivoMontoInvalido | null {
  if (tx.amount_in_cents !== centavosDe(plan, periodo)) return 'monto'
  if (tx.currency !== undefined && tx.currency !== null && tx.currency !== 'COP') return 'moneda'
  return null
}

/** Resultado del camino compartido. */
export type ResultadoAplicar =
  /** planAnterior: el plan de la fila leido ANTES del RPC, tal cual (null si no
   *  vino). Sin default a 'gratis': de este valor depende el aviso de desbloqueo. */
  | { tipo: 'aplicado'; plan: Plan; periodo: Periodo; planAnterior: string | null; planExpira: string }
  | { tipo: 'duplicado' }
  | { tipo: 'conflicto' }
  | { tipo: 'monto_invalido' }
  | { tipo: 'referencia_invalida' }
  | { tipo: 'restaurante_inexistente' }
  | { tipo: 'error' }

/** Respuesta HTTP del WEBHOOK para cada resultado: exactamente la de antes de
 *  la extraccion (200 donde reintentar no arregla nada, 500 donde Wompi debe
 *  reintentar). */
export function respuestaWebhook(r: ResultadoAplicar): { status: number; body: Record<string, unknown> } {
  switch (r.tipo) {
    case 'aplicado':
      return { status: 200, body: { recibido: true, plan: r.plan } }
    case 'duplicado':
      return { status: 200, body: { recibido: true, idempotente: true } }
    case 'monto_invalido':
    case 'referencia_invalida':
    case 'restaurante_inexistente':
      return { status: 200, body: { recibido: true } }
    case 'conflicto':
    case 'error':
      return { status: 500, body: { error: 'DB' } }
  }
}

export type EstadoRetorno = 'aprobado' | 'pendiente' | 'rechazado' | 'error'

/** Estado que ve /suscripcion al volver del checkout, para una transaccion
 *  APPROVED ya pasada por el camino compartido. 'conflicto' es pendiente: la
 *  fila cambio en medio y el webhook reintenta sobre la fila nueva. */
export function estadoRetornoDeResultado(r: ResultadoAplicar): EstadoRetorno {
  if (r.tipo === 'aplicado' || r.tipo === 'duplicado') return 'aprobado'
  if (r.tipo === 'conflicto') return 'pendiente'
  return 'error'
}

/** Estado de retorno para una transaccion que NO es APPROVED. */
export function estadoRetornoDeStatus(status: unknown): EstadoRetorno {
  if (status === 'DECLINED' || status === 'VOIDED' || status === 'ERROR') return 'rechazado'
  return 'pendiente' // PENDING u otro no final
}
