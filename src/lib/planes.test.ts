import { describe, it, expect } from 'vitest'
import { PLANES, LISTA_PLANES, precioDe, ahorroAnual, centavosDe } from './planes'

describe('PLANES (decisión 2026-07-03)', () => {
  it('precios mensuales: $0 / $15.000 / $29.000', () => {
    expect(PLANES.gratis.precioMensual).toBe(0)
    expect(PLANES.basico.precioMensual).toBe(15000)
    expect(PLANES.pro.precioMensual).toBe(29000)
  })

  it('precios anuales: 10x el mensual ("2 meses gratis")', () => {
    expect(PLANES.gratis.precioAnual).toBe(0)
    expect(PLANES.basico.precioAnual).toBe(150000)
    expect(PLANES.pro.precioAnual).toBe(290000)
    expect(PLANES.basico.precioAnual).toBe(PLANES.basico.precioMensual * 10)
    expect(PLANES.pro.precioAnual).toBe(PLANES.pro.precioMensual * 10)
  })

  it('LISTA_PLANES: orden gratis, basico, pro', () => {
    expect(LISTA_PLANES.map((p) => p.id)).toEqual(['gratis', 'basico', 'pro'])
  })
})

describe('precioDe', () => {
  it('resuelve por plan y periodo', () => {
    expect(precioDe('basico', 'mensual')).toBe(15000)
    expect(precioDe('basico', 'anual')).toBe(150000)
    expect(precioDe('pro', 'mensual')).toBe(29000)
    expect(precioDe('pro', 'anual')).toBe(290000)
    expect(precioDe('gratis', 'mensual')).toBe(0)
    expect(precioDe('gratis', 'anual')).toBe(0)
  })
})

describe('ahorroAnual', () => {
  it('pesos ahorrados vs 12 meses sueltos (= 2 meses)', () => {
    expect(ahorroAnual('gratis')).toBe(0)
    expect(ahorroAnual('basico')).toBe(30000) // 180.000 - 150.000
    expect(ahorroAnual('pro')).toBe(58000) // 348.000 - 290.000
    expect(ahorroAnual('basico')).toBe(PLANES.basico.precioMensual * 2)
    expect(ahorroAnual('pro')).toBe(PLANES.pro.precioMensual * 2)
  })
})

describe('centavosDe', () => {
  it('amount_in_cents de Wompi = COP * 100, siempre entero', () => {
    expect(centavosDe('basico', 'mensual')).toBe(1500000)
    expect(centavosDe('basico', 'anual')).toBe(15000000)
    expect(centavosDe('pro', 'mensual')).toBe(2900000)
    expect(centavosDe('pro', 'anual')).toBe(29000000)
    expect(centavosDe('gratis', 'mensual')).toBe(0)
    expect(Number.isInteger(centavosDe('pro', 'anual'))).toBe(true)
  })
})
