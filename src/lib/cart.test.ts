import { describe, it, expect } from 'vitest'
import { makeCartKey, parseCartKey, precioEfectivo, enriquecerComboPlatos } from './cart'

describe('cart key codec', () => {
  it('round-trips a plain plato id (sin variante ni source)', () => {
    expect(makeCartKey('uuid-a')).toBe('uuid-a')
    expect(parseCartKey('uuid-a')).toEqual({ platoId: 'uuid-a', varianteId: undefined, source: undefined })
  })

  it('round-trips id + variante', () => {
    const key = makeCartKey('a', 'v1')
    expect(key).toBe('a__v1')
    expect(parseCartKey(key)).toEqual({ platoId: 'a', varianteId: 'v1', source: undefined })
  })

  it('round-trips id + variante + source', () => {
    const key = makeCartKey('a', 'v1', 'dia')
    expect(key).toBe('a__v1__dia')
    expect(parseCartKey(key)).toEqual({ platoId: 'a', varianteId: 'v1', source: 'dia' })
  })

  it('empty-middle: source sin variante produce a____dia y parsea con varianteId undefined (shape load-bearing)', () => {
    const key = makeCartKey('a', undefined, 'dia')
    expect(key).toBe('a____dia')
    expect(parseCartKey(key)).toEqual({ platoId: 'a', varianteId: undefined, source: 'dia' })
  })

  it("variante '' (falsy) con source equivale al empty-middle", () => {
    expect(makeCartKey('a', '', 'ganador')).toBe('a____ganador')
    expect(parseCartKey('a____ganador')).toEqual({ platoId: 'a', varianteId: undefined, source: 'ganador' })
  })

  it('UUIDs reales (con guiones) no introducen __ accidental y parsean sin variante/source', () => {
    const platoId = '550e8400-e29b-41d4-a716-446655440000'
    const varianteId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
    expect(makeCartKey(platoId)).not.toContain('__')
    expect(parseCartKey(makeCartKey(platoId))).toEqual({ platoId, varianteId: undefined, source: undefined })
    expect(parseCartKey(makeCartKey(platoId, varianteId))).toEqual({ platoId, varianteId, source: undefined })
  })
})

describe('precioEfectivo', () => {
  const plato = {
    id: 'p1',
    precio: 10000,
    variantes: [
      { id: 'v1', nombre: 'Pequeña', precio: 8000 },
      { id: 'v2', nombre: 'Grande', precio: 14000 },
    ],
  }

  it('devuelve el precio de la variante cuando existe', () => {
    expect(precioEfectivo(plato, 'v2')).toBe(14000)
  })

  it('cae al precio del plato si la variante no existe en plato.variantes', () => {
    expect(precioEfectivo(plato, 'v-borrada')).toBe(10000)
  })

  it('devuelve plato.precio sin varianteId o sin variantes', () => {
    expect(precioEfectivo(plato)).toBe(10000)
    expect(precioEfectivo({ id: 'p2', precio: 5000 }, 'v1')).toBe(5000)
  })
})

describe('enriquecerComboPlatos', () => {
  const todosLosPlatos = [
    {
      id: 'p1',
      nombre: 'Bandeja',
      precio: 20000,
      foto_url: 'https://x/p1.jpg',
      descripcion: 'Con frijoles',
      variantes: [{ id: 'v1', nombre: 'Media', precio: 12000 }],
    },
    { id: 'p2', nombre: 'Jugo', precio: 4000, foto_url: null, descripcion: null },
  ]

  it('resuelve la variante: nombre y precio efectivo de la variante', () => {
    const [row] = enriquecerComboPlatos([{ plato_id: 'p1', variante_id: 'v1' }], todosLosPlatos)
    expect(row.varianteNombre).toBe('Media')
    expect(row.precioEfectivo).toBe(12000)
    expect(row.variante_id).toBe('v1')
  })

  it('fallback de variante borrada: precioBase || plato.precio || 0, varianteNombre null', () => {
    const [conBase] = enriquecerComboPlatos(
      [{ plato_id: 'p1', variante_id: 'v-borrada', precioBase: 11000 }], todosLosPlatos)
    expect(conBase.precioEfectivo).toBe(11000)
    expect(conBase.varianteNombre).toBeNull()

    const [sinBase] = enriquecerComboPlatos(
      [{ plato_id: 'p1', variante_id: 'v-borrada' }], todosLosPlatos)
    expect(sinBase.precioEfectivo).toBe(20000)

    const [sinPlato] = enriquecerComboPlatos(
      [{ plato_id: 'p-fantasma', variante_id: 'v-borrada' }], todosLosPlatos)
    expect(sinPlato.precioEfectivo).toBe(0)
  })

  it('acarrea foto_url y descripcion del plato, con fallback null', () => {
    const [conFoto] = enriquecerComboPlatos([{ plato_id: 'p1' }], todosLosPlatos)
    expect(conFoto.foto_url).toBe('https://x/p1.jpg')
    expect(conFoto.descripcion).toBe('Con frijoles')

    const [sinFoto] = enriquecerComboPlatos([{ plato_id: 'p2' }], todosLosPlatos)
    expect(sinFoto.foto_url).toBeNull()
    expect(sinFoto.descripcion).toBeNull()

    const [sinPlato] = enriquecerComboPlatos([{ plato_id: 'nope' }], todosLosPlatos)
    expect(sinPlato.foto_url).toBeNull()
    expect(sinPlato.descripcion).toBeNull()
  })

  it("precedencia de nombre: cp.nombre || plato.nombre || ''", () => {
    const [cpNombre] = enriquecerComboPlatos([{ plato_id: 'p1', nombre: 'Override' }], todosLosPlatos)
    expect(cpNombre.nombre).toBe('Override')

    const [platoNombre] = enriquecerComboPlatos([{ plato_id: 'p1' }], todosLosPlatos)
    expect(platoNombre.nombre).toBe('Bandeja')

    const [vacio] = enriquecerComboPlatos([{ plato_id: 'nope' }], todosLosPlatos)
    expect(vacio.nombre).toBe('')
  })

  it('input null/vacío devuelve []', () => {
    expect(enriquecerComboPlatos(null as any, todosLosPlatos)).toEqual([])
    expect(enriquecerComboPlatos([], todosLosPlatos)).toEqual([])
  })
})
