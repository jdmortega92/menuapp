// Patrón -5h heredado (NO usa Intl a propósito): debe coincidir byte a byte con
// la convención de escritura existente en la DB. El fix semántico con
// America/Bogota es una fase futura (cambiar SOLO aquí).

// Fecha calendario YYYY-MM-DD en zona horaria Colombia (UTC-5). Convención
// canónica de escritura de `fecha` (BL.29): independiente del huso del
// navegador (no usa getTimezoneOffset).
export function fechaColombia(d: Date = new Date()): string {
  return new Date(d.getTime() - 5 * 60 * 60 * 1000).toISOString().split('T')[0]
}

// Código de día ('dom'…'sab') de "hoy" con el mismo offset Colombia.
// `d` es inyectable (default new Date()) para tests deterministas; mismo patrón que
// fechaColombia. La matemática -5h no cambia.
export function diaCodigoColombia(d: Date = new Date()): string {
  return ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'][new Date(d.getTime() - 5 * 60 * 60 * 1000).getDay()]
}
