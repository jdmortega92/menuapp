// Fechas calendario en la zona horaria de Colombia (America/Bogota) vía Intl. Colombia
// es permanentemente UTC-5 (sin horario de verano desde 1993), así que el resultado es
// byte-idéntico al antiguo offset absoluto de -5h que vivía aquí. Este módulo ES el fix
// semántico de esa fase (Refactor 5a / BL.29): mismo string 'YYYY-MM-DD' y mismo código
// de día, pero expresado como zona horaria real en vez de un offset calculado a mano.
// Deuda restante FUERA de este módulo (mecánicas distintas, NO tocadas aquí): el offset
// inline del heatmap (dashboard/page.tsx horaColombia/diaColombia), los getters LOCALES
// de lunesSemana (lib/dashboardWindow.ts) y el reloj local de visibilidad
// (useMenuVisibility / lib/visibility).

// Formateador reutilizable: extraemos año/mes/día por tipo con formatToParts (NO
// toLocaleDateString con locale string, cuyo separador/forma varía entre versiones de
// ICU). month/day '2-digit' garantizan el zero-padding de 'YYYY-MM-DD'.
const bogotaYmdFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function ymdColombia(d: Date): string {
  const parts = bogotaYmdFmt.formatToParts(d)
  const year = parts.find((p) => p.type === 'year')!.value
  const month = parts.find((p) => p.type === 'month')!.value
  const day = parts.find((p) => p.type === 'day')!.value
  return `${year}-${month}-${day}`
}

// Fecha calendario YYYY-MM-DD en Colombia (America/Bogota). Convención canónica de
// escritura de `fecha` (BL.29): independiente del huso del navegador.
export function fechaColombia(d: Date = new Date()): string {
  return ymdColombia(d)
}

// Meses en español para el formato humano. Array literal a propósito: la misma razón
// que arriba (toLocaleDateString con locale string varía entre versiones de ICU, y
// aquí además cambiaría de mayúscula/abreviatura según la plataforma).
const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

// Fecha humana en español ('27 de agosto de 2026') a partir de una fecha CALENDARIO.
// Para strings se toma el prefijo 'YYYY-MM-DD' TAL CUAL, sin reinterpretarlo como
// instante: plan_expira se escribe como '2026-08-27' (lib/wompi calcularPlanExpira,
// ya en COT) y Postgres lo devuelve como '2026-08-27T00:00:00+00:00'; convertir ese
// instante a America/Bogota daría el 26 (medianoche UTC = 19:00 COT del día anterior).
// Un Date sí se resuelve por zona horaria, vía ymdColombia. Devuelve '' si no calza.
export function fechaLargaColombia(valor: string | Date): string {
  const ymd = typeof valor === 'string' ? valor.slice(0, 10) : ymdColombia(valor)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ''
  const [ano, mes, dia] = ymd.split('-').map(Number)
  const nombreMes = MESES_ES[mes - 1]
  if (!nombreMes || dia < 1 || dia > 31) return ''
  return `${dia} de ${nombreMes} de ${ano}`
}

// Código de día ('dom'…'sab') de "hoy" en Colombia. Derivado de la MISMA fecha COT que
// fechaColombia: el día de la semana de esa fecha calendario (getUTCDay sobre su
// medianoche UTC → índice 0=dom..6=sab). `d` es inyectable (default new Date()) para
// tests deterministas.
export function diaCodigoColombia(d: Date = new Date()): string {
  const diaSemana = new Date(`${ymdColombia(d)}T00:00:00Z`).getUTCDay()
  return ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'][diaSemana]
}
