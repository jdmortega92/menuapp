import { describe, it, expect } from 'vitest'
import { resolverTema, fondosDelTema, choqueMarca } from './temaPersonalizado'
import { TEMAS_BASE, contraste } from './temaColor'

describe('resolverTema: gating de la base', () => {
  it.each([
    // tema, plan, base esperada
    ['claro', 'gratis', 'claro'],
    ['claro', 'pro', 'claro'],
    ['oscuro', 'gratis', 'claro'],
    ['oscuro', 'basico', 'claro'],
    ['oscuro', 'pro', 'oscuro'],
    ['natural', 'basico', 'claro'],
    ['natural', 'pro', 'natural'],
    ['premium', 'pro', 'premium'],
    ['neon', 'pro', 'claro'],
    [null, 'pro', 'claro'],
    [undefined, undefined, 'claro'],
  ])('tema=%s plan=%s → %s', (tema, plan, esperada) => {
    expect(resolverTema({ tema, plan }).base).toBe(esperada)
  })
})

describe('resolverTema: paleta propia', () => {
  it('Pro + fondo válido → paleta derivada de ese fondo', () => {
    const r = resolverTema({ tema: 'natural', plan: 'pro', temaFondo: '#3B2A20' })
    expect(r.base).toBe('natural')
    expect(r.paleta?.bg).toBe('#3B2A20')
    expect(r.paleta?.oscuro).toBe(true)
  })
  it('Pro + fondo + tarjeta válidos → respeta la tarjeta', () => {
    const r = resolverTema({ tema: 'claro', plan: 'pro', temaFondo: '#3B2A20', temaSuperficie: '#4A3628' })
    expect(r.paleta?.surface).toBe('#4A3628')
  })
  it('fondo en minúsculas se normaliza', () => {
    expect(resolverTema({ tema: 'claro', plan: 'pro', temaFondo: '#3b2a20' }).paleta?.bg).toBe('#3B2A20')
  })
  it.each(['gratis', 'basico', null])('plan %s → se ignora (sin paleta)', (plan) => {
    expect(resolverTema({ tema: 'claro', plan, temaFondo: '#3B2A20', temaSuperficie: '#4A3628' }).paleta).toBeNull()
  })
  it.each(['red', '#FFF', '#FFFFFF;background:url(x)', '', null, undefined])('fondo inválido %s → sin paleta', (f) => {
    expect(resolverTema({ tema: 'claro', plan: 'pro', temaFondo: f }).paleta).toBeNull()
  })
  it('tarjeta inválida → se ignora y se deriva del fondo', () => {
    const conInvalida = resolverTema({ tema: 'claro', plan: 'pro', temaFondo: '#3B2A20', temaSuperficie: 'rgb(1,2,3)' })
    const sinTarjeta = resolverTema({ tema: 'claro', plan: 'pro', temaFondo: '#3B2A20' })
    expect(conInvalida.paleta).toEqual(sinTarjeta.paleta)
  })
  it('tarjeta sin fondo → sin paleta', () => {
    expect(resolverTema({ tema: 'claro', plan: 'pro', temaFondo: null, temaSuperficie: '#4A3628' }).paleta).toBeNull()
  })
  it('base Pro degradada + plan no Pro → claro y sin paleta', () => {
    expect(resolverTema({ tema: 'oscuro', plan: 'basico', temaFondo: '#3B2A20' })).toEqual({ base: 'claro', paleta: null })
  })
})

describe('fondosDelTema', () => {
  it('sin paleta → colores de la base', () => {
    expect(fondosDelTema({ base: 'oscuro', paleta: null })).toEqual({ bg: TEMAS_BASE.oscuro.bg, surface: TEMAS_BASE.oscuro.surface })
  })
  it('con paleta → los de la paleta', () => {
    const t = resolverTema({ tema: 'claro', plan: 'pro', temaFondo: '#3B2A20' })
    expect(fondosDelTema(t).bg).toBe('#3B2A20')
    expect(fondosDelTema(t).surface).toBe(t.paleta!.surface)
  })
})

describe('choqueMarca', () => {
  const claro = TEMAS_BASE.claro
  const oscuro = TEMAS_BASE.oscuro

  it('ok: >= 4.5:1 contra fondo y tarjeta', () => {
    const r = choqueMarca('#1A1A18', claro.bg, claro.surface)
    expect(r.nivel).toBe('ok')
    expect(r.sugerencias).toEqual([])
  })
  it('aviso: naranja por defecto sobre Claro (~3.4:1)', () => {
    const r = choqueMarca('#E85D24', claro.bg, claro.surface)
    expect(r.nivel).toBe('aviso')
    expect(r.contraste).toBeGreaterThanOrEqual(3)
    expect(r.contraste).toBeLessThan(4.5)
  })
  it('bloqueo: Negro sobre Oscuro, Dorado sobre Claro', () => {
    expect(choqueMarca('#1A1A18', oscuro.bg, oscuro.surface).nivel).toBe('bloqueo')
    expect(choqueMarca('#D4A017', claro.bg, claro.surface).nivel).toBe('bloqueo')
  })
  it('cuenta el MENOR contraste: tarjeta clara sobre fondo oscuro', () => {
    // Blanco: perfecto contra el café, invisible contra una tarjeta blanca.
    const r = choqueMarca('#FFFFFF', '#3B2A20', '#FFFFFF')
    expect(r.nivel).toBe('bloqueo')
    expect(r.contraste).toBeCloseTo(1, 5)
  })
  it.each([
    ['#E85D24', claro.bg, claro.surface],
    ['#D4A017', claro.bg, claro.surface],
    ['#1A1A18', oscuro.bg, oscuro.surface],
    ['#4E342E', '#3B2A20', '#433329'],
    ['#E85D24', '#2E7D32', '#2B742F'],
    ['#1B5E20', '#1F3D2B', '#26432F'],
  ])('sugerencias para %s sobre %s/%s: 1-3, distintas, >= 4.5:1 contra ambos', (m, f, s) => {
    const r = choqueMarca(m, f, s)
    expect(r.nivel).not.toBe('ok')
    expect(r.sugerencias.length).toBeGreaterThan(0)
    expect(r.sugerencias.length).toBeLessThanOrEqual(3)
    expect(new Set(r.sugerencias).size).toBe(r.sugerencias.length)
    for (const x of r.sugerencias) {
      expect(contraste(x, f)).toBeGreaterThanOrEqual(4.5)
      expect(contraste(x, s)).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('entradas inválidas → ok sin sugerencias', () => {
    expect(choqueMarca('naranja', claro.bg, claro.surface)).toEqual({ nivel: 'ok', contraste: 21, sugerencias: [] })
    expect(choqueMarca('#E85D24', 'x', claro.surface).nivel).toBe('ok')
    expect(choqueMarca('#E85D24', claro.bg, '').nivel).toBe('ok')
  })
})
