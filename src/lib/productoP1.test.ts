// CIERRE P1: texto del tipo de negocio y regla de visibilidad de Sorpréndeme.
import { describe, it, expect } from 'vitest'
import {
  TIPOS_NEGOCIO,
  labelTipoNegocio,
  textoTipoNegocio,
  tipoDetalleParaGuardar,
  MAX_TIPO_DETALLE,
} from './tiposNegocio'
import { sorprendemeDisponible } from './sorprendeme'

describe('textoTipoNegocio', () => {
  it('tipos conocidos: label con tildes, nunca el valor crudo', () => {
    expect(textoTipoNegocio('comida_rapida', null)).toBe('Comida rápida')
    expect(textoTipoNegocio('cafeteria', null)).toBe('Cafetería')
    expect(textoTipoNegocio('food_truck', 'ignorado')).toBe('Food truck')
  })
  it("'otro' con detalle: el detalle recortado", () => {
    expect(textoTipoNegocio('otro', '  Floristería ')).toBe('Floristería')
  })
  it("'otro' sin detalle: '' (se omite, nunca \"Otro\")", () => {
    expect(textoTipoNegocio('otro', null)).toBe('')
    expect(textoTipoNegocio('otro', '   ')).toBe('')
  })
  it("desconocido o ausente: ''", () => {
    expect(textoTipoNegocio('discoteca', null)).toBe('')
    expect(textoTipoNegocio(null, null)).toBe('')
    expect(textoTipoNegocio(undefined, undefined)).toBe('')
  })
  it('cada valor de la lista tiene label', () => {
    for (const t of TIPOS_NEGOCIO) expect(labelTipoNegocio(t.valor)).toBe(t.label)
  })
})

describe('tipoDetalleParaGuardar', () => {
  it("solo se guarda con tipo 'otro'", () => {
    expect(tipoDetalleParaGuardar('bar', 'Floristería')).toBe(null)
    expect(tipoDetalleParaGuardar('otro', ' Floristería ')).toBe('Floristería')
  })
  it("vacio -> null", () => {
    expect(tipoDetalleParaGuardar('otro', '')).toBe(null)
    expect(tipoDetalleParaGuardar('otro', '   ')).toBe(null)
    expect(tipoDetalleParaGuardar('otro', null)).toBe(null)
  })
  it('nunca pasa del maximo', () => {
    const largo = 'x'.repeat(MAX_TIPO_DETALLE + 10)
    expect(tipoDetalleParaGuardar('otro', largo)!.length).toBe(MAX_TIPO_DETALLE)
  })
})

describe('sorprendemeDisponible', () => {
  const base = {
    activo: true,
    plan: 'basico',
    categoriasElegidas: ['a', 'b'],
    categoriasAbiertasIds: ['a', 'b', 'c'],
    busqueda: '',
  }
  it('2 elegidas, abiertas, Basico o Pro, sin busqueda: aparece', () => {
    expect(sorprendemeDisponible(base)).toBe(true)
    expect(sorprendemeDisponible({ ...base, plan: 'pro' })).toBe(true)
  })
  it('0 o 1 elegidas: no aparece', () => {
    expect(sorprendemeDisponible({ ...base, categoriasElegidas: [] })).toBe(false)
    expect(sorprendemeDisponible({ ...base, categoriasElegidas: null })).toBe(false)
    expect(sorprendemeDisponible({ ...base, categoriasElegidas: ['a'] })).toBe(false)
  })
  it('mas de 2 elegidas: no aparece', () => {
    expect(sorprendemeDisponible({ ...base, categoriasElegidas: ['a', 'b', 'c'] })).toBe(false)
  })
  it('una de las dos cerrada por horario: no aparece', () => {
    expect(sorprendemeDisponible({ ...base, categoriasAbiertasIds: ['a', 'c'] })).toBe(false)
  })
  it('plan gratis: no aparece', () => {
    expect(sorprendemeDisponible({ ...base, plan: 'gratis' })).toBe(false)
  })
  it('toggle apagado o ausente: no aparece', () => {
    expect(sorprendemeDisponible({ ...base, activo: false })).toBe(false)
    expect(sorprendemeDisponible({ ...base, activo: undefined })).toBe(false)
  })
  it('con busqueda activa: no aparece', () => {
    expect(sorprendemeDisponible({ ...base, busqueda: 'pollo' })).toBe(false)
    expect(sorprendemeDisponible({ ...base, busqueda: '   ' })).toBe(true)
  })
})
