import { describe, it, expect } from 'vitest'
import {
  esIdTransaccionValido,
  referenciaEsDelRestaurante,
  motivoMontoInvalido,
  respuestaWebhook,
  estadoRetornoDeResultado,
  estadoRetornoDeStatus,
  type ResultadoAplicar,
} from './transaccion'
import { obtenerTransaccion } from '@/lib/wompiApi'
import { centavosDe } from '@/lib/planes'

const REST = 'c8a8c0d2-5887-4dd2-a37a-266fe4b856bf'
const OTRO = '11111111-2222-3333-4444-555555555555'

describe('esIdTransaccionValido', () => {
  it('acepta el formato de Wompi', () => {
    expect(esIdTransaccionValido('12147249-1792514092-65778')).toBe(true)
    expect(esIdTransaccionValido('1-2-3')).toBe(true)
  })
  it.each([
    '', '12147249-1792514092', '12147249-1792514092-65778-1', 'abc-def-ghi',
    '12147249-1792514092-65778/../merchants', '../transactions', ' 1-2-3', '1-2-3 ',
    '1'.repeat(30) + '-' + '2'.repeat(30) + '-' + '3'.repeat(10), null, undefined, 42,
  ])('rechaza %s', (id) => {
    expect(esIdTransaccionValido(id)).toBe(false)
  })
  it('obtenerTransaccion rechaza un id invalido SIN llamar a Wompi', async () => {
    const r = await obtenerTransaccion('../merchants/x', 'test')
    expect(r).toEqual({ ok: false, status: 400, mensaje: 'Id de transaccion invalido' })
  })
})

describe('referenciaEsDelRestaurante', () => {
  const ref = `sub_${REST}_pro_mensual_1792514092000`
  it('referencia propia → true', () => {
    expect(referenciaEsDelRestaurante(ref, REST)).toBe(true)
  })
  it('referencia de otro restaurante → false', () => {
    expect(referenciaEsDelRestaurante(ref, OTRO)).toBe(false)
  })
  it.each(['', 'pago_123', `sub_${REST}_oro_mensual_1`, `sub_${REST}_pro_semanal_1`, null, undefined, 7])(
    'referencia ajena a nuestro formato (%s) → false', (r) => {
      expect(referenciaEsDelRestaurante(r, REST)).toBe(false)
    })
  it('restaurante vacío → false', () => {
    expect(referenciaEsDelRestaurante(ref, '')).toBe(false)
  })
})

describe('motivoMontoInvalido (monto Y moneda, D-LOW-1)', () => {
  const monto = centavosDe('pro', 'mensual')
  it('monto exacto en COP → null', () => {
    expect(motivoMontoInvalido({ amount_in_cents: monto, currency: 'COP' }, 'pro', 'mensual')).toBeNull()
  })
  it('monto distinto → monto', () => {
    expect(motivoMontoInvalido({ amount_in_cents: monto - 100, currency: 'COP' }, 'pro', 'mensual')).toBe('monto')
    expect(motivoMontoInvalido({ amount_in_cents: undefined, currency: 'COP' }, 'pro', 'mensual')).toBe('monto')
  })
  it('moneda presente y distinta de COP → moneda', () => {
    expect(motivoMontoInvalido({ amount_in_cents: monto, currency: 'USD' }, 'pro', 'mensual')).toBe('moneda')
    expect(motivoMontoInvalido({ amount_in_cents: monto, currency: 'cop' }, 'pro', 'mensual')).toBe('moneda')
    expect(motivoMontoInvalido({ amount_in_cents: monto, currency: '' }, 'pro', 'mensual')).toBe('moneda')
  })
  it('moneda ausente NO bloquea (Wompi Colombia es solo COP; el monto ya se valido)', () => {
    expect(motivoMontoInvalido({ amount_in_cents: monto }, 'pro', 'mensual')).toBeNull()
    expect(motivoMontoInvalido({ amount_in_cents: monto, currency: undefined }, 'pro', 'mensual')).toBeNull()
  })
  it('moneda ausente con monto malo sigue bloqueando por monto', () => {
    expect(motivoMontoInvalido({ amount_in_cents: monto + 1 }, 'pro', 'mensual')).toBe('monto')
  })
  it('el monto de otro plan/periodo no sirve', () => {
    expect(motivoMontoInvalido({ amount_in_cents: centavosDe('basico', 'mensual'), currency: 'COP' }, 'pro', 'mensual')).toBe('monto')
    expect(motivoMontoInvalido({ amount_in_cents: centavosDe('pro', 'anual'), currency: 'COP' }, 'pro', 'mensual')).toBe('monto')
  })
})

describe('respuestaWebhook: las respuestas de siempre', () => {
  const aplicado: ResultadoAplicar = { tipo: 'aplicado', plan: 'pro', periodo: 'mensual', planAnterior: 'gratis', planExpira: '2026-11-27' }
  it.each<[ResultadoAplicar, number, Record<string, unknown>]>([
    [aplicado, 200, { recibido: true, plan: 'pro' }],
    [{ tipo: 'duplicado' }, 200, { recibido: true, idempotente: true }],
    [{ tipo: 'monto_invalido' }, 200, { recibido: true }],
    [{ tipo: 'referencia_invalida' }, 200, { recibido: true }],
    [{ tipo: 'restaurante_inexistente' }, 200, { recibido: true }],
    [{ tipo: 'conflicto' }, 500, { error: 'DB' }],
    [{ tipo: 'error' }, 500, { error: 'DB' }],
  ])('%o → %i', (r, status, body) => {
    expect(respuestaWebhook(r)).toEqual({ status, body })
  })
})

describe('estado de retorno', () => {
  it.each<[ResultadoAplicar, string]>([
    [{ tipo: 'aplicado', plan: 'pro', periodo: 'mensual', planAnterior: 'gratis', planExpira: 'x' }, 'aprobado'],
    [{ tipo: 'duplicado' }, 'aprobado'],
    [{ tipo: 'conflicto' }, 'pendiente'],
    [{ tipo: 'monto_invalido' }, 'error'],
    [{ tipo: 'referencia_invalida' }, 'error'],
    [{ tipo: 'restaurante_inexistente' }, 'error'],
    [{ tipo: 'error' }, 'error'],
  ])('resultado %o → %s', (r, e) => {
    expect(estadoRetornoDeResultado(r)).toBe(e)
  })
  it.each([
    ['DECLINED', 'rechazado'], ['VOIDED', 'rechazado'], ['ERROR', 'rechazado'],
    ['PENDING', 'pendiente'], [undefined, 'pendiente'], ['RARO', 'pendiente'],
  ])('status %s → %s', (s, e) => {
    expect(estadoRetornoDeStatus(s)).toBe(e)
  })
})
