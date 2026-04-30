export type DiaCodigo = 'lun' | 'mar' | 'mie' | 'jue' | 'vie' | 'sab' | 'dom'

const DIAS_POR_GETDAY: DiaCodigo[] = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']

export function isCurrentlyVisible(opts: {
  horaInicio?: string | null
  horaFin?: string | null
  dias?: string[] | null
  ahora?: Date
}): boolean {
  const ahora = opts.ahora ?? new Date()

  if (opts.dias && opts.dias.length > 0) {
    const codigoHoy = DIAS_POR_GETDAY[ahora.getDay()]
    if (!opts.dias.includes(codigoHoy)) return false
  }

  if (opts.horaInicio && opts.horaFin) {
    const inicio = opts.horaInicio.slice(0, 5)
    const fin = opts.horaFin.slice(0, 5)
    const horaActual = `${ahora.getHours().toString().padStart(2, '0')}:${ahora.getMinutes().toString().padStart(2, '0')}`
    if (inicio > fin) {
      if (!(horaActual >= inicio || horaActual <= fin)) return false
    } else {
      if (!(horaActual >= inicio && horaActual <= fin)) return false
    }
  }

  return true
}
