import { calcularPlanExpira } from './planExpira'
import { fechaCalendario } from './suscripciones'
import { fechaColombia } from './fechas'
import { ORDEN_PLANES, PLANES, precioDe, type Periodo } from './planes'
import type { Plan } from '@/types'

// ── Cambios de plan justos (CIERRE 6a) ───────────────────────────────────
// Reglas PURAS (sin red, sin DB, sin node:crypto) para que /suscripcion, el
// checkout y el camino compartido del pago usen LA MISMA cuenta:
//   - SUBIDA (otro plan mayor, o mismo plan mensual -> anual): se cobra el plan
//     nuevo completo hoy y el valor no usado del plan pago vigente se convierte
//     en dias extra del plan nuevo. Sin cobros parciales en Wompi: el credito
//     son DIAS, no plata, asi que la factura sigue siendo el precio de lista.
//   - BAJADA (plan menor, o mismo plan anual -> mensual): no se cobra mientras
//     quede tiempo pagado; el checkout la rechaza y la UI explica que se elige
//     al vencer. Agendarla de verdad es el cierre 6b.
//   - RENOVACION (mismo plan y periodo): sin cambios, suma sobre plan_expira.
//   - Desde gratis o con el plan vencido: sin credito, ciclo nuevo desde hoy.

/** Largo NOMINAL de cada periodo para el precio diario. Los dias restantes son
 *  calendario real; esto solo convierte precio en precio por dia. */
export const DIAS_PERIODO: Record<Periodo, number> = { mensual: 30, anual: 365 }

const PLANES_PAGOS = new Set<string>(['basico', 'pro'])
const PERIODOS = new Set<string>(['mensual', 'anual'])

/** La fila de restaurantes en la forma minima que necesitan estas reglas. */
export interface EstadoPlan {
  plan?: string | null
  periodo?: string | null
  planExpira?: string | null
}

/** Lo que se quiere comprar o elegir. */
export interface Objetivo {
  plan: Plan
  periodo: Periodo
}

/** Suma dias a una fecha calendario 'YYYY-MM-DD'. '' si la entrada no sirve.
 *  Date.UTC solo como aritmetica de calendario (mismo criterio que restarDias). */
export function sumarDias(valor: string | null | undefined, dias: number): string {
  const fecha = fechaCalendario(valor)
  if (!fecha) return ''
  const [y, m, d] = fecha.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + dias))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** Dias calendario que le quedan al plan: plan_expira - hoy. 0 si ya vencio,
 *  si vence hoy o si la fecha no sirve (sin dato no se inventa credito). */
export function diasRestantes(planExpira: string | null | undefined, hoy: string): number {
  const expira = fechaCalendario(planExpira)
  const base = fechaCalendario(hoy)
  if (!expira || !base || expira <= base) return 0
  const [ey, em, ed] = expira.split('-').map(Number)
  const [hy, hm, hd] = base.split('-').map(Number)
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(hy, hm - 1, hd)) / 86_400_000)
}

/** Dias extra del plan nuevo que valen lo que no se uso del plan pago vigente:
 *  floor(restantes * precioDiarioViejo / precioDiarioNuevo), en enteros para no
 *  arrastrar error de coma flotante. 0 desde gratis, con el plan vencido, sin
 *  datos validos o si es el mismo plan y periodo (eso es renovacion). floor:
 *  la conversion nunca entrega mas valor del que se pago. */
export function diasCredito(actual: EstadoPlan, nuevo: Objetivo, hoy: string): number {
  if (!actual.plan || !PLANES_PAGOS.has(actual.plan)) return 0
  if (!actual.periodo || !PERIODOS.has(actual.periodo)) return 0
  if (!PLANES_PAGOS.has(nuevo.plan)) return 0
  const planViejo = actual.plan as Plan
  const periodoViejo = actual.periodo as Periodo
  if (planViejo === nuevo.plan && periodoViejo === nuevo.periodo) return 0
  const rem = diasRestantes(actual.planExpira, hoy)
  if (rem <= 0) return 0
  const precioViejo = precioDe(planViejo, periodoViejo)
  const precioNuevo = precioDe(nuevo.plan, nuevo.periodo)
  if (precioViejo <= 0 || precioNuevo <= 0) return 0
  return Math.floor(
    (rem * precioViejo * DIAS_PERIODO[nuevo.periodo]) / (DIAS_PERIODO[periodoViejo] * precioNuevo)
  )
}

export type ClaseCambio =
  | 'renovacion'
  | 'desde_gratis'
  | 'subida'
  | 'a_anual'
  | 'bajada'
  | 'a_mensual'
  | 'cancelar'

function planPagoVigente(actual: EstadoPlan, hoy: string): boolean {
  if (!actual.plan || !PLANES_PAGOS.has(actual.plan)) return false
  // Sin plan_expira el plan pago se da por activo (filas anteriores al
  // webhook, mismo criterio que /suscripcion); con una fecha ya pasada, no.
  if (!actual.planExpira) return true
  const expira = fechaCalendario(actual.planExpira)
  return Boolean(expira) && expira >= hoy
}

/** Que es pasar de la fila actual al objetivo. El nivel del plan decide
 *  primero; el periodo desempata solo con el mismo plan. */
export function clasificarCambio(actual: EstadoPlan, objetivo: Objetivo, hoy: string): ClaseCambio {
  const planActual = actual.plan && ORDEN_PLANES.includes(actual.plan as Plan) ? (actual.plan as Plan) : 'gratis'
  if (objetivo.plan === 'gratis') return planActual === 'gratis' ? 'renovacion' : 'cancelar'
  const periodoActual: Periodo = actual.periodo === 'anual' ? 'anual' : 'mensual'
  if (objetivo.plan === planActual && objetivo.periodo === periodoActual) return 'renovacion'
  if (!planPagoVigente({ ...actual, plan: planActual }, hoy)) return 'desde_gratis'
  const iActual = ORDEN_PLANES.indexOf(planActual)
  const iObjetivo = ORDEN_PLANES.indexOf(objetivo.plan)
  if (iObjetivo > iActual) return 'subida'
  if (iObjetivo < iActual) return 'bajada'
  return objetivo.periodo === 'anual' ? 'a_anual' : 'a_mensual'
}

/** true si el cambio tiene que esperar al vencimiento: una bajada o un paso a
 *  mensual con al menos un dia pagado por delante. El dia del vencimiento ya no
 *  espera (solo se perderia el resto de ese dia). */
export function esperaVencimiento(clase: ClaseCambio, actual: EstadoPlan, hoy: string): boolean {
  if (clase !== 'bajada' && clase !== 'a_mensual') return false
  return diasRestantes(actual.planExpira, hoy) >= 1
}

/** 'Pro mensual', 'Básico anual'. */
export function nombreConPeriodo(plan: Plan, periodo: Periodo): string {
  return `${PLANES[plan].nombre} ${periodo}`
}

/** Texto del boton de cada card. */
export function etiquetaPlan(clase: ClaseCambio, objetivo: Objetivo, actual: EstadoPlan): string {
  const nombre = PLANES[objetivo.plan].nombre
  switch (clase) {
    case 'renovacion':
      return 'Renovar'
    case 'cancelar':
      return 'Bajar a Gratis'
    case 'subida':
      return `Subir a ${nombre}`
    case 'a_anual':
      return 'Pasar a anual'
    case 'a_mensual':
      return 'Pasar a mensual'
    case 'bajada':
      return `Cambiar a ${nombre}`
    case 'desde_gratis':
      // Con el MISMO plan vencido (otro periodo), "Subir a" mentiria.
      return actual.plan === objetivo.plan ? `Elegir ${nombreConPeriodo(objetivo.plan, objetivo.periodo)}` : `Subir a ${nombre}`
  }
}

/** Lo que dice la hoja (y el 409 del checkout) cuando el cambio espera al
 *  vencimiento. NO promete un cambio agendado: eso no existe hasta 6b. */
export function textoEsperaVencimiento(actual: string, fechaLarga: string, objetivo: string): string {
  return `Tu plan ${actual} sigue activo hasta el ${fechaLarga}. Cuando venza podrás elegir ${objetivo}.`
}

/** Nuevo vencimiento de una compra, con el credito ya sumado. Es LA cuenta: la
 *  usan el camino compartido del pago (sobre la fila leida justo antes de
 *  aplicar_pago_aprobado) y la hoja de confirmacion (sobre la fila en
 *  pantalla). Renovacion: suma sobre plan_expira vigente, sin credito.
 *  Cualquier otra compra: ciclo nuevo desde hoy + diasCredito (0 desde gratis
 *  o con el plan vencido). Una bajada pagada igual (un checkout viejo) tambien
 *  conserva su valor: la plata ya entro y no se puede quemar. */
export function calcularVencimientoCompra(
  actual: EstadoPlan,
  compra: Objetivo,
  ahora: Date = new Date()
): { planExpira: string; diasCredito: number; renovacion: boolean } {
  const hoy = fechaColombia(ahora)
  const renovacion = actual.plan === compra.plan && actual.periodo === compra.periodo
  if (renovacion) {
    return { planExpira: calcularPlanExpira(compra.periodo, ahora, actual.planExpira ?? null), diasCredito: 0, renovacion }
  }
  const credito = diasCredito(actual, compra, hoy)
  const base = calcularPlanExpira(compra.periodo, ahora, null)
  return { planExpira: credito > 0 ? sumarDias(base, credito) : base, diasCredito: credito, renovacion }
}
