import { describe, it, expect } from 'vitest'
import { cambioPlan, varianteCambioPlan } from './cambioPlan'
import { fechaLargaColombia } from '@/lib/fechas'

describe('varianteCambioPlan', () => {
  it.each([
    // [plan_anterior, periodo_anterior, plan_nuevo, periodo_nuevo, variante]
    ['basico', 'mensual', 'pro', 'mensual', 'subida'],
    ['gratis', undefined, 'basico', 'anual', 'subida'],
    ['pro', 'mensual', 'basico', 'mensual', 'bajada'],
    ['pro', 'anual', 'gratis', undefined, 'bajada'],
    ['pro', 'mensual', 'pro', 'anual', 'cambio_periodo'],
    ['pro', 'anual', 'pro', 'mensual', 'cambio_periodo'],
    ['pro', 'mensual', 'pro', 'mensual', 'renovacion'],
    ['basico', 'anual', 'basico', 'anual', 'renovacion'],
    // Sin periodo anterior no se puede afirmar renovación: comportamiento de siempre.
    ['pro', undefined, 'pro', 'mensual', 'cambio_periodo'],
  ] as const)('%s/%s → %s/%s = %s', (pa, pera, pn, pern, esperada) => {
    expect(varianteCambioPlan({
      plan_anterior: pa, periodo_anterior: pera, plan_nuevo: pn, periodo_nuevo: pern,
    })).toBe(esperada)
  })
})

describe('correo de renovación (pro mensual → pro mensual)', () => {
  // Como lo devuelve Postgres (medianoche UTC) y como lo escribe calcularPlanExpira.
  const planExpiraDb = '2026-11-27T00:00:00+00:00'
  const c = cambioPlan({
    plan_nuevo: 'pro', plan_anterior: 'pro', periodo_nuevo: 'mensual', periodo_anterior: 'mensual',
    plan_expira: '2026-11-27',
  })

  it('asunto y cuerpo de renovación, con la fecha', () => {
    expect(c.subject).toBe('Tu plan Pro quedó renovado')
    expect(c.text).toContain('Recibimos tu pago. Tu plan Pro sigue activo hasta el 27 de noviembre de 2026.')
    expect(c.html).toContain('27 de noviembre de 2026')
    expect(c.html).toContain('Ver mi plan')
  })
  it('jamás dice que cambió la facturación', () => {
    for (const t of [c.subject, c.text, c.html]) {
      expect(t).not.toContain('ahora es mensual')
      expect(t).not.toContain('Solo cambió la facturación')
    }
  })
  it('sin lista de desbloqueo ni aviso de activar', () => {
    expect(c.text).not.toContain('desbloqueado')
    expect(c.text).not.toContain('Algunas arrancan apagadas')
  })
  it('misma fecha que /suscripcion (fechaLargaColombia) aunque llegue en medianoche UTC', () => {
    const conDb = cambioPlan({
      plan_nuevo: 'pro', plan_anterior: 'pro', periodo_nuevo: 'mensual', periodo_anterior: 'mensual',
      plan_expira: planExpiraDb,
    })
    expect(fechaLargaColombia(planExpiraDb)).toBe('27 de noviembre de 2026')
    expect(conDb.text).toContain(`hasta el ${fechaLargaColombia(planExpiraDb)}.`)
  })
})

describe('las otras variantes no cambian', () => {
  it('cambio de periodo conserva su copy', () => {
    const c = cambioPlan({ plan_nuevo: 'pro', plan_anterior: 'pro', periodo_nuevo: 'anual', periodo_anterior: 'mensual' })
    expect(c.subject).toBe('Tu plan Pro ahora es anual')
  })
  it('subida conserva su asunto', () => {
    expect(cambioPlan({ plan_nuevo: 'pro', plan_anterior: 'basico', periodo_nuevo: 'mensual', periodo_anterior: 'mensual' }).subject)
      .toBe('Tu plan Pro (mensual) ya está activo')
  })
  it('bajada conserva su asunto', () => {
    expect(cambioPlan({ plan_nuevo: 'basico', plan_anterior: 'pro', periodo_nuevo: 'mensual' }).subject)
      .toBe('Tu plan cambió a Básico (mensual)')
  })
})
