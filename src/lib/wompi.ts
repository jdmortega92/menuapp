import { createHash } from 'node:crypto'
import { fechaColombia } from './fechas'
import type { Plan } from '@/types'
import type { Periodo } from './planes'

// Helpers PUROS de la integracion Wompi (F4.a-2). Sin dependencias de
// Next/cookies: todo aqui es server-safe y unit-testeable. Los montos NUNCA
// se definen aqui (vienen de lib/planes); este modulo solo firma y arma.

// ── Firma de integridad del Checkout Web ─────────────────────────────────
// SHA-256 hex de: reference + amount_in_cents + currency + integrity_secret
// (orden exacto, sin separadores). La variante con expiration_time lo inserta
// como valor extra antes del secreto. El secreto llega por parametro y JAMAS
// se expone al navegador.
export function firmaIntegridad(p: {
  reference: string
  amountInCents: number
  currency: string
  secret: string
  expirationTime?: string
}): string {
  const base = p.expirationTime
    ? `${p.reference}${p.amountInCents}${p.currency}${p.expirationTime}${p.secret}`
    : `${p.reference}${p.amountInCents}${p.currency}${p.secret}`
  return createHash('sha256').update(base).digest('hex')
}

// ── Referencia unica (clave de idempotencia) ─────────────────────────────
// Formato: sub_<restauranteId>_<plan>_<periodo>_<timestamp>. El UUID de
// Supabase usa guiones (no guion bajo), asi que split('_') es reversible.
export function construirReferencia(p: {
  restauranteId: string
  plan: Plan
  periodo: Periodo
  now?: number
}): string {
  const ts = p.now ?? Date.now()
  return `sub_${p.restauranteId}_${p.plan}_${p.periodo}_${ts}`
}

// Inversa de construirReferencia. Devuelve null si la forma no calza o si el
// plan/periodo no son validos (defensa: solo se procesa lo que emitimos).
export function parsearReferencia(
  reference: string
): { restauranteId: string; plan: Plan; periodo: Periodo } | null {
  const parts = reference.split('_')
  if (parts.length !== 5 || parts[0] !== 'sub') return null
  const [, restauranteId, plan, periodo] = parts
  if (!restauranteId) return null
  if (plan !== 'basico' && plan !== 'pro') return null
  if (periodo !== 'mensual' && periodo !== 'anual') return null
  return { restauranteId, plan, periodo }
}

// ── URL del Checkout Web (redirect) ──────────────────────────────────────
// La clave 'signature:integrity' lleva dos puntos LITERALES; por eso armamos
// el query a mano (encodeURIComponent solo sobre los valores).
export function construirUrlCheckout(p: {
  publicKey: string
  currency: string
  amountInCents: number
  reference: string
  signature: string
  redirectUrl: string
  customerEmail?: string
}): string {
  const params: [string, string][] = [
    ['public-key', p.publicKey],
    ['currency', p.currency],
    ['amount-in-cents', String(p.amountInCents)],
    ['reference', p.reference],
    ['signature:integrity', p.signature],
    ['redirect-url', p.redirectUrl],
  ]
  if (p.customerEmail) params.push(['customer-data:email', p.customerEmail])
  const qs = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  return `https://checkout.wompi.co/p/?${qs}`
}

// ── Renovacion vs cambio de plan (F4.b-1) ────────────────────────────────
// RENOVACION = se compra EXACTAMENTE lo mismo que ya tiene la fila (mismo plan
// y mismo periodo). Solo en ese caso el tiempo pagado se acumula: pagar dos
// veces el mismo servicio jamas puede costarle dias al usuario.
// UPGRADE (otro plan) o CAMBIO DE PERIODO (mismo plan, otro periodo) = ciclo
// NUEVO desde hoy, sin prorrateo ni arrastre (decision F4, ROADMAP-FIXES.md:636).
export function esRenovacion(p: {
  plan: Plan
  periodo: Periodo
  planActual?: string | null
  periodoActual?: string | null
}): boolean {
  return p.plan === p.planActual && p.periodo === p.periodoActual
}

// Sirve como base solo una fecha BIEN FORMADA y aun vigente. La forma sola no
// basta: '2026-13-01' pasa el regex y, sumandole un mes, rodaria a 2027. Se
// validan tambien los rangos de mes y dia (comparacion lexicografica contra hoy
// = comparacion cronologica, porque ambas son 'YYYY-MM-DD').
function fechaBaseValida(valor: string | null | undefined, hoy: string): boolean {
  const ymd = (valor ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false
  const [, mes, dia] = ymd.split('-').map(Number)
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false
  return ymd >= hoy
}

// ── plan_expira en COT (America/Bogota) ──────────────────────────────────
// El webhook es el PRIMER escritor de plan_expira. Se calcula sobre una fecha
// calendario COT (via lib/fechas): +1 mes o +1 anio segun periodo, con clamp
// del dia al ultimo del mes destino (31 ene + 1 mes -> 28/29 feb).
// BASE del calculo: hoy, SALVO que llegue `extenderDesde` con un vencimiento
// aun vigente — ahi se suma sobre ESE dia y no sobre hoy, para no quemar los
// dias que al usuario le quedaban (F4.b-1, bug B). Quien decide si corresponde
// extender es el llamador via esRenovacion: este helper solo aplica la fecha que
// le den. Un valor vencido, ausente o malformado cae a hoy.
export function calcularPlanExpira(
  periodo: Periodo,
  desde: Date = new Date(),
  extenderDesde?: string | null
): string {
  const hoy = fechaColombia(desde)
  const base = fechaBaseValida(extenderDesde, hoy) ? extenderDesde!.slice(0, 10) : hoy
  const [y, m, d] = base.split('-').map(Number)
  let ty = y
  let tm = m
  if (periodo === 'anual') {
    ty = y + 1
  } else {
    tm = m + 1
    if (tm > 12) {
      tm = 1
      ty = y + 1
    }
  }
  // Dia 0 del mes destino (indice 1-based tm) = ultimo dia de ese mes.
  const ultimoDia = new Date(Date.UTC(ty, tm, 0)).getUTCDate()
  const td = Math.min(d, ultimoDia)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${ty}-${pad(tm)}-${pad(td)}`
}

// ── Verificacion de firma de eventos (webhook) ───────────────────────────
// NO se cablea la lista de campos: se lee event.signature.properties (array
// de dot-paths) y se resuelven EN ORDEN contra event.data. Wompi advierte que
// esa lista puede cambiar, asi que la resolucion dinamica es un requisito de
// correctitud. Concatenacion: valores + timestamp + events_secret -> SHA-256
// hex en MAYUSCULAS (como entrega Wompi en X-Event-Checksum).
export interface WompiTransaction {
  id?: string
  reference?: string
  status?: string
  amount_in_cents?: number
  currency?: string
  customer_email?: string
  payment_method_type?: string
}

export interface WompiEvento {
  event?: string
  data?: { transaction?: WompiTransaction }
  signature?: { properties?: string[]; checksum?: string }
  timestamp?: number
  environment?: string
}

function resolverPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)
}

export function calcularChecksumEvento(event: WompiEvento, secret: string): string {
  const props = event.signature?.properties ?? []
  const data = event.data
  const concatValores = props.map((p) => String(resolverPath(data, p))).join('')
  const cadena = `${concatValores}${event.timestamp}${secret}`
  return createHash('sha256').update(cadena).digest('hex').toUpperCase()
}
