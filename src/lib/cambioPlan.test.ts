import { describe, it, expect } from 'vitest'
import {
  DIAS_PERIODO,
  calcularVencimientoCompra,
  clasificarCambio,
  diasCredito,
  diasRestantes,
  esperaVencimiento,
  etiquetaPlan,
  nombreConPeriodo,
  sumarDias,
  textoEsperaVencimiento,
  type ClaseCambio,
} from './cambioPlan'
import { precioDe, type Periodo } from './planes'
import type { Plan } from '@/types'

const HOY = '2026-11-10'
// 10:00 COT del 10 de noviembre (15:00 UTC).
const AHORA = new Date('2026-11-10T15:00:00.000Z')
const en = (dias: number) => sumarDias(HOY, dias)

describe('sumarDias / diasRestantes', () => {
  it('suma con desborde de mes y de anio', () => {
    expect(sumarDias('2026-01-31', 1)).toBe('2026-02-01')
    expect(sumarDias('2026-12-25', 10)).toBe('2027-01-04')
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29')
  })
  it("'' con fecha invalida", () => {
    expect(sumarDias('2026-13-01', 1)).toBe('')
    expect(sumarDias(null, 1)).toBe('')
  })
  it('dias calendario hasta plan_expira, acepta timestamptz', () => {
    expect(diasRestantes('2026-11-30', HOY)).toBe(20)
    expect(diasRestantes('2026-11-30T00:00:00+00:00', HOY)).toBe(20)
    expect(diasRestantes('2027-11-10', HOY)).toBe(365)
  })
  it('0 si vence hoy, ya vencio o no hay fecha', () => {
    expect(diasRestantes(HOY, HOY)).toBe(0)
    expect(diasRestantes('2026-11-09', HOY)).toBe(0)
    expect(diasRestantes(null, HOY)).toBe(0)
    expect(diasRestantes('basura', HOY)).toBe(0)
  })
})

describe('diasCredito (valores exactos del diseno)', () => {
  const casos: [Plan, Periodo, number, Plan, Periodo, number][] = [
    ['basico', 'mensual', 20, 'pro', 'mensual', 10],
    ['basico', 'mensual', 20, 'basico', 'anual', 24],
    ['pro', 'mensual', 29, 'pro', 'anual', 35],
    ['basico', 'anual', 200, 'pro', 'anual', 103],
    ['basico', 'anual', 200, 'pro', 'mensual', 85],
    ['basico', 'mensual', 20, 'pro', 'anual', 12],
  ]
  it.each(casos)('%s %s con %i dias -> %s %s = %i', (p, per, rem, np, nper, esperado) => {
    expect(diasCredito({ plan: p, periodo: per, planExpira: en(rem) }, { plan: np, periodo: nper }, HOY)).toBe(esperado)
  })

  it('0 desde gratis, con el plan vencido, que vence hoy o sin fecha', () => {
    const pro = { plan: 'pro' as Plan, periodo: 'mensual' as Periodo }
    expect(diasCredito({ plan: 'gratis', periodo: 'mensual', planExpira: en(20) }, pro, HOY)).toBe(0)
    expect(diasCredito({ plan: 'basico', periodo: 'mensual', planExpira: en(-1) }, pro, HOY)).toBe(0)
    expect(diasCredito({ plan: 'basico', periodo: 'mensual', planExpira: HOY }, pro, HOY)).toBe(0)
    expect(diasCredito({ plan: 'basico', periodo: 'mensual', planExpira: null }, pro, HOY)).toBe(0)
  })

  it('0 con datos que no son plan o periodo, y 0 en la renovacion', () => {
    const pro = { plan: 'pro' as Plan, periodo: 'mensual' as Periodo }
    expect(diasCredito({ plan: 'premium', periodo: 'mensual', planExpira: en(20) }, pro, HOY)).toBe(0)
    expect(diasCredito({ plan: 'basico', periodo: null, planExpira: en(20) }, pro, HOY)).toBe(0)
    expect(diasCredito({ plan: 'pro', periodo: 'mensual', planExpira: en(20) }, pro, HOY)).toBe(0)
  })

  it('PROPIEDAD: la conversion nunca entrega mas valor del que quedaba, y pierde menos de un dia', () => {
    const planes: Plan[] = ['basico', 'pro']
    const periodos: Periodo[] = ['mensual', 'anual']
    for (const p of planes) for (const per of periodos) for (const np of planes) for (const nper of periodos) {
      if (p === np && per === nper) continue
      // Valor en "pesos por periodo nominal": dias * precio / largo del periodo.
      // Se compara en enteros multiplicando por los dos largos.
      const precioViejo = precioDe(p, per)
      const precioNuevo = precioDe(np, nper)
      for (let rem = 1; rem <= 400; rem++) {
        const c = diasCredito({ plan: p, periodo: per, planExpira: en(rem) }, { plan: np, periodo: nper }, HOY)
        const valorQuedaba = rem * precioViejo * DIAS_PERIODO[nper]
        expect(c * precioNuevo * DIAS_PERIODO[per]).toBeLessThanOrEqual(valorQuedaba)
        expect((c + 1) * precioNuevo * DIAS_PERIODO[per]).toBeGreaterThan(valorQuedaba)
      }
    }
  })
})

describe('clasificarCambio', () => {
  const fila = (plan: string, periodo: string | null, planExpira: string | null) => ({ plan, periodo, planExpira })
  const casos: [string, ReturnType<typeof fila>, Plan, Periodo, ClaseCambio][] = [
    ['gratis -> basico', fila('gratis', null, null), 'basico', 'mensual', 'desde_gratis'],
    ['gratis -> gratis es la card actual', fila('gratis', 'anual', null), 'gratis', 'mensual', 'renovacion'],
    ['basico -> gratis', fila('basico', 'mensual', en(20)), 'gratis', 'mensual', 'cancelar'],
    ['mismo plan y periodo', fila('pro', 'anual', en(20)), 'pro', 'anual', 'renovacion'],
    ['mismo plan y periodo vencido sigue siendo Renovar', fila('pro', 'anual', en(-5)), 'pro', 'anual', 'renovacion'],
    ['basico -> pro', fila('basico', 'mensual', en(20)), 'pro', 'mensual', 'subida'],
    ['basico anual -> pro mensual (manda el plan)', fila('basico', 'anual', en(200)), 'pro', 'mensual', 'subida'],
    ['pro -> basico', fila('pro', 'mensual', en(20)), 'basico', 'mensual', 'bajada'],
    ['pro mensual -> basico anual (manda el plan)', fila('pro', 'mensual', en(20)), 'basico', 'anual', 'bajada'],
    ['mensual -> anual', fila('basico', 'mensual', en(20)), 'basico', 'anual', 'a_anual'],
    ['anual -> mensual', fila('basico', 'anual', en(200)), 'basico', 'mensual', 'a_mensual'],
    ['plan vencido -> otro plan', fila('pro', 'mensual', en(-1)), 'basico', 'mensual', 'desde_gratis'],
    ['periodo null cuenta como mensual', fila('basico', null, en(20)), 'basico', 'mensual', 'renovacion'],
    ['plan pago sin plan_expira se da por activo', fila('pro', 'mensual', null), 'basico', 'mensual', 'bajada'],
    ['plan desconocido cuenta como gratis', fila('premium', 'mensual', en(20)), 'basico', 'mensual', 'desde_gratis'],
  ]
  it.each(casos)('%s', (_n, actual, plan, periodo, esperado) => {
    expect(clasificarCambio(actual, { plan, periodo }, HOY)).toBe(esperado)
  })
})

describe('esperaVencimiento', () => {
  it('bajada y a_mensual esperan con al menos un dia pagado', () => {
    expect(esperaVencimiento('bajada', { planExpira: en(1) }, HOY)).toBe(true)
    expect(esperaVencimiento('a_mensual', { planExpira: en(200) }, HOY)).toBe(true)
  })
  it('el dia del vencimiento, vencido o sin fecha ya no espera', () => {
    expect(esperaVencimiento('bajada', { planExpira: HOY }, HOY)).toBe(false)
    expect(esperaVencimiento('bajada', { planExpira: en(-3) }, HOY)).toBe(false)
    expect(esperaVencimiento('a_mensual', { planExpira: null }, HOY)).toBe(false)
  })
  it('las demas clases nunca esperan', () => {
    for (const c of ['renovacion', 'desde_gratis', 'subida', 'a_anual', 'cancelar'] as ClaseCambio[]) {
      expect(esperaVencimiento(c, { planExpira: en(20) }, HOY)).toBe(false)
    }
  })
})

describe('etiquetaPlan', () => {
  const pro = { plan: 'pro', periodo: 'mensual', planExpira: en(20) }
  it('un Pro ya no ve "Subir a Básico"', () => {
    expect(etiquetaPlan('bajada', { plan: 'basico', periodo: 'mensual' }, pro)).toBe('Cambiar a Básico')
  })
  it('una etiqueta por clase', () => {
    expect(etiquetaPlan('renovacion', { plan: 'pro', periodo: 'mensual' }, pro)).toBe('Renovar')
    expect(etiquetaPlan('subida', { plan: 'pro', periodo: 'mensual' }, { plan: 'basico' })).toBe('Subir a Pro')
    expect(etiquetaPlan('desde_gratis', { plan: 'basico', periodo: 'mensual' }, { plan: 'gratis' })).toBe('Subir a Básico')
    expect(etiquetaPlan('a_anual', { plan: 'pro', periodo: 'anual' }, pro)).toBe('Pasar a anual')
    expect(etiquetaPlan('a_mensual', { plan: 'pro', periodo: 'mensual' }, pro)).toBe('Pasar a mensual')
    expect(etiquetaPlan('cancelar', { plan: 'gratis', periodo: 'mensual' }, pro)).toBe('Bajar a Gratis')
  })
  it('el mismo plan vencido en otro periodo se "elige", no se "sube"', () => {
    expect(etiquetaPlan('desde_gratis', { plan: 'pro', periodo: 'anual' }, { plan: 'pro' })).toBe('Elegir Pro anual')
  })
})

describe('textos', () => {
  it('nombreConPeriodo', () => {
    expect(nombreConPeriodo('basico', 'anual')).toBe('Básico anual')
  })
  it('textoEsperaVencimiento no promete un cambio agendado', () => {
    const t = textoEsperaVencimiento('Pro mensual', '30 de noviembre de 2026', 'Básico mensual')
    expect(t).toBe('Tu plan Pro mensual sigue activo hasta el 30 de noviembre de 2026. Cuando venza podrás elegir Básico mensual.')
    expect(t).not.toMatch(/pasar[aá]s|program/i)
  })
})

describe('calcularVencimientoCompra', () => {
  it('renovacion: suma sobre plan_expira vigente, sin credito', () => {
    const r = calcularVencimientoCompra({ plan: 'basico', periodo: 'mensual', planExpira: '2026-11-30' }, { plan: 'basico', periodo: 'mensual' }, AHORA)
    expect(r).toEqual({ planExpira: '2026-12-30', diasCredito: 0, renovacion: true })
  })
  it('renovacion vencida: desde hoy', () => {
    const r = calcularVencimientoCompra({ plan: 'basico', periodo: 'mensual', planExpira: '2026-11-01' }, { plan: 'basico', periodo: 'mensual' }, AHORA)
    expect(r.planExpira).toBe('2026-12-10')
  })
  it('subida: hoy + periodo + credito', () => {
    const r = calcularVencimientoCompra({ plan: 'basico', periodo: 'mensual', planExpira: '2026-11-30' }, { plan: 'pro', periodo: 'mensual' }, AHORA)
    expect(r).toEqual({ planExpira: '2026-12-20', diasCredito: 10, renovacion: false })
  })
  it('mensual -> anual: hoy + 1 anio + credito', () => {
    const r = calcularVencimientoCompra({ plan: 'basico', periodo: 'mensual', planExpira: '2026-11-30' }, { plan: 'basico', periodo: 'anual' }, AHORA)
    expect(r).toEqual({ planExpira: '2027-12-04', diasCredito: 24, renovacion: false })
  })
  it('desde gratis: hoy + periodo, sin credito', () => {
    const r = calcularVencimientoCompra({ plan: 'gratis', periodo: null, planExpira: null }, { plan: 'pro', periodo: 'mensual' }, AHORA)
    expect(r).toEqual({ planExpira: '2026-12-10', diasCredito: 0, renovacion: false })
  })
  it('fin de mes: clamp del calendario y despues el credito', () => {
    // 31 ene + 1 mes = 28 feb (clamp), + 10 dias de credito = 10 mar.
    const ahora = new Date('2026-01-31T15:00:00.000Z')
    const r = calcularVencimientoCompra({ plan: 'basico', periodo: 'mensual', planExpira: '2026-02-20' }, { plan: 'pro', periodo: 'mensual' }, ahora)
    expect(r).toEqual({ planExpira: '2026-03-10', diasCredito: 10, renovacion: false })
  })
  it('una bajada que igual se pago conserva su valor (checkout viejo)', () => {
    const r = calcularVencimientoCompra({ plan: 'pro', periodo: 'mensual', planExpira: '2026-11-30' }, { plan: 'basico', periodo: 'mensual' }, AHORA)
    // 20 * 29000 / 15000 = 38.67 -> 38
    expect(r.diasCredito).toBe(38)
    expect(r.planExpira).toBe('2027-01-17')
  })
})
