import { fechaColombia } from './fechas'
import type { Periodo } from './planes'

// calcularPlanExpira vive en su propio modulo (CIERRE 4) y lib/wompi lo
// re-exporta sin cambios. Motivo: lib/wompi importa node:crypto y por eso es
// server-only, pero /suscripcion necesita la MISMA cuenta para anunciar el
// nuevo vencimiento de "Renovar". Una sola implementacion: la del webhook.

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
