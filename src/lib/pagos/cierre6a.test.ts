import { describe, it, expect } from 'vitest'
import { cobroEnVuelo, MENSAJE_COBRO_EN_VUELO } from './cobroEstado'
import { decidirCobroAutomatico, decidirTrasAplicar, MOTIVO_CAMBIO_AGENDADO, MOTIVO_ESTADO_CAMBIO } from './conciliacion'
import { estadoRetornoDeResultado, respuestaWebhook } from './transaccion'
import { alertaRevision } from '@/lib/email/templates/alertaRevision'
import { construirUrlCheckout, firmaIntegridad } from '@/lib/wompi'

// CIERRE 6a: partes puras nuevas del camino del pago. Archivo propio para no
// tocar los tests existentes.

const REST = 'c8a8c0d2-5887-4dd2-a37a-266fe4b856bf'
const REF = `sub_${REST}_basico_mensual_auto2026-11-30`

describe('cobroEnVuelo (D-HIGH-3)', () => {
  const EXPIRA = '2026-11-30T00:00:00+00:00'
  it('INICIADO del periodo vigente bloquea', () => {
    expect(cobroEnVuelo([{ ultimo_cobro_estado: 'INICIADO', ultimo_cobro_periodo: '2026-11-30' }], EXPIRA)).toBe('INICIADO')
  })
  it('REVISION del periodo vigente bloquea, y gana sobre INICIADO', () => {
    expect(cobroEnVuelo([{ ultimo_cobro_estado: 'REVISION', ultimo_cobro_periodo: '2026-11-30' }], EXPIRA)).toBe('REVISION')
    expect(
      cobroEnVuelo(
        [
          { ultimo_cobro_estado: 'INICIADO', ultimo_cobro_periodo: '2026-11-30' },
          { ultimo_cobro_estado: 'REVISION', ultimo_cobro_periodo: '2026-11-30' },
        ],
        EXPIRA
      )
    ).toBe('REVISION')
  })
  it('otro periodo, FALLIDO, APROBADO o NULL no bloquean', () => {
    expect(cobroEnVuelo([{ ultimo_cobro_estado: 'INICIADO', ultimo_cobro_periodo: '2026-10-30' }], EXPIRA)).toBeNull()
    expect(cobroEnVuelo([{ ultimo_cobro_estado: 'FALLIDO', ultimo_cobro_periodo: '2026-11-30' }], EXPIRA)).toBeNull()
    expect(cobroEnVuelo([{ ultimo_cobro_estado: 'APROBADO', ultimo_cobro_periodo: '2026-11-30' }], EXPIRA)).toBeNull()
    expect(cobroEnVuelo([{ ultimo_cobro_estado: null, ultimo_cobro_periodo: '2026-11-30' }], EXPIRA)).toBeNull()
    expect(cobroEnVuelo([], EXPIRA)).toBeNull()
  })
  it('sin plan_expira usable no hay periodo vigente', () => {
    expect(cobroEnVuelo([{ ultimo_cobro_estado: 'INICIADO', ultimo_cobro_periodo: '2026-11-30' }], null)).toBeNull()
  })
  it('mensajes para el dueno', () => {
    expect(MENSAJE_COBRO_EN_VUELO.INICIADO).toBe(
      'Estamos procesando el cobro automático de tu plan. Cuando se confirme verás la nueva fecha aquí.'
    )
    expect(MENSAJE_COBRO_EN_VUELO.REVISION).toBe(
      'Estamos revisando el último cobro automático de tu plan. Escríbenos a contacto@menuapp.com.co y lo resolvemos.'
    )
  })
})

describe('decidirCobroAutomatico (C-15 / C-5)', () => {
  const COMO_SE_COBRO = { plan: 'basico', periodo_plan: 'mensual', plan_expira: '2026-11-30T00:00:00+00:00' }
  it('la fila tal como se cobro -> aplicar', () => {
    expect(decidirCobroAutomatico(REF, REST, COMO_SE_COBRO)).toEqual({ accion: 'aplicar' })
    expect(decidirCobroAutomatico(REF, REST, { ...COMO_SE_COBRO, plan_programado: null })).toEqual({ accion: 'aplicar' })
  })
  it('upgrade manual en medio (C-15) -> revision', () => {
    expect(decidirCobroAutomatico(REF, REST, { ...COMO_SE_COBRO, plan: 'pro', plan_expira: '2026-12-20' })).toEqual({
      accion: 'revision',
      motivo: MOTIVO_ESTADO_CAMBIO,
    })
  })
  it('cancelacion agendada (C-5) -> revision', () => {
    expect(decidirCobroAutomatico(REF, REST, { ...COMO_SE_COBRO, plan_programado: 'gratis' })).toEqual({
      accion: 'revision',
      motivo: MOTIVO_CAMBIO_AGENDADO,
    })
  })
})

describe('resultado estado_cambio', () => {
  const r = { tipo: 'estado_cambio' as const, motivo: 'estado cambio' }
  it('webhook: 200 (reintentar no arregla nada)', () => {
    expect(respuestaWebhook(r)).toEqual({ status: 200, body: { recibido: true, resultado: 'estado_cambio' } })
  })
  it('conciliacion: revision con el mismo motivo', () => {
    expect(decidirTrasAplicar(r)).toEqual({ accion: 'revision', motivo: 'estado cambio' })
  })
  it('retorno: error (nunca "aprobado")', () => {
    expect(estadoRetornoDeResultado(r)).toBe('error')
  })
})

describe('alertaRevision (CIERRE 6a)', () => {
  const FILA = [{ restauranteId: REST, motivo: 'estado cambio', referencia: REF, txId: null }]
  it('avisa que el restaurante no puede pagar a mano', () => {
    const c = alertaRevision(FILA)
    const linea = 'Mientras una fila esté en revisión, ese restaurante no puede pagar a mano.'
    expect(c.text).toContain(linea)
    expect(c.html).toContain(linea)
  })
  it("contexto 'pago' no dice 'corrida del cron'", () => {
    const c = alertaRevision(FILA, 'pago')
    expect(c.text).toContain('Un cobro automático quedó en revisión al llegar su pago aprobado.')
    expect(c.text).not.toContain('corrida del cron')
  })
})

describe('checkout con expiration-time', () => {
  const EXP = '2026-11-10T15:30:00.000Z'
  it('la firma lleva la fecha entre la moneda y el secreto', () => {
    const conFecha = firmaIntegridad({ reference: 'r', amountInCents: 100, currency: 'COP', secret: 's', expirationTime: EXP })
    const aMano = firmaIntegridad({ reference: 'r', amountInCents: 100, currency: `COP${EXP}`, secret: 's' })
    expect(conFecha).toBe(aMano)
  })
  it('la URL lleva el mismo valor en expiration-time', () => {
    const url = construirUrlCheckout({
      publicKey: 'pub_test_x', currency: 'COP', amountInCents: 100, reference: 'r', signature: 'f',
      redirectUrl: 'https://x/suscripcion', expirationTime: EXP,
    })
    expect(new URL(url).searchParams.get('expiration-time')).toBe(EXP)
  })
  it('sin expirationTime la URL no cambia', () => {
    const url = construirUrlCheckout({
      publicKey: 'pub_test_x', currency: 'COP', amountInCents: 100, reference: 'r', signature: 'f',
      redirectUrl: 'https://x/suscripcion',
    })
    expect(url).not.toContain('expiration-time')
  })
})
