// Pin de zona horaria ANTES de importar: las reglas son puras y TZ-independientes
// (comparan strings), y este pin lo demuestra — con TZ=UTC, que es justamente el
// huso en que corre Vercel Cron, los resultados siguen siendo los de Colombia.
process.env.TZ = 'UTC'

import { describe, it, expect } from 'vitest'
import { fechaCalendario, cambioProgramadoVencido, debeExpirar } from './suscripciones'

const HOY = '2026-07-27'

describe('fechaCalendario', () => {
  it('acepta YYYY-MM-DD pelado', () => {
    expect(fechaCalendario('2026-08-27')).toBe('2026-08-27')
  })
  it('recorta el timestamptz que devuelve Postgres', () => {
    expect(fechaCalendario('2026-08-27T00:00:00+00:00')).toBe('2026-08-27')
  })
  it.each([null, undefined, '', 'no-es-fecha', '27/08/2026', '2026-8-7'])(
    '%o -> cadena vacía',
    (entrada) => {
      expect(fechaCalendario(entrada)).toBe('')
    }
  )
  it('rechaza mes o día fuera de rango (el regex solo no basta)', () => {
    expect(fechaCalendario('2026-13-01')).toBe('')
    expect(fechaCalendario('2026-00-10')).toBe('')
    expect(fechaCalendario('2026-08-00')).toBe('')
    expect(fechaCalendario('2026-08-32')).toBe('')
  })
})

describe('cambioProgramadoVencido (barrido A: aplicar cambios agendados)', () => {
  it('fecha ANTERIOR a hoy: se aplica (corrida perdida se recupera sola)', () => {
    expect(cambioProgramadoVencido('2026-07-20', HOY)).toBe(true)
  })
  it('fecha IGUAL a hoy: se aplica (<=, no <)', () => {
    expect(cambioProgramadoVencido(HOY, HOY)).toBe(true)
  })
  it('fecha FUTURA: todavía no', () => {
    expect(cambioProgramadoVencido('2026-07-28', HOY)).toBe(false)
  })
  it('un mes atrás sigue aplicando (barrido, no "solo hoy")', () => {
    expect(cambioProgramadoVencido('2026-06-27', HOY)).toBe(true)
  })
  it('cruce de año: diciembre pasado se aplica', () => {
    expect(cambioProgramadoVencido('2025-12-31', HOY)).toBe(true)
  })
  it.each([null, undefined, '', 'basura'])('sin fecha usable (%o) no hace nada', (entrada) => {
    expect(cambioProgramadoVencido(entrada, HOY)).toBe(false)
  })
})

describe('debeExpirar (barrido B: expirar planes pagos)', () => {
  it('venció ayer: expira', () => {
    expect(debeExpirar('pro', '2026-07-26', HOY)).toBe(true)
  })
  it('vence HOY: NO expira todavía (el día del vencimiento es del usuario)', () => {
    expect(debeExpirar('pro', HOY, HOY)).toBe(false)
  })
  it('vence mañana: no expira', () => {
    expect(debeExpirar('pro', '2026-07-28', HOY)).toBe(false)
  })
  it('básico también expira', () => {
    expect(debeExpirar('basico', '2026-07-01', HOY)).toBe(true)
  })
  it('gratis nunca expira (no hay nada que quitar)', () => {
    expect(debeExpirar('gratis', '2020-01-01', HOY)).toBe(false)
  })
  it('sin plan_expira NO se expira (mejor un plan de más que quitar lo pagado)', () => {
    expect(debeExpirar('pro', null, HOY)).toBe(false)
    expect(debeExpirar('pro', undefined, HOY)).toBe(false)
  })
  it('plan_expira malformado NO expira', () => {
    expect(debeExpirar('pro', '2026-13-01', HOY)).toBe(false)
    expect(debeExpirar('pro', 'basura', HOY)).toBe(false)
  })
  it('sin plan (fila incompleta) no expira', () => {
    expect(debeExpirar(null, '2020-01-01', HOY)).toBe(false)
    expect(debeExpirar(undefined, '2020-01-01', HOY)).toBe(false)
  })

  // El bug que este modulo existe para evitar: si "hoy" se calculara con el
  // reloj UTC del servidor, entre 00:00 y 04:59 UTC seria ya el dia siguiente en
  // Colombia y un plan que vence HOY se expiraria un dia antes.
  it('un plan que vence hoy sobrevive aunque el día UTC ya haya avanzado', () => {
    const hoyCot = '2026-07-27' // 2026-07-28T03:00Z en COT sigue siendo el 27
    expect(debeExpirar('pro', '2026-07-27', hoyCot)).toBe(false)
    // Con el día UTC (28) se habría expirado: eso es exactamente lo prohibido.
    expect(debeExpirar('pro', '2026-07-27', '2026-07-28')).toBe(true)
  })
})
