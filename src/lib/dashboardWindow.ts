import { fechaColombia } from './fechas'

export type Periodo = 'hoy' | 'semana' | 'mes'

export interface DashboardWindow {
  desde: string
  hasta: string
  desdeAnterior: string
  hastaAnterior: string
  lunesSemana: Date
  hoyStr: string
}

// Extracción VERBATIM de la ventana de fechas del dashboard (antes inline en
// src/app/dashboard/page.tsx L63-110). NO cambia ninguna semántica:
//  - Base COT vía fechaColombia (BL.29): ventanas calendario en UTC-5,
//    independientes del huso del navegador (offset absoluto, no usa getTimezoneOffset).
//  - lunesSemana / semana "Model B-fair" (BL.30): usa getters LOCALES del navegador
//    (getDay, getDate, setHours) — se preserva tal cual; en un navegador de Colombia
//    (UTC-5) coincide con COT.
//  - Rama 'mes' (BL.29): año/mes se derivan de hoyStr (COT), NO de getters locales,
//    para robustez total de huso horario.
// `ahora` es inyectable para tests deterministas; el call site de producción pasa
// new Date(). La función no tiene efectos secundarios sobre `ahora` (lunesSemana se
// muta sobre una copia `new Date(hoy)`).
export function computeDashboardWindow(periodo: Periodo, ahora: Date): DashboardWindow {
  const hoy = ahora
  const hoyStr = fechaColombia(hoy)
  let desde = ''
  let hasta = hoyStr
  let desdeAnterior = ''
  let hastaAnterior = ''

  const diaHoy = hoy.getDay()
  const diasDesdeLunesSem = diaHoy === 0 ? 6 : diaHoy - 1
  const lunesSemana = new Date(hoy)
  lunesSemana.setDate(hoy.getDate() - diasDesdeLunesSem)
  lunesSemana.setHours(0, 0, 0, 0)

  if (periodo === 'hoy') {
    desde = hoyStr
    hasta = hoyStr
    const ayer = fechaColombia(new Date(hoy.getTime() - 24 * 60 * 60 * 1000))
    desdeAnterior = ayer
    hastaAnterior = ayer
  } else if (periodo === 'semana') {
    desde = fechaColombia(lunesSemana)
    hasta = hoyStr
    desdeAnterior = fechaColombia(new Date(lunesSemana.getTime() - 7 * 24 * 60 * 60 * 1000))
    hastaAnterior = fechaColombia(new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000))
  } else {
    const [cy, cm] = hoyStr.split('-') // 'YYYY-MM-DD' en COT
    const cmNum = parseInt(cm, 10)
    const cyNum = parseInt(cy, 10)
    desde = `${cy}-${cm}-01`
    hasta = hoyStr

    const mesAnterior = cmNum === 1 ? 12 : cmNum - 1
    const yearAnterior = cmNum === 1 ? cyNum - 1 : cyNum
    const mmAnterior = String(mesAnterior).padStart(2, '0')
    const ultimoDiaMesAnterior = new Date(yearAnterior, mesAnterior, 0).getDate()
    desdeAnterior = `${yearAnterior}-${mmAnterior}-01`
    hastaAnterior = `${yearAnterior}-${mmAnterior}-${String(ultimoDiaMesAnterior).padStart(2, '0')}`
  }

  return { desde, hasta, desdeAnterior, hastaAnterior, lunesSemana, hoyStr }
}
