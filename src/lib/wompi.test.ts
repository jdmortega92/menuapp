import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  firmaIntegridad,
  construirReferencia,
  parsearReferencia,
  construirUrlCheckout,
  calcularPlanExpira,
  esRenovacion,
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

describe('esRenovacion (renovacion vs upgrade/cambio de periodo)', () => {
  it('mismo plan y mismo periodo -> renovacion', () => {
    expect(esRenovacion({ plan: 'pro', periodo: 'mensual', planActual: 'pro', periodoActual: 'mensual' })).toBe(true)
  })

  it('otro plan -> NO es renovacion (upgrade: ciclo nuevo)', () => {
    expect(esRenovacion({ plan: 'pro', periodo: 'mensual', planActual: 'basico', periodoActual: 'mensual' })).toBe(false)
  })

  it('mismo plan con otro periodo -> NO es renovacion (ciclo nuevo)', () => {
    expect(esRenovacion({ plan: 'pro', periodo: 'anual', planActual: 'pro', periodoActual: 'mensual' })).toBe(false)
  })

  it('viniendo de gratis -> NO es renovacion', () => {
    expect(esRenovacion({ plan: 'basico', periodo: 'mensual', planActual: 'gratis', periodoActual: 'mensual' })).toBe(false)
  })

  it('fila sin plan/periodo (null o undefined) -> NO es renovacion', () => {
    expect(esRenovacion({ plan: 'pro', periodo: 'mensual', planActual: null, periodoActual: null })).toBe(false)
    expect(esRenovacion({ plan: 'pro', periodo: 'mensual' })).toBe(false)
  })
})

describe('calcularPlanExpira con extenderDesde (F4.b-1: pagar no quema dias)', () => {
  const hoy = new Date('2026-03-15T17:00:00Z') // 12:00 COT del 2026-03-15

  // ── Rama RENOVACION: el llamador pasa el vencimiento vigente ──
  it('mensual: extiende desde el vencimiento futuro, no desde hoy', () => {
    // 20 dias restantes: el ciclo nuevo arranca donde termina el viejo.
    expect(calcularPlanExpira('mensual', hoy, '2026-04-04')).toBe('2026-05-04')
  })

  it('anual: extiende desde el vencimiento futuro', () => {
    expect(calcularPlanExpira('anual', hoy, '2026-04-04')).toBe('2027-04-04')
  })

  it('acepta el timestamptz completo que devuelve Postgres', () => {
    expect(calcularPlanExpira('mensual', hoy, '2026-04-04T00:00:00+00:00')).toBe('2026-05-04')
  })

  it('vencimiento HOY: base hoy (identico a no extender)', () => {
    expect(calcularPlanExpira('mensual', hoy, '2026-03-15')).toBe('2026-04-15')
    expect(calcularPlanExpira('mensual', hoy)).toBe('2026-04-15')
  })

  // ── Rama CICLO NUEVO: sin fecha util, la base es hoy ──
  it('vencimiento YA PASADO: calcula desde hoy', () => {
    expect(calcularPlanExpira('mensual', hoy, '2026-01-10')).toBe('2026-04-15')
  })

  it('sin vencimiento (null/undefined/vacio): calcula desde hoy', () => {
    expect(calcularPlanExpira('mensual', hoy, null)).toBe('2026-04-15')
    expect(calcularPlanExpira('mensual', hoy, undefined)).toBe('2026-04-15')
    expect(calcularPlanExpira('mensual', hoy, '')).toBe('2026-04-15')
  })

  it('valor malformado: cae a hoy en vez de propagar basura', () => {
    expect(calcularPlanExpira('mensual', hoy, 'no-es-fecha')).toBe('2026-04-15')
    expect(calcularPlanExpira('mensual', hoy, '2026-13-01')).toBe('2026-04-15')
  })

  // ── Clamp de dia bajo AMBAS bases ──
  it('clamp con base futura: vence 31 ene + 1 mes -> 28 feb', () => {
    const enero = new Date('2026-01-05T17:00:00Z')
    expect(calcularPlanExpira('mensual', enero, '2026-01-31')).toBe('2026-02-28')
  })

  it('clamp con base futura en bisiesto: vence 31 ene 2028 + 1 mes -> 29 feb', () => {
    const enero = new Date('2028-01-05T17:00:00Z')
    expect(calcularPlanExpira('mensual', enero, '2028-01-31')).toBe('2028-02-29')
  })

  it('clamp con base HOY sigue igual (la rama vieja no cambio)', () => {
    expect(calcularPlanExpira('mensual', new Date('2026-01-31T17:00:00Z'))).toBe('2026-02-28')
  })

  it('rollover de anio con base futura: vence 10 dic + 1 mes -> 10 ene', () => {
    const dic = new Date('2026-12-01T17:00:00Z')
    expect(calcularPlanExpira('mensual', dic, '2026-12-10')).toBe('2027-01-10')
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
