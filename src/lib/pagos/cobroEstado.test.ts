import { describe, it, expect } from 'vitest'
import {
  clasificarPost,
  estadosOrigenFallo,
  filtroOrigenFallo,
  FILTRO_ORIGEN_APROBADO,
  motivoCorto,
  LARGO_MOTIVO,
  MOTIVO_DESCONOCIDO,
} from './cobroEstado'

const TX = '12147249-1792514092-65778'

describe('estadosOrigenFallo / filtroOrigenFallo (CAS del camino de fallo)', () => {
  it('FALLIDO solo desde NULL, INICIADO o REVISION', () => {
    expect(estadosOrigenFallo('FALLIDO')).toEqual([null, 'INICIADO', 'REVISION'])
    expect(filtroOrigenFallo('FALLIDO')).toBe('ultimo_cobro_estado.is.null,ultimo_cobro_estado.in.(INICIADO,REVISION)')
  })

  it('REVISION solo desde NULL o INICIADO (REVISION -> REVISION volveria a alertar)', () => {
    expect(estadosOrigenFallo('REVISION')).toEqual([null, 'INICIADO'])
    expect(filtroOrigenFallo('REVISION')).toBe('ultimo_cobro_estado.is.null,ultimo_cobro_estado.in.(INICIADO)')
  })

  it('ningun fallo sale de APROBADO, y FALLIDO no se repite', () => {
    for (const d of ['FALLIDO', 'REVISION'] as const) {
      expect(estadosOrigenFallo(d)).not.toContain('APROBADO')
      expect(estadosOrigenFallo(d)).not.toContain('FALLIDO')
    }
  })

  it('la marca de exito sale de todo menos APROBADO, NULL incluido', () => {
    expect(FILTRO_ORIGEN_APROBADO).toBe('ultimo_cobro_estado.is.null,ultimo_cobro_estado.neq.APROBADO')
  })
})

describe('motivoCorto', () => {
  it('recorta al largo de la columna', () => {
    expect(motivoCorto('x'.repeat(100))).toHaveLength(LARGO_MOTIVO)
    expect(motivoCorto('corto')).toBe('corto')
  })
})

describe('clasificarPost', () => {
  it('201 con id valido -> iniciado (no es cobrado)', () => {
    expect(clasificarPost({ ok: true, datos: { id: TX, status: 'PENDING' } })).toEqual({
      tipo: 'iniciado',
      txId: TX,
      estadoWompi: 'PENDING',
    })
  })

  it('201 sin id o con id mal formado -> sin_tx_id', () => {
    expect(clasificarPost({ ok: true, datos: { id: '', status: 'PENDING' } }).tipo).toBe('sin_tx_id')
    expect(clasificarPost({ ok: true, datos: { id: 'abc', status: 'PENDING' } }).tipo).toBe('sin_tx_id')
    expect(clasificarPost({ ok: true, datos: undefined as never }).tipo).toBe('sin_tx_id')
  })

  it('red caida (status 0) -> desconocido', () => {
    expect(clasificarPost({ ok: false, status: 0, mensaje: 'Sin conexion' })).toEqual({
      tipo: 'desconocido',
      motivo: MOTIVO_DESCONOCIDO,
    })
  })

  it('>= 500 -> desconocido', () => {
    expect(clasificarPost({ ok: false, status: 500, mensaje: 'x' }).tipo).toBe('desconocido')
    expect(clasificarPost({ ok: false, status: 503, mensaje: 'x' }).tipo).toBe('desconocido')
  })

  it('excepcion -> desconocido', () => {
    expect(clasificarPost({ excepcion: true }).tipo).toBe('desconocido')
  })

  it('4xx -> rechazado con codigo corto, incluido el 422 por referencia repetida', () => {
    expect(clasificarPost({ ok: false, status: 422, mensaje: 'INPUT_VALIDATION_ERROR' })).toEqual({
      tipo: 'rechazado',
      motivo: 'transactions 422 INPUT_VALIDATION_ERROR',
    })
    expect(clasificarPost({ ok: false, status: 401, mensaje: 'x' }).tipo).toBe('rechazado')
    expect(clasificarPost({ ok: false, status: 404, mensaje: 'x'.repeat(200) }))
      .toEqual({ tipo: 'rechazado', motivo: `transactions 404 ${'x'.repeat(200)}`.slice(0, LARGO_MOTIVO) })
  })
})
