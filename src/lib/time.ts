export function formato12h(hora: string | null | undefined): string {
  if (!hora) return ''
  const partes = hora.split(':')
  const h24 = parseInt(partes[0])
  const mm = (partes[1] || '00').padStart(2, '0')
  if (isNaN(h24)) return ''
  const esPM = h24 >= 12
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  return `${h12}:${mm} ${esPM ? 'p.m.' : 'a.m.'}`
}
