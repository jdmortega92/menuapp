// Pin de zona horaria ANTES de cualquier uso de Date: el test congela la salida bajo
// UTC, el entorno donde vivía el double-offset de BL.29 (un navegador NO-Colombia).
// Node intercepta la asignación a process.env.TZ y refresca la tz para los Date
// siguientes, así que este pin es determinista en CI.
//
// Por qué UTC y no America/Bogota: bajo UTC, fechaColombia (offset absoluto -5h) y los
// getters LOCALES de lunesSemana DIVERGEN del calendario local. Eso permite demostrar
// que la rama 'mes' deriva año/mes de hoyStr (COT) y NO de los getters locales (BL.29)
// — bajo Bogota (UTC-5) ambos coincidirían y la prueba sería vacua. Los valores aquí
// son un CONGELADO de regresión de la función extraída tal cual; en un navegador de
// Colombia lunesSemana se alinea con COT y la rama 'semana' no muestra el sesgo de -1
// día que se ve bajo UTC.
process.env.TZ = 'UTC'

import { describe, it, expect } from 'vitest'
import { computeDashboardWindow } from './dashboardWindow'

describe('computeDashboardWindow', () => {
  // ── Escenario 1: día de semana normal (miércoles), mediodía UTC ──
  // 2026-06-24T15:00Z = miércoles. COT (-5h) = 2026-06-24 10:00 → hoyStr 2026-06-24.
  describe("miércoles normal — 2026-06-24T15:00:00Z", () => {
    const ahora = new Date('2026-06-24T15:00:00Z')

    it("'hoy'", () => {
      const w = computeDashboardWindow('hoy', ahora)
      expect(w.hoyStr).toBe('2026-06-24')
      expect(w.desde).toBe('2026-06-24')
      expect(w.hasta).toBe('2026-06-24')
      expect(w.desdeAnterior).toBe('2026-06-23')
      expect(w.hastaAnterior).toBe('2026-06-23')
    })

    it("'semana' (Model B-fair: lunes..hoy vs lunes pasado..hace 7 días)", () => {
      const w = computeDashboardWindow('semana', ahora)
      // lunes de la semana = 2026-06-22 (mié - 2 días), a medianoche local (UTC)
      expect(w.lunesSemana.toISOString()).toBe('2026-06-22T00:00:00.000Z')
      expect(w.desde).toBe('2026-06-21')        // fechaColombia(lunes 00:00Z) = -5h → 21
      expect(w.hasta).toBe('2026-06-24')
      expect(w.desdeAnterior).toBe('2026-06-14') // fechaColombia(lunes-7d)
      expect(w.hastaAnterior).toBe('2026-06-17') // fechaColombia(hoy-7d)
    })

    it("'mes'", () => {
      const w = computeDashboardWindow('mes', ahora)
      expect(w.desde).toBe('2026-06-01')
      expect(w.hasta).toBe('2026-06-24')
      expect(w.desdeAnterior).toBe('2026-05-01')
      expect(w.hastaAnterior).toBe('2026-05-31') // mayo tiene 31 días
    })
  })

  // ── Escenario 2: madrugada COT + frontera de MES (el corazón de BL.29) ──
  // 2026-07-01T02:00Z. UTC-local = jueves... = 2026-07-01 (julio). Pero COT (-5h) =
  // 2026-06-30 21:00 → hoyStr 2026-06-30 (JUNIO). La rama 'mes' debe usar JUNIO.
  describe("madrugada COT / frontera de mes — 2026-07-01T02:00:00Z", () => {
    const ahora = new Date('2026-07-01T02:00:00Z')

    it("hoyStr cae en junio aunque UTC-local sea 1 de julio", () => {
      const w = computeDashboardWindow('hoy', ahora)
      expect(w.hoyStr).toBe('2026-06-30')
      expect(w.desde).toBe('2026-06-30')
      expect(w.hasta).toBe('2026-06-30')
      expect(w.desdeAnterior).toBe('2026-06-29')
      expect(w.hastaAnterior).toBe('2026-06-29')
    })

    it("'mes' deriva de hoyStr (junio), NO de getters locales (julio) — BL.29", () => {
      const w = computeDashboardWindow('mes', ahora)
      expect(w.desde).toBe('2026-06-01')          // junio, no '2026-07-01'
      expect(w.hasta).toBe('2026-06-30')
      expect(w.desdeAnterior).toBe('2026-05-01')
      expect(w.hastaAnterior).toBe('2026-05-31')
    })

    it("'semana'", () => {
      const w = computeDashboardWindow('semana', ahora)
      // getDay() local (UTC) de 2026-07-01 = miércoles → lunes = 2026-06-29
      expect(w.lunesSemana.toISOString()).toBe('2026-06-29T00:00:00.000Z')
      expect(w.desde).toBe('2026-06-28')
      expect(w.hasta).toBe('2026-06-30')
      expect(w.desdeAnterior).toBe('2026-06-21')
      expect(w.hastaAnterior).toBe('2026-06-23')
    })
  })

  // ── Escenario 3: frontera de semana — lunes (BL.30) ──
  // 2026-06-29T15:00Z = lunes. diasDesdeLunesSem = 0 → lunesSemana = hoy a medianoche.
  describe("frontera de semana (lunes) — 2026-06-29T15:00:00Z", () => {
    const ahora = new Date('2026-06-29T15:00:00Z')

    it("'semana' arranca en el propio lunes", () => {
      const w = computeDashboardWindow('semana', ahora)
      expect(w.lunesSemana.toISOString()).toBe('2026-06-29T00:00:00.000Z')
      expect(w.hoyStr).toBe('2026-06-29')
      expect(w.desde).toBe('2026-06-28')        // fechaColombia(lunes 00:00Z)
      expect(w.hasta).toBe('2026-06-29')
      expect(w.desdeAnterior).toBe('2026-06-21')
      expect(w.hastaAnterior).toBe('2026-06-22')
    })
  })

  // ── Escenario 4: 'mes' día 1 ──
  // 2026-06-01T15:00Z. desde == hasta == primer día del mes.
  describe("'mes' día 1 — 2026-06-01T15:00:00Z", () => {
    const ahora = new Date('2026-06-01T15:00:00Z')

    it("desde y hasta son el mismo día 01", () => {
      const w = computeDashboardWindow('mes', ahora)
      expect(w.hoyStr).toBe('2026-06-01')
      expect(w.desde).toBe('2026-06-01')
      expect(w.hasta).toBe('2026-06-01')
      expect(w.desdeAnterior).toBe('2026-05-01')
      expect(w.hastaAnterior).toBe('2026-05-31')
    })
  })
})
