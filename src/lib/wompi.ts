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

// ── Referencia de un COBRO AUTOMATICO (F4.c-5) ───────────────────────────
// MISMA forma de 5 segmentos, pero el ultimo NO es Date.now(): es
// 'auto<plan_expira>', o sea el PERIODO DE FACTURACION que se esta pagando.
//
// Por que determinista: el spike (F4.c-2/Q2) probo que Wompi RECHAZA una
// referencia repetida (422 "La referencia ya ha sido usada"). Con esta forma,
// una corrida duplicada del cron -> mismo periodo -> MISMA referencia -> 422 en
// vez de un segundo cobro. Es la red de seguridad del lado de Wompi, encima del
// latch local (ultimo_cobro_periodo) y de la idempotencia por facturas.numero.
// Con Date.now() las tres redes se caen a la vez: cada corrida cobraria de nuevo.
//
// El sufijo 'auto' NO es decorativo: distingue un cobro nuestro de un pago
// manual por Checkout Web en logs y facturas, sin columna nueva.
// La fecha lleva guiones (no guion bajo), asi que sigue siendo UN solo segmento
// para split('_') y parsearReferencia la lee SIN CAMBIOS — el round-trip esta
// fijado por test, porque una referencia que el webhook no pueda parsear seria
// un cobro sin plan otorgado: el peor estado posible.
export function construirReferenciaAutomatica(p: {
  restauranteId: string
  plan: Plan
  periodo: Periodo
  /** plan_expira que se esta renovando, 'YYYY-MM-DD'. */
  periodoFacturado: string
}): string {
  return `sub_${p.restauranteId}_${p.plan}_${p.periodo}_auto${p.periodoFacturado}`
}

/** true si la referencia la emitio el cron de cobro automatico. Lo usa el
 *  webhook SOLO para elegir el copy del correo (renovacion vs cambio de plan);
 *  jamas para decidir si otorga el plan. */
export function esReferenciaAutomatica(reference: string): boolean {
  const parts = reference.split('_')
  return parts.length === 5 && parts[0] === 'sub' && parts[4].startsWith('auto')
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
  /** Solo en el payload del WEBHOOK (el GET /v1/transactions/{id} NO lo trae).
   *  Es el discriminador natural de un cobro contra fuente guardada (F4.c-2/Q2).
   *  Lo declara F4.c-4 porque ya hay evidencia de su forma; lo CONSUME F4.c-5. */
  payment_source_id?: number
}

/** Raiz del evento nequi_token.updated. NO es data.transaction: la raiz es
 *  distinta (verificado en el spike F4.c-2/Q4), y por eso el guard viejo del
 *  webhook lo dejaba caer despues de verificar bien la firma. */
export interface WompiNequiToken {
  id?: string
  status?: string
  phone_number?: string
  /** El API devuelve phone Y phone_number DUPLICADOS. Se lee phone_number. */
  phone?: string
}

export interface WompiEvento {
  event?: string
  data?: { transaction?: WompiTransaction; nequi_token?: WompiNequiToken }
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

// ── Enrolamiento Nequi (F4.c-4) ──────────────────────────────────────────

// Un numero de celular colombiano no se guarda completo en ninguna parte de
// nuestra base: Wompi ya lo tiene y nosotros solo necesitamos pintarlo. Se
// conservan los ULTIMOS 4 digitos, que es lo que el usuario reconoce.
// Defensivo con la entrada porque el valor puede venir del usuario (10 digitos
// limpios) o de public_data de Wompi (formato no garantizado).
export function enmascararTelefono(valor: string | null | undefined): string {
  const digitos = (valor ?? '').replace(/\D/g, '')
  if (digitos.length < 4) return '****'
  return `***${digitos.slice(-4)}`
}

// Un celular valido para Nequi: 10 digitos y empieza por 3 (misma regla que
// PhoneInput). Se revalida en el SERVER: la validacion del componente es UX,
// no una defensa.
export function telefonoNequiValido(valor: string | null | undefined): boolean {
  return /^3\d{9}$/.test((valor ?? '').replace(/\D/g, ''))
}

/** Metadatos de un acceptance token que SI se persisten. El JWT jamas. */
export interface ClaimsAceptacion {
  contract_id: number | null
  file_hash: string | null
  permalink: string | null
}

const CLAIMS_VACIOS: ClaimsAceptacion = { contract_id: null, file_hash: null, permalink: null }

// Lee los claims del acceptance token SIN verificar la firma, a proposito: el
// JWT llega por HTTPS desde la API de Wompi y aqui no se usa para autorizar
// nada — solo para EXTRAER los tres datos que hay que guardar como evidencia
// (contract_id, file_hash, permalink). El token en si es de un solo uso y
// caduca en 1 hora: guardarlo no probaria nada, por eso solo se guardan estos.
// Cualquier forma inesperada devuelve nulls en vez de reventar: perder un
// claim no puede tumbar un enrolamiento.
export function leerClaimsAceptacion(jwt: string | null | undefined): ClaimsAceptacion {
  const partes = (jwt ?? '').split('.')
  if (partes.length !== 3) return CLAIMS_VACIOS
  try {
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as Record<string, unknown>
    return {
      contract_id: typeof claims.contract_id === 'number' ? claims.contract_id : null,
      file_hash: typeof claims.file_hash === 'string' ? claims.file_hash : null,
      permalink: typeof claims.permalink === 'string' ? claims.permalink : null,
    }
  } catch {
    return CLAIMS_VACIOS
  }
}

/** Fila lista para insertar en consentimientos_pago. */
export interface FilaConsentimiento {
  restaurante_id: string
  fuente_pago_id: string | null
  evento: 'OTORGADO' | 'REVOCADO'
  politica_contract_id: number | null
  politica_file_hash: string | null
  politica_permalink: string | null
  datos_contract_id: number | null
  datos_file_hash: string | null
  datos_permalink: string | null
  motivo: string | null
  ip: string | null
  user_agent: string | null
}

// Arma la fila de la bitacora de consentimiento. Puro y testeable a proposito:
// es la unica evidencia que podemos exhibir de nuestra propia conducta (no
// existe endpoint para revocar una fuente en Wompi, F4.c-2), asi que su forma
// no puede depender de que una ruta se acuerde de llenar los campos.
export function construirConsentimiento(p: {
  restauranteId: string
  fuentePagoId?: string | null
  evento: 'OTORGADO' | 'REVOCADO'
  politica?: ClaimsAceptacion
  datos?: ClaimsAceptacion
  motivo?: string | null
  ip?: string | null
  userAgent?: string | null
}): FilaConsentimiento {
  const politica = p.politica ?? CLAIMS_VACIOS
  const datos = p.datos ?? CLAIMS_VACIOS
  return {
    restaurante_id: p.restauranteId,
    fuente_pago_id: p.fuentePagoId ?? null,
    evento: p.evento,
    politica_contract_id: politica.contract_id,
    politica_file_hash: politica.file_hash,
    politica_permalink: politica.permalink,
    datos_contract_id: datos.contract_id,
    datos_file_hash: datos.file_hash,
    datos_permalink: datos.permalink,
    motivo: p.motivo ?? null,
    ip: p.ip ?? null,
    user_agent: p.userAgent ?? null,
  }
}
