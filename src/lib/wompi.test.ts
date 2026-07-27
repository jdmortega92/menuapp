import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  firmaIntegridad,
  construirReferencia,
  parsearReferencia,
  construirUrlCheckout,
  calcularPlanExpira,
  calcularChecksumEvento,
  type WompiEvento,
} from './wompi'

const sha256hex = (s: string) => createHash('sha256').update(s).digest('hex')

describe('firmaIntegridad (Checkout Web)', () => {
  it('concatena reference + amount + currency + secret en ese orden exacto', () => {
    const out = firmaIntegridad({ reference: 'ref-123', amountInCents: 1500000, currency: 'COP', secret: 'sekret' })
    expect(out).toBe(sha256hex('ref-1231500000COPsekret'))
  })

  it('NO coincide con otro orden (fija el orden, no solo el determinismo)', () => {
    const out = firmaIntegridad({ reference: 'ref-123', amountInCents: 1500000, currency: 'COP', secret: 'sekret' })
    expect(out).not.toBe(sha256hex('1500000ref-123COPsekret'))
    expect(out).not.toBe(sha256hex('sekretref-1231500000COP'))
  })

  it('es hex de 64 chars, deterministico y sensible a cada input', () => {
    const base = { reference: 'r', amountInCents: 100, currency: 'COP', secret: 's' }
    const a = firmaIntegridad(base)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(firmaIntegridad(base)).toBe(a)
    expect(firmaIntegridad({ ...base, amountInCents: 101 })).not.toBe(a)
    expect(firmaIntegridad({ ...base, currency: 'USD' })).not.toBe(a)
    expect(firmaIntegridad({ ...base, secret: 't' })).not.toBe(a)
  })

  it('variante con expiration_time lo inserta antes del secreto', () => {
    const out = firmaIntegridad({ reference: 'r', amountInCents: 100, currency: 'COP', secret: 's', expirationTime: '2026-01-01T00:00:00.000Z' })
    expect(out).toBe(sha256hex('r100COP2026-01-01T00:00:00.000Zs'))
  })
})

describe('construirReferencia / parsearReferencia', () => {
  it('formato sub_<id>_<plan>_<periodo>_<ts> y round-trip', () => {
    const ref = construirReferencia({ restauranteId: 'abc-def-uuid', plan: 'pro', periodo: 'anual', now: 1234567890 })
    expect(ref).toBe('sub_abc-def-uuid_pro_anual_1234567890')
    expect(parsearReferencia(ref)).toEqual({ restauranteId: 'abc-def-uuid', plan: 'pro', periodo: 'anual' })
  })

  it('un UUID real (con guiones) sobrevive el split por guion bajo', () => {
    const id = '11111111-2222-3333-4444-555555555555'
    const ref = construirReferencia({ restauranteId: id, plan: 'basico', periodo: 'mensual', now: 7 })
    expect(parsearReferencia(ref)).toEqual({ restauranteId: id, plan: 'basico', periodo: 'mensual' })
  })

  it('rechaza forma invalida, prefijo, plan o periodo no validos', () => {
    expect(parsearReferencia('otra_cosa')).toBeNull()
    expect(parsearReferencia('sub_id_pro_anual')).toBeNull() // faltan partes
    expect(parsearReferencia('xxx_id_pro_anual_1')).toBeNull() // prefijo malo
    expect(parsearReferencia('sub_id_gratis_anual_1')).toBeNull() // gratis no se cobra
    expect(parsearReferencia('sub_id_pro_semanal_1')).toBeNull() // periodo malo
    expect(parsearReferencia('sub__pro_anual_1')).toBeNull() // id vacio
  })
})

describe('construirUrlCheckout', () => {
  it('arma el URL con la clave signature:integrity LITERAL y valores encodeados', () => {
    const url = construirUrlCheckout({
      publicKey: 'pub_test_abc',
      currency: 'COP',
      amountInCents: 1500000,
      reference: 'sub_id_pro_anual_1',
      signature: 'deadbeef',
      redirectUrl: 'https://menuapp.com.co/suscripcion?estado=procesando',
      customerEmail: 'a@b.co',
    })
    expect(url.startsWith('https://checkout.wompi.co/p/?')).toBe(true)
    expect(url).toContain('public-key=pub_test_abc')
    expect(url).toContain('amount-in-cents=1500000')
    expect(url).toContain('signature:integrity=deadbeef')
    // El redirect-url va percent-encoded (: / ? = &).
    expect(url).toContain('redirect-url=https%3A%2F%2Fmenuapp.com.co%2Fsuscripcion%3Festado%3Dprocesando')
    expect(url).toContain('customer-data:email=a%40b.co')
  })

  it('omite el email cuando no se pasa', () => {
    const url = construirUrlCheckout({
      publicKey: 'p', currency: 'COP', amountInCents: 1, reference: 'r', signature: 's', redirectUrl: 'https://x.co',
    })
    expect(url).not.toContain('customer-data:email')
  })
})

describe('calcularPlanExpira (COT / America-Bogota)', () => {
  // desde a las 17:00Z => 12:00 COT del mismo dia calendario.
  it('mensual: +1 mes', () => {
    expect(calcularPlanExpira('mensual', new Date('2026-03-15T17:00:00Z'))).toBe('2026-04-15')
  })

  it('anual: +1 anio', () => {
    expect(calcularPlanExpira('anual', new Date('2026-03-15T17:00:00Z'))).toBe('2027-03-15')
  })

  it('mensual con rollover de diciembre a enero', () => {
    expect(calcularPlanExpira('mensual', new Date('2026-12-10T17:00:00Z'))).toBe('2027-01-10')
  })

  it('clamp de dia: 31 ene + 1 mes -> 28 feb (no bisiesto)', () => {
    expect(calcularPlanExpira('mensual', new Date('2026-01-31T17:00:00Z'))).toBe('2026-02-28')
  })

  it('clamp de dia en bisiesto: 31 ene 2028 + 1 mes -> 29 feb', () => {
    expect(calcularPlanExpira('mensual', new Date('2028-01-31T17:00:00Z'))).toBe('2028-02-29')
  })

  it('formato YYYY-MM-DD con zero-padding', () => {
    expect(calcularPlanExpira('mensual', new Date('2026-08-05T17:00:00Z'))).toBe('2026-09-05')
  })
})

describe('calcularChecksumEvento (webhook, propiedades dinamicas)', () => {
  const secret = 'evt_secret'
  const event: WompiEvento = {
    event: 'transaction.updated',
    data: { transaction: { id: 'tx-1', status: 'APPROVED', amount_in_cents: 1500000 } },
    signature: {
      properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
      checksum: '',
    },
    timestamp: 1700000000,
  }

  it('resuelve properties EN ORDEN + timestamp + secret, SHA-256 hex mayus', () => {
    const esperado = sha256hex('tx-1APPROVED15000001700000000' + secret).toUpperCase()
    expect(calcularChecksumEvento(event, secret)).toBe(esperado)
  })

  it('respeta el orden dado por properties (no un orden fijo)', () => {
    const reordenado: WompiEvento = {
      ...event,
      signature: { properties: ['transaction.status', 'transaction.id', 'transaction.amount_in_cents'], checksum: '' },
    }
    const esperado = sha256hex('APPROVEDtx-115000001700000000' + secret).toUpperCase()
    expect(calcularChecksumEvento(reordenado, secret)).toBe(esperado)
    expect(calcularChecksumEvento(reordenado, secret)).not.toBe(calcularChecksumEvento(event, secret))
  })

  it('cambia si cambia el secret o el timestamp', () => {
    expect(calcularChecksumEvento(event, 'otro')).not.toBe(calcularChecksumEvento(event, secret))
    expect(calcularChecksumEvento({ ...event, timestamp: 1700000001 }, secret)).not.toBe(
      calcularChecksumEvento(event, secret)
    )
  })
})
