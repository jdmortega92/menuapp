// Formateo de códigos de día ('lun'…'dom') a etiquetas. Unifica los antiguos
// formatDiasShort (admin /menu) y formatDiasFull (menú público).
const MAPA_DIAS: Record<string, [short: string, full: string]> = {
  lun: ['Lun', 'Lunes'], mar: ['Mar', 'Martes'], mie: ['Mié', 'Miércoles'], jue: ['Jue', 'Jueves'],
  vie: ['Vie', 'Viernes'], sab: ['Sáb', 'Sábado'], dom: ['Dom', 'Domingo'],
}

export function formatDias(dias: string[], style: 'short' | 'full'): string {
  const idx = style === 'short' ? 0 : 1
  return dias.map(d => MAPA_DIAS[d]?.[idx] || d).join(', ')
}
