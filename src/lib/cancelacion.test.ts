// CIERRE 1: reglas puras nuevas de lib/suscripciones (cancelacion agendada y
// validacion de plan_programado en el cron). Archivo propio para no editar
// suscripciones.test.ts. Mismo pin de TZ: las reglas comparan strings y el
// resultado no puede depender del huso del servidor.
process.env.TZ = 'UTC'

import { describe, it, expect } from 'vitest'
import { fechaCancelacionProgramada, esBajadaDePlan } from './suscripciones'

const HOY = '2026-07-27'

describe('fechaCancelacionProgramada', () => {
  it('plan pago con vencimiento futuro: se agenda para ese dia', () => {
    expect(fechaCancelacionProgramada('pro', '2026-08-27', HOY)).toBe('2026-08-27')
    expect(fechaCancelacionProgramada('basico', '2026-08-27', HOY)).toBe('2026-08-27')
  })
  it('el dia del vencimiento todavia se agenda (>= hoy)', () => {
    expect(fechaCancelacionProgramada('pro', HOY, HOY)).toBe(HOY)
  })
  it('vencimiento ya pasado: inmediata', () => {
    expect(fechaCancelacionProgramada('pro', '2026-07-26', HOY)).toBe('')
  })
  it('recorta el timestamptz que devuelve Postgres', () => {
    expect(fechaCancelacionProgramada('pro', '2026-08-27T00:00:00+00:00', HOY)).toBe('2026-08-27')
  })
  it('sin fecha o con fecha invalida: inmediata', () => {
    expect(fechaCancelacionProgramada('pro', null, HOY)).toBe('')
    expect(fechaCancelacionProgramada('pro', undefined, HOY)).toBe('')
    expect(fechaCancelacionProgramada('pro', '', HOY)).toBe('')
    expect(fechaCancelacionProgramada('pro', 'basura', HOY)).toBe('')
    expect(fechaCancelacionProgramada('pro', '2026-13-01', HOY)).toBe('')
  })
  it('plan gratis o ausente: nunca se agenda', () => {
    expect(fechaCancelacionProgramada('gratis', '2026-08-27', HOY)).toBe('')
    expect(fechaCancelacionProgramada(null, '2026-08-27', HOY)).toBe('')
    expect(fechaCancelacionProgramada(undefined, '2026-08-27', HOY)).toBe('')
  })
})

describe('esBajadaDePlan', () => {
  it('bajadas estrictas: true', () => {
    expect(esBajadaDePlan('pro', 'basico')).toBe(true)
    expect(esBajadaDePlan('pro', 'gratis')).toBe(true)
    expect(esBajadaDePlan('basico', 'gratis')).toBe(true)
  })
  it('subidas: false', () => {
    expect(esBajadaDePlan('gratis', 'basico')).toBe(false)
    expect(esBajadaDePlan('gratis', 'pro')).toBe(false)
    expect(esBajadaDePlan('basico', 'pro')).toBe(false)
  })
  it('mismo plan: false', () => {
    expect(esBajadaDePlan('pro', 'pro')).toBe(false)
    expect(esBajadaDePlan('gratis', 'gratis')).toBe(false)
  })
  it('strings desconocidos o ausentes: false', () => {
    expect(esBajadaDePlan('pro', 'enterprise')).toBe(false)
    expect(esBajadaDePlan('enterprise', 'gratis')).toBe(false)
    expect(esBajadaDePlan('pro', '')).toBe(false)
    expect(esBajadaDePlan('pro', null)).toBe(false)
    expect(esBajadaDePlan(null, 'gratis')).toBe(false)
    expect(esBajadaDePlan(undefined, undefined)).toBe(false)
    expect(esBajadaDePlan('Pro', 'gratis')).toBe(false)
  })
})
