import { describe, it, expect } from 'vitest'
import {
  clasificarFactura,
  corteConciliacion,
  decidirAntesDeAplicar,
  decidirInicio,
  decidirInicioConFactura,
  decidirPorConsulta,
  decidirPorFactura,
  referenciaVerificada,
  decidirTrasAplicar,
  plazoPendienteVencido,
  MOTIVO_ESTADO_CAMBIO,
  PLAZO_PENDIENTE_MS,
  UMBRAL_CONCILIACION_MS,
  type FilaConciliable,
} from './conciliacion'

const AHORA = new Date('2026-10-27T05:00:00.000Z')
const TX = '12147249-1792514092-65778'
const REF = 'sub_c8a8c0d2-5887-4dd2-a37a-266fe4b856bf_basico_mensual_auto2026-10-30'
const HACE_2H = new Date(AHORA.getTime() - 2 * 60 * 60 * 1000).toISOString()
const HACE_8D = new Date(AHORA.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString()

const fila = (p: Partial<FilaConciliable> = {}): FilaConciliable => ({
  ultimo_cobro_tx_id: TX,
  ultimo_cobro_referencia: REF,
  ultimo_cobro_en: HACE_2H,
  ...p,
})

const ok = (tx: Record<string, unknown>) => ({ ok: true as const, datos: { id: TX, reference: REF, ...tx } })

describe('umbrales', () => {
  it('el corte es una hora antes de ahora', () => {
    expect(UMBRAL_CONCILIACION_MS).toBe(3_600_000)
    expect(corteConciliacion(AHORA)).toBe('2026-10-27T04:00:00.000Z')
  })

  it('7 dias para PENDING; una fecha ilegible cuenta como vencida', () => {
    expect(PLAZO_PENDIENTE_MS).toBe(7 * 86_400_000)
    expect(plazoPendienteVencido(HACE_2H, AHORA)).toBe(false)
    expect(plazoPendienteVencido(HACE_8D, AHORA)).toBe(true)
    expect(plazoPendienteVencido(null, AHORA)).toBe(true)
    expect(plazoPendienteVencido('no es fecha', AHORA)).toBe(true)
  })
})

describe('decidirInicio', () => {
  it('con tx id valido -> consultar', () => {
    expect(decidirInicio(fila())).toEqual({ accion: 'consultar', txId: TX })
  })
  it('sin tx id -> REVISION (no hay con que consultar)', () => {
    expect(decidirInicio(fila({ ultimo_cobro_tx_id: null }))).toEqual({ accion: 'revision', motivo: 'sin tx id' })
  })
  it('tx id mal formado -> REVISION, nunca va a la URL', () => {
    expect(decidirInicio(fila({ ultimo_cobro_tx_id: '../merchants' }))).toEqual({ accion: 'revision', motivo: 'tx id invalido' })
  })
})

describe('decidirPorConsulta', () => {
  it('APPROVED -> aplicar con la transaccion', () => {
    const d = decidirPorConsulta(fila(), ok({ status: 'APPROVED', amount_in_cents: 1 }), AHORA)
    expect(d).toEqual({ accion: 'aplicar', transaccion: { id: TX, reference: REF, status: 'APPROVED', amount_in_cents: 1 } })
  })

  it.each(['DECLINED', 'VOIDED', 'ERROR'])('%s -> fallar', (status) => {
    expect(decidirPorConsulta(fila(), ok({ status }), AHORA)).toEqual({ accion: 'fallar', estadoWompi: status })
  })

  it('PENDING reciente -> esperar; PENDING de mas de 7 dias -> REVISION', () => {
    expect(decidirPorConsulta(fila(), ok({ status: 'PENDING' }), AHORA)).toEqual({ accion: 'esperar' })
    expect(decidirPorConsulta(fila({ ultimo_cobro_en: HACE_8D }), ok({ status: 'PENDING' }), AHORA))
      .toEqual({ accion: 'revision', motivo: 'pendiente 7 dias' })
  })

  it('estado que no conocemos -> REVISION', () => {
    expect(decidirPorConsulta(fila(), ok({ status: 'RARO' }), AHORA)).toEqual({ accion: 'revision', motivo: 'estado desconocido' })
  })

  it('consulta sin respuesta o 5xx -> esperar hasta los 7 dias, luego REVISION', () => {
    for (const status of [0, 500, 502]) {
      expect(decidirPorConsulta(fila(), { ok: false, status, mensaje: 'x' }, AHORA)).toEqual({ accion: 'esperar' })
      expect(decidirPorConsulta(fila({ ultimo_cobro_en: HACE_8D }), { ok: false, status, mensaje: 'x' }, AHORA))
        .toEqual({ accion: 'revision', motivo: 'consulta sin respuesta 7 dias' })
    }
  })

  it('404 u otro 4xx -> REVISION de inmediato', () => {
    expect(decidirPorConsulta(fila(), { ok: false, status: 404, mensaje: 'NOT_FOUND_ERROR' }, AHORA))
      .toEqual({ accion: 'revision', motivo: 'consulta 404' })
    expect(decidirPorConsulta(fila(), { ok: false, status: 401, mensaje: 'x' }, AHORA))
      .toEqual({ accion: 'revision', motivo: 'consulta 401' })
  })

  it('sin datos, otro id, referencia ajena o no automatica -> REVISION', () => {
    expect(decidirPorConsulta(fila(), { ok: true, datos: undefined as never }, AHORA))
      .toEqual({ accion: 'revision', motivo: 'consulta sin datos' })
    expect(decidirPorConsulta(fila(), ok({ id: '1-2-3', status: 'APPROVED' }), AHORA))
      .toEqual({ accion: 'revision', motivo: 'tx id no coincide' })
    expect(decidirPorConsulta(fila(), ok({ reference: REF.replace('basico', 'pro'), status: 'APPROVED' }), AHORA))
      .toEqual({ accion: 'revision', motivo: 'referencia no coincide' })
    expect(decidirPorConsulta(fila(), ok({ reference: 'sub_x_pro_mensual_1792500527319', status: 'APPROVED' }), AHORA))
      .toEqual({ accion: 'revision', motivo: 'referencia no automatica' })
  })

  it('fila de antes de 5b (sin referencia guardada): basta con que la referencia sea automatica', () => {
    expect(decidirPorConsulta(fila({ ultimo_cobro_referencia: null }), ok({ status: 'APPROVED' }), AHORA).accion).toBe('aplicar')
  })
})

describe('decidirTrasAplicar', () => {
  it('aplicado y duplicado -> aprobada (la marca la dejo el camino compartido)', () => {
    expect(decidirTrasAplicar({ tipo: 'aplicado', plan: 'basico', periodo: 'mensual', planAnterior: 'basico', planExpira: '2026-11-30' }))
      .toEqual({ accion: 'aprobada' })
    expect(decidirTrasAplicar({ tipo: 'duplicado' })).toEqual({ accion: 'aprobada' })
  })
  it('conflicto o error de DB -> esperar a la corrida siguiente', () => {
    expect(decidirTrasAplicar({ tipo: 'conflicto' })).toEqual({ accion: 'esperar' })
    expect(decidirTrasAplicar({ tipo: 'error' })).toEqual({ accion: 'esperar' })
  })
  it('plata cobrada sin plan otorgado -> REVISION', () => {
    expect(decidirTrasAplicar({ tipo: 'monto_invalido' })).toEqual({ accion: 'revision', motivo: 'aprobado con monto invalido' })
    expect(decidirTrasAplicar({ tipo: 'referencia_invalida' }).accion).toBe('revision')
    expect(decidirTrasAplicar({ tipo: 'restaurante_inexistente' }).accion).toBe('revision')
  })
})

describe('decidirAntesDeAplicar (guarda de estado del APPROVED conciliado)', () => {
  const REST = 'c8a8c0d2-5887-4dd2-a37a-266fe4b856bf'
  const comoSeCobro = { plan: 'basico', periodo_plan: 'mensual', plan_expira: '2026-10-30' }

  it('restaurante igual que cuando se cobro -> aplicar', () => {
    expect(decidirAntesDeAplicar(REF, REST, comoSeCobro)).toEqual({ accion: 'aplicar' })
  })

  it('plan_expira como timestamp del mismo dia sigue contando como igual', () => {
    expect(decidirAntesDeAplicar(REF, REST, { ...comoSeCobro, plan_expira: '2026-10-30T00:00:00+00:00' }))
      .toEqual({ accion: 'aplicar' })
  })

  it('cobro automatico Basico y luego upgrade manual a Pro -> REVISION estado cambio', () => {
    const trasUpgrade = { plan: 'pro', periodo_plan: 'mensual', plan_expira: '2026-11-27' }
    expect(decidirAntesDeAplicar(REF, REST, trasUpgrade)).toEqual({ accion: 'revision', motivo: MOTIVO_ESTADO_CAMBIO })
    expect(MOTIVO_ESTADO_CAMBIO).toBe('estado cambio')
  })

  it('cualquiera de los tres campos distinto -> REVISION', () => {
    expect(decidirAntesDeAplicar(REF, REST, { ...comoSeCobro, plan: 'pro' }).accion).toBe('revision')
    expect(decidirAntesDeAplicar(REF, REST, { ...comoSeCobro, periodo_plan: 'anual' }).accion).toBe('revision')
    expect(decidirAntesDeAplicar(REF, REST, { ...comoSeCobro, plan_expira: '2026-11-30' }).accion).toBe('revision')
    // El barrido B ya lo bajo a gratis.
    expect(decidirAntesDeAplicar(REF, REST, { ...comoSeCobro, plan: 'gratis' }).accion).toBe('revision')
    expect(decidirAntesDeAplicar(REF, REST, {}).accion).toBe('revision')
  })

  it('referencia de otro restaurante o no automatica -> REVISION', () => {
    expect(decidirAntesDeAplicar(REF, '6e293a8d-b4bc-4d53-ae15-c2340cb0218e', comoSeCobro))
      .toEqual({ accion: 'revision', motivo: 'referencia ajena' })
    expect(decidirAntesDeAplicar(`sub_${REST}_basico_mensual_1792500527319`, REST, comoSeCobro))
      .toEqual({ accion: 'revision', motivo: 'referencia no automatica' })
    expect(decidirAntesDeAplicar(undefined, REST, comoSeCobro).accion).toBe('revision')
  })
})

describe('factura primero', () => {
  const REST = 'c8a8c0d2-5887-4dd2-a37a-266fe4b856bf'

  it('clasificarFactura', () => {
    expect(clasificarFactura({ error: null, data: { estado: 'aprobada' } })).toBe('aprobada')
    expect(clasificarFactura({ error: null, data: { estado: 'rechazada' } })).toBe('otra')
    expect(clasificarFactura({ error: null, data: null })).toBe('ninguna')
    expect(clasificarFactura({ error: { message: 'x' }, data: null })).toBe('error')
  })

  it('marca fallida despues de que el webhook aplico (tx id + factura aprobada) -> aprobar, sin consultar', () => {
    expect(decidirInicioConFactura(fila(), 'aprobada')).toEqual({ accion: 'aprobar' })
  })

  it('sin tx id pero con factura aprobada -> aprobar', () => {
    expect(decidirInicioConFactura(fila({ ultimo_cobro_tx_id: null }), 'aprobada')).toEqual({ accion: 'aprobar' })
  })

  it('sin tx id y sin factura aprobada -> REVISION sin tx id', () => {
    for (const f of ['ninguna', 'otra', 'sin_referencia'] as const) {
      expect(decidirInicioConFactura(fila({ ultimo_cobro_tx_id: null }), f)).toEqual({ accion: 'revision', motivo: 'sin tx id' })
    }
  })

  it('lectura fallida -> reintentar (la fila queda INICIADO), aun sin tx id', () => {
    expect(decidirInicioConFactura(fila(), 'error')).toEqual({ accion: 'reintentar' })
    expect(decidirInicioConFactura(fila({ ultimo_cobro_tx_id: null }), 'error')).toEqual({ accion: 'reintentar' })
  })

  it('con tx id y sin factura aprobada -> consultar (despues vienen la guarda y aplicar)', () => {
    expect(decidirInicioConFactura(fila(), 'ninguna')).toEqual({ accion: 'consultar', txId: TX })
    expect(decidirInicioConFactura(fila(), 'sin_referencia')).toEqual({ accion: 'consultar', txId: TX })
  })

  it('decidirPorFactura', () => {
    expect(decidirPorFactura('aprobada')).toEqual({ accion: 'aprobar' })
    expect(decidirPorFactura('error')).toEqual({ accion: 'reintentar' })
    expect(decidirPorFactura('otra')).toEqual({ accion: 'seguir' })
    expect(decidirPorFactura('ninguna')).toEqual({ accion: 'seguir' })
  })

  it('referenciaVerificada: automatica, del restaurante y del periodo; si no, null', () => {
    expect(referenciaVerificada({ reference: REF }, REST, '2026-10-30')).toBe(REF)
    expect(referenciaVerificada({ reference: REF }, '6e293a8d-b4bc-4d53-ae15-c2340cb0218e', '2026-10-30')).toBeNull()
    expect(referenciaVerificada({ reference: REF }, REST, '2026-11-30')).toBeNull()
    expect(referenciaVerificada({ reference: `sub_${REST}_basico_mensual_1792500527319` }, REST, '2026-10-30')).toBeNull()
    expect(referenciaVerificada(undefined, REST, '2026-10-30')).toBeNull()
  })
})
