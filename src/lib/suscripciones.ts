// ── Reglas puras del ciclo de vida de la suscripcion (F4.b-2) ──
// Deciden QUE le toca a una fila; no tocan DB, red ni reloj: la fecha de "hoy"
// entra por parametro (siempre fechaColombia(), COT). Asi el cron es testeable
// sin mockear tiempo y la regla no puede divergir entre sitios.
//
// Todas las comparaciones son entre strings 'YYYY-MM-DD': ordenarlos
// lexicograficamente ES ordenarlos cronologicamente, y no hay Date de por medio
// que pueda arrastrar el huso del servidor (familia BL.29 — Vercel Cron corre en
// UTC, y entre 00:00 y 04:59 UTC el dia UTC ya es el SIGUIENTE en Colombia).

// Normaliza lo que devuelve Postgres ('2026-08-27' o
// '2026-08-27T00:00:00+00:00') a la fecha calendario 'YYYY-MM-DD'. Devuelve ''
// si no calza o si mes/dia estan fuera de rango: la forma sola no basta,
// '2026-13-01' pasa el regex y compararia como fecha real.
export function fechaCalendario(valor: string | null | undefined): string {
  const ymd = (valor ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ''
  const [, mes, dia] = ymd.split('-').map(Number)
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return ''
  return ymd
}

// Un cambio agendado se aplica cuando SU fecha ya llego: <=, no ==. El cron es
// best-effort (Vercel no reintenta y puede saltarse una corrida), asi que cada
// pasada tiene que barrer TODO lo vencido, no solo lo de hoy.
export function cambioProgramadoVencido(
  fechaCambio: string | null | undefined,
  hoy: string
): boolean {
  const fecha = fechaCalendario(fechaCambio)
  if (!fecha) return false
  return fecha <= hoy
}

// Un plan pago vence cuando su fecha YA PASO: < estricto. El dia del
// vencimiento todavia es del usuario (pago hasta el final de ese dia).
// Sin fecha valida no se expira nada: es preferible dejar un plan de mas que
// quitarle a alguien lo que pago por un dato sucio.
export function debeExpirar(
  plan: string | null | undefined,
  planExpira: string | null | undefined,
  hoy: string
): boolean {
  if (!plan || plan === 'gratis') return false
  const fecha = fechaCalendario(planExpira)
  if (!fecha) return false
  return fecha < hoy
}
