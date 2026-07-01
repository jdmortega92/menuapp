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

// Código de día ('dom'…'sab') de "hoy" en Colombia. Derivado de la MISMA fecha COT que
// fechaColombia: el día de la semana de esa fecha calendario (getUTCDay sobre su
// medianoche UTC → índice 0=dom..6=sab). `d` es inyectable (default new Date()) para
// tests deterministas.
export function diaCodigoColombia(d: Date = new Date()): string {
  const diaSemana = new Date(`${ymdColombia(d)}T00:00:00Z`).getUTCDay()
  return ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'][diaSemana]
}
