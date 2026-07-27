// Pin de zona horaria ANTES de importar: ambas implementaciones (la actual -5h y la de
// Intl/America-Bogota que llega en Commit 2) son TZ-independientes, así que UTC es el
// entorno honesto y determinista. Node refresca la tz al asignar process.env.TZ.
process.env.TZ = 'UTC'

import { describe, it, expect } from 'vitest'
import { fechaColombia, diaCodigoColombia, fechaLargaColombia } from './fechas'

// Oráculo legacy: la expresión -5h EXACTA que vive hoy en fechas.ts. El swap de
// Commit 2 debe reproducir esto byte a byte para toda hora → este archivo lo congela.
const fechaColombiaLegacy = (d: Date): string =>
  new Date(d.getTime() - 5 * 60 * 60 * 1000).toISOString().split('T')[0]
const diaCodigoLegacy = (d: Date): string =>
  ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'][new Date(d.getTime() - 5 * 60 * 60 * 1000).getDay()]

describe('fechaColombia', () => {
  // ── 1) Frontera de 24h sobre una fecha fija (COT = UTC-5) ──
  // 00:00–04:59 UTC caen en el día COT ANTERIOR; 05:00–23:59 UTC en el mismo día.
  describe('frontera de día sobre 2026-03-15', () => {
    it('00:00Z → día COT anterior', () => {
      expect(fechaColombia(new Date('2026-03-15T00:00:00Z'))).toBe('2026-03-14')
    })
    it('04:00Z → día COT anterior', () => {
      expect(fechaColombia(new Date('2026-03-15T04:00:00Z'))).toBe('2026-03-14')
    })
    it('04:59Z → día COT anterior (última hora antes del cruce)', () => {
      expect(fechaColombia(new Date('2026-03-15T04:59:59Z'))).toBe('2026-03-14')
    })
    it('05:00Z → mismo día COT (medianoche COT exacta)', () => {
      expect(fechaColombia(new Date('2026-03-15T05:00:00Z'))).toBe('2026-03-15')
    })
    it('12:00Z → mismo día COT', () => {
      expect(fechaColombia(new Date('2026-03-15T12:00:00Z'))).toBe('2026-03-15')
    })
    it('23:59Z → mismo día COT', () => {
      expect(fechaColombia(new Date('2026-03-15T23:59:59Z'))).toBe('2026-03-15')
    })
  })

  // ── 2) Cruces de mes y de año ──
  describe('cruces de mes y de año', () => {
    it('mes: 2026-07-01T02:00Z → 2026-06-30 (madrugada COT del último día de junio)', () => {
      expect(fechaColombia(new Date('2026-07-01T02:00:00Z'))).toBe('2026-06-30')
    })
    it('mes: 2026-07-01T05:00Z → 2026-07-01', () => {
      expect(fechaColombia(new Date('2026-07-01T05:00:00Z'))).toBe('2026-07-01')
    })
    it('año: 2026-01-01T03:00Z → 2025-12-31', () => {
      expect(fechaColombia(new Date('2026-01-01T03:00:00Z'))).toBe('2025-12-31')
    })
    it('año: 2026-01-01T05:00Z → 2026-01-01', () => {
      expect(fechaColombia(new Date('2026-01-01T05:00:00Z'))).toBe('2026-01-01')
    })
  })

  // ── 3) Sin DST: offset CONSTANTE en invierno y verano del hemisferio norte ──
  // Si hubiera un desplazamiento estacional, enero y julio diferirían a la misma hora.
  describe('offset constante (Colombia no tiene DST)', () => {
    it('2026-01-15T04:59Z rueda al día anterior', () => {
      expect(fechaColombia(new Date('2026-01-15T04:59:00Z'))).toBe('2026-01-14')
    })
    it('2026-07-15T04:59Z rueda al día anterior (misma regla que enero)', () => {
      expect(fechaColombia(new Date('2026-07-15T04:59:00Z'))).toBe('2026-07-14')
    })
    it('2026-01-15T05:00Z y 2026-07-15T05:00Z ambos son el mismo día', () => {
      expect(fechaColombia(new Date('2026-01-15T05:00:00Z'))).toBe('2026-01-15')
      expect(fechaColombia(new Date('2026-07-15T05:00:00Z'))).toBe('2026-07-15')
    })
  })

  // ── 4) Guardia de paridad byte a byte contra el oráculo legacy, hora por hora ──
  // La red más fuerte: cada una de las 24h sobre varias fechas (incluye cruces de mes
  // y año) debe coincidir con la expresión -5h actual. Commit 2 debe pasar esto igual.
  describe('paridad byte a byte vs oráculo -5h legacy (24h × varias fechas)', () => {
    const fechasBase = ['2026-03-15', '2026-07-01', '2026-01-01', '2024-02-29', '2026-12-31']
    for (const base of fechasBase) {
      for (let h = 0; h < 24; h++) {
        const hh = String(h).padStart(2, '0')
        const iso = `${base}T${hh}:30:00Z`
        it(`fechaColombia(${iso}) === legacy`, () => {
          const d = new Date(iso)
          expect(fechaColombia(d)).toBe(fechaColombiaLegacy(d))
        })
      }
    }
  })
})

describe('fechaLargaColombia', () => {
  // ── 1) El caso de producción: plan_expira leído de Postgres ──
  // La columna devuelve el timestamptz de la fecha que escribió el webhook. El
  // formato debe conservar el DÍA CALENDARIO (27), no convertir el instante a COT
  // (que daría 26, porque medianoche UTC son las 19:00 del día anterior en Bogotá).
  it('ISO con offset +00:00 → conserva el día calendario', () => {
    expect(fechaLargaColombia('2026-08-27T00:00:00+00:00')).toBe('27 de agosto de 2026')
  })
  it('ISO con Z → conserva el día calendario (mismo no-off-by-one)', () => {
    expect(fechaLargaColombia('2026-08-27T00:00:00Z')).toBe('27 de agosto de 2026')
  })
  it('YYYY-MM-DD pelado (lo que escribe calcularPlanExpira)', () => {
    expect(fechaLargaColombia('2026-08-27')).toBe('27 de agosto de 2026')
  })

  // ── 2) Bordes de día y de mes ──
  it('día 1 sin cero a la izquierda', () => {
    expect(fechaLargaColombia('2026-01-01')).toBe('1 de enero de 2026')
  })
  it('día 31 en diciembre', () => {
    expect(fechaLargaColombia('2026-12-31')).toBe('31 de diciembre de 2026')
  })
  it('29 de febrero de un año bisiesto', () => {
    expect(fechaLargaColombia('2024-02-29')).toBe('29 de febrero de 2024')
  })
  it('cubre los 12 meses', () => {
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0')
      expect(fechaLargaColombia(`2026-${mm}-15`)).toMatch(/^15 de \S+ de 2026$/)
    }
  })

  // ── 3) Un Date sí se resuelve por zona horaria (America/Bogota) ──
  it('Date 04:59Z → día COT anterior', () => {
    expect(fechaLargaColombia(new Date('2026-08-27T04:59:00Z'))).toBe('26 de agosto de 2026')
  })
  it('Date 05:00Z → mismo día COT', () => {
    expect(fechaLargaColombia(new Date('2026-08-27T05:00:00Z'))).toBe('27 de agosto de 2026')
  })

  // ── 4) Entrada inválida → '' (la UI cae a su texto de respaldo) ──
  it.each(['', 'no-es-fecha', '2026-13-01', '2026-00-10', '2026-08-00', '27/08/2026'])(
    '%o → cadena vacía',
    (entrada) => {
      expect(fechaLargaColombia(entrada)).toBe('')
    }
  )
})

describe('diaCodigoColombia', () => {
  // 2026-07-01T02:00Z en COT = martes 30 de junio; 05:00Z = miércoles 1 de julio.
  it('02:00Z → mar (martes COT, día anterior)', () => {
    expect(diaCodigoColombia(new Date('2026-07-01T02:00:00Z'))).toBe('mar')
  })
  it('05:00Z → mie (miércoles COT, cruzó a medianoche)', () => {
    expect(diaCodigoColombia(new Date('2026-07-01T05:00:00Z'))).toBe('mie')
  })

  // Paridad byte a byte vs el oráculo getDay()-sobre-(d-5h), hora por hora.
  describe('paridad byte a byte vs oráculo -5h legacy (24h × varias fechas)', () => {
    const fechasBase = ['2026-03-15', '2026-07-01', '2026-01-01', '2026-12-31']
    for (const base of fechasBase) {
      for (let h = 0; h < 24; h++) {
        const hh = String(h).padStart(2, '0')
        const iso = `${base}T${hh}:30:00Z`
        it(`diaCodigoColombia(${iso}) === legacy`, () => {
          const d = new Date(iso)
          expect(diaCodigoColombia(d)).toBe(diaCodigoLegacy(d))
        })
      }
    }
  })
})
