import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Sin red ni DB: fetch se simula y el cliente de Supabase es un doble que solo
// registra lo que se le pide. Lo que se prueba aqui es el CONTRATO de la
// conciliacion con Wompi: solo GET /transactions/{id}, jamas un POST, y nada
// de nada sin llave privada.

vi.mock('@/lib/email/notificaciones', () => ({
  notificarCobroFallido: vi.fn(async () => ({})),
  notificarPlanActivo: vi.fn(async () => ({})),
  notificarRenovacionCobrada: vi.fn(async () => ({})),
}))

import { conciliarCobros } from './conciliarCobros'
import { notificarCobroFallido } from '@/lib/email/notificaciones'
import type { FilaRevision } from './conciliacion'

const PRIVADA = 'prv_test_SECRETO_DE_PRUEBA_123'
const PUBLICA = 'pub_test_publica_de_prueba_456'
const REST = 'c8a8c0d2-5887-4dd2-a37a-266fe4b856bf'
const REF = `sub_${REST}_basico_mensual_auto2026-10-30`
const AHORA = new Date('2026-10-27T05:00:00.000Z')
const HACE_2H = '2026-10-27T03:00:00.000Z'

interface Op {
  tabla: string
  tipo: 'select' | 'update'
  valores?: Record<string, unknown>
  filtros: string[]
}

/** El restaurante tal como se le cobro REF: basico mensual, plan_expira = periodo facturado. */
const COMO_SE_COBRO = { plan: 'basico', periodo_plan: 'mensual', plan_expira: '2026-10-30' }

/** Doble minimo del cliente de service role: encadenable y "await-able".
 *  facturas: numero -> estado, o 'ERROR' para simular que la lectura falla. */
function fakeAdmin(
  filasIniciado: Record<string, unknown>[],
  restaurante: Record<string, unknown> = COMO_SE_COBRO,
  facturas: Record<string, string> = {}
) {
  const ops: Op[] = []
  const resultado = (op: Op) => {
    if (op.tipo === 'update') return { data: [{ id: 'x' }], error: null }
    if (op.tabla === 'fuentes_pago') return { data: filasIniciado, error: null }
    if (op.tabla === 'restaurantes') return { data: { usuario_id: 'u1', ...restaurante }, error: null }
    if (op.tabla === 'facturas') {
      const numero = op.filtros.find((f) => f.startsWith('eq:numero|'))?.slice('eq:numero|'.length) ?? ''
      const estado = facturas[numero]
      if (estado === 'ERROR') return { data: null, error: { message: 'red' } }
      return { data: estado ? { estado } : null, error: null }
    }
    return { data: null, error: null }
  }
  const from = (tabla: string) => {
    const op: Op = { tabla, tipo: 'select', filtros: [] }
    ops.push(op)
    const filtro = (nombre: string) => (...a: unknown[]) => {
      op.filtros.push(`${nombre}:${a.map(String).join('|')}`)
      return b
    }
    const b: Record<string, unknown> = {
      select: () => b,
      update: (v: Record<string, unknown>) => { op.tipo = 'update'; op.valores = v; return b },
      eq: filtro('eq'), lt: filtro('lt'), or: filtro('or'), is: filtro('is'),
      order: filtro('order'), limit: filtro('limit'),
      maybeSingle: () => Promise.resolve(resultado(op)),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(resultado(op)).then(res, rej),
    }
    return b
  }
  const admin = {
    from,
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'dueno@example.com' } }, error: null }) } },
  }
  return { admin: admin as never, ops }
}

const fila = (id: string, txId: string | null) => ({
  id: `fuente-${id}`,
  restaurante_id: REST,
  ultimo_cobro_periodo: '2026-10-30',
  ultimo_cobro_referencia: REF,
  ultimo_cobro_tx_id: txId,
  ultimo_cobro_en: HACE_2H,
})

function respuesta(status: number, cuerpo: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as unknown as Response
}

let fetchMock: ReturnType<typeof vi.fn>
let logs: string[] = []

beforeEach(() => {
  vi.stubEnv('WOMPI_PRIVATE_KEY', PRIVADA)
  vi.stubEnv('NEXT_PUBLIC_WOMPI_PUBLIC_KEY', PUBLICA)
  vi.stubEnv('WOMPI_API_URL', '')
  delete process.env.WOMPI_API_URL
  logs = []
  const capturar = (...a: unknown[]) => { logs.push(a.map(String).join(' ')) }
  vi.spyOn(console, 'info').mockImplementation(capturar)
  vi.spyOn(console, 'error').mockImplementation(capturar)
  vi.spyOn(console, 'warn').mockImplementation(capturar)
  fetchMock = vi.fn(async (url: string) => {
    const id = url.split('/').pop()
    const status = { '1-1-1': 'PENDING', '2-2-2': 'DECLINED', '4-4-4': 'APPROVED' }[id ?? '']
    if (id === '5-5-5') return respuesta(503, { error: { type: 'SERVICE_UNAVAILABLE' } })
    return respuesta(200, { data: { id, status, reference: REF, amount_in_cents: 1500000, currency: 'COP' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(notificarCobroFallido).mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('conciliarCobros', () => {
  it('solo hace GET /transactions/{id}: jamas un POST', async () => {
    const { admin, ops } = fakeAdmin([
      fila('a', '1-1-1'), // PENDING reciente -> esperar
      fila('b', '2-2-2'), // DECLINED -> FALLIDO + correo
      fila('c', null),    // sin tx id -> REVISION, sin consulta
      fila('d', '4-4-4'), // APPROVED -> camino compartido
      fila('e', '5-5-5'), // 503 -> esperar
    ])
    const aplicar = vi.fn(async () => ({ tipo: 'aplicado' as const, plan: 'basico' as const, periodo: 'mensual' as const, planAnterior: 'basico', planExpira: '2026-11-30' }))
    const alertas: FilaRevision[] = []

    const r = await conciliarCobros(admin, alertas, { aplicar, ahora: AHORA })

    expect(fetchMock).toHaveBeenCalledTimes(4)
    for (const [url, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(init.method).toBe('GET')
      expect(init.body).toBeUndefined()
      expect(url).toMatch(/^https:\/\/sandbox\.wompi\.co\/v1\/transactions\/\d+-\d+-\d+$/)
    }
    expect(r).toEqual({ omitida: false, revisadas: 5, aprobadas: 1, fallidas: 1, revision: 1, pendientes: 2, errores: 0 })

    // La lectura: INICIADO de hace mas de una hora, sin filtrar por estado de la fuente.
    const lectura = ops[0]
    expect(lectura.tabla).toBe('fuentes_pago')
    expect(lectura.filtros).toContain('eq:ultimo_cobro_estado|INICIADO')
    expect(lectura.filtros).toContain('lt:ultimo_cobro_en|2026-10-27T04:00:00.000Z')
    expect(lectura.filtros.some((f) => f.startsWith('eq:estado|'))).toBe(false)

    const updates = ops.filter((o) => o.tipo === 'update')
    expect(updates.map((u) => u.valores?.ultimo_cobro_estado)).toEqual(['FALLIDO', 'REVISION'])
    expect(updates[0].filtros).toContain('or:ultimo_cobro_estado.is.null,ultimo_cobro_estado.in.(INICIADO,REVISION)')
    expect(updates[1].filtros).toContain('or:ultimo_cobro_estado.is.null,ultimo_cobro_estado.in.(INICIADO)')

    expect(aplicar).toHaveBeenCalledTimes(1)
    expect(aplicar).toHaveBeenCalledWith(expect.objectContaining({ id: '4-4-4', status: 'APPROVED' }), 'conciliacion')
    expect(notificarCobroFallido).toHaveBeenCalledTimes(1)
    expect(alertas).toEqual([{ restauranteId: REST, motivo: 'sin tx id', referencia: REF, txId: null }])
  })

  it('cobro automatico Basico y upgrade manual a Pro antes de conciliar: REVISION, nada se aplica', async () => {
    const trasUpgrade = { plan: 'pro', periodo_plan: 'mensual', plan_expira: '2026-11-27' }
    const { admin, ops } = fakeAdmin([fila('d', '4-4-4')], trasUpgrade)
    const aplicar = vi.fn()
    const alertas: FilaRevision[] = []

    const r = await conciliarCobros(admin, alertas, { aplicar, ahora: AHORA })

    expect(aplicar).not.toHaveBeenCalled()
    expect(r).toEqual({ omitida: false, revisadas: 1, aprobadas: 0, fallidas: 0, revision: 1, pendientes: 0, errores: 0 })
    // La guarda leyo el estado ACTUAL del restaurante de la fila.
    const lecturaRest = ops.find((o) => o.tabla === 'restaurantes')
    expect(lecturaRest?.filtros).toContain(`eq:id|${REST}`)
    // La unica escritura es la marca REVISION en fuentes_pago: ni plan ni factura.
    const updates = ops.filter((o) => o.tipo === 'update')
    expect(updates).toHaveLength(1)
    expect(updates[0].tabla).toBe('fuentes_pago')
    expect(updates[0].valores).toMatchObject({ ultimo_cobro_estado: 'REVISION', ultimo_cobro_error: 'estado cambio' })
    // facturas solo se LEE (factura primero); nunca se escribe.
    expect(ops.filter((o) => o.tabla === 'facturas').every((o) => o.tipo === 'select')).toBe(true)
    expect(alertas).toEqual([{ restauranteId: REST, motivo: 'estado cambio', referencia: REF, txId: '4-4-4' }])
    expect(notificarCobroFallido).not.toHaveBeenCalled()
    for (const [, init] of fetchMock.mock.calls as [string, RequestInit][]) expect(init.method).toBe('GET')
  })

  it('factura primero: webhook ya aplico y su marca fallo -> APROBADO; sin guarda, sin aplicar, sin alerta, sin correo', async () => {
    // El restaurante YA tiene plan_expira extendido: la guarda daria un falso 'estado cambio'.
    const yaRenovado = { plan: 'basico', periodo_plan: 'mensual', plan_expira: '2026-11-30' }
    const { admin, ops } = fakeAdmin([fila('d', '4-4-4')], yaRenovado, { [REF]: 'aprobada' })
    const aplicar = vi.fn()
    const alertas: FilaRevision[] = []

    const r = await conciliarCobros(admin, alertas, { aplicar, ahora: AHORA })

    expect(r).toEqual({ omitida: false, revisadas: 1, aprobadas: 1, fallidas: 0, revision: 0, pendientes: 0, errores: 0 })
    expect(fetchMock).not.toHaveBeenCalled() // con referencia guardada ni siquiera se consulta a Wompi
    expect(aplicar).not.toHaveBeenCalled()
    expect(ops.some((o) => o.tabla === 'restaurantes')).toBe(false) // ni guarda ni correo
    expect(alertas).toHaveLength(0)
    expect(notificarCobroFallido).not.toHaveBeenCalled()
    const updates = ops.filter((o) => o.tipo === 'update')
    expect(updates).toHaveLength(1)
    expect(updates[0].valores).toMatchObject({ ultimo_cobro_estado: 'APROBADO', ultimo_cobro_error: null, ultimo_cobro_tx_id: '4-4-4' })
    // El MISMO CAS que el camino compartido.
    expect(updates[0].filtros).toEqual(expect.arrayContaining([
      `eq:restaurante_id|${REST}`,
      'eq:ultimo_cobro_periodo|2026-10-30',
      'or:ultimo_cobro_estado.is.null,ultimo_cobro_estado.neq.APROBADO',
    ]))
  })

  it('sin tx id pero con factura aprobada -> APROBADO, sin alerta', async () => {
    const { admin, ops } = fakeAdmin([fila('c', null)], COMO_SE_COBRO, { [REF]: 'aprobada' })
    const alertas: FilaRevision[] = []
    const r = await conciliarCobros(admin, alertas, { ahora: AHORA })
    expect(r.aprobadas).toBe(1)
    expect(r.revision).toBe(0)
    expect(alertas).toHaveLength(0)
    const updates = ops.filter((o) => o.tipo === 'update')
    expect(updates).toHaveLength(1)
    expect(updates[0].valores?.ultimo_cobro_estado).toBe('APROBADO')
    expect(updates[0].valores).not.toHaveProperty('ultimo_cobro_tx_id')
  })

  it('sin tx id y sin factura aprobada -> REVISION sin tx id (una factura rechazada no cuenta)', async () => {
    const { admin } = fakeAdmin([fila('c', null)], COMO_SE_COBRO, { [REF]: 'rechazada' })
    const alertas: FilaRevision[] = []
    const r = await conciliarCobros(admin, alertas, { ahora: AHORA })
    expect(r.revision).toBe(1)
    expect(alertas).toEqual([{ restauranteId: REST, motivo: 'sin tx id', referencia: REF, txId: null }])
  })

  it('si la lectura de factura falla: la fila queda INICIADO y cuenta como error', async () => {
    const { admin, ops } = fakeAdmin([fila('d', '4-4-4')], COMO_SE_COBRO, { [REF]: 'ERROR' })
    const aplicar = vi.fn()
    const alertas: FilaRevision[] = []
    const r = await conciliarCobros(admin, alertas, { aplicar, ahora: AHORA })
    expect(r.errores).toBe(1)
    expect(ops.some((o) => o.tipo === 'update')).toBe(false)
    expect(aplicar).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(alertas).toHaveLength(0)
  })

  it('fila de antes de 5b (sin referencia): factura por la referencia de la tx ya verificada', async () => {
    const vieja = { ...fila('d', '4-4-4'), ultimo_cobro_referencia: null }
    const yaRenovado = { plan: 'basico', periodo_plan: 'mensual', plan_expira: '2026-11-30' }
    const { admin, ops } = fakeAdmin([vieja], yaRenovado, { [REF]: 'aprobada' })
    const aplicar = vi.fn()
    const r = await conciliarCobros(admin, [], { aplicar, ahora: AHORA })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('GET')
    expect(ops.find((o) => o.tabla === 'facturas')?.filtros).toContain(`eq:numero|${REF}`)
    expect(aplicar).not.toHaveBeenCalled()
    expect(r.aprobadas).toBe(1)
  })

  it('sin llave privada: ni lectura ni Wompi', async () => {
    vi.stubEnv('WOMPI_PRIVATE_KEY', '')
    const { admin, ops } = fakeAdmin([fila('a', '1-1-1'), fila('c', null)])
    const alertas: FilaRevision[] = []
    const r = await conciliarCobros(admin, alertas, { ahora: AHORA })
    expect(r.omitida).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(ops).toHaveLength(0)
    expect(alertas).toHaveLength(0)
  })

  it('llaves de entornos distintos: tampoco toca a Wompi', async () => {
    vi.stubEnv('NEXT_PUBLIC_WOMPI_PUBLIC_KEY', 'pub_prod_otra_456')
    const { admin, ops } = fakeAdmin([fila('a', '1-1-1')])
    const r = await conciliarCobros(admin, [], { ahora: AHORA })
    expect(r.omitida).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(ops).toHaveLength(0)
  })

  it('una fila que lanza no corta las demas', async () => {
    const { admin } = fakeAdmin([fila('a', '1-1-1'), fila('b', '2-2-2')])
    let n = 0
    const obtener = vi.fn(async () => {
      if (n++ === 0) throw new Error('boom')
      return { ok: true as const, datos: { id: '2-2-2', status: 'DECLINED', reference: REF } }
    })
    const r = await conciliarCobros(admin, [], { obtener, ahora: AHORA })
    expect(r.errores).toBe(1)
    expect(r.fallidas).toBe(1)
  })

  it('los logs no llevan llaves, longitudes ni correos', async () => {
    const { admin } = fakeAdmin([fila('b', '2-2-2'), fila('c', null)])
    await conciliarCobros(admin, [], { ahora: AHORA })
    for (const l of logs) {
      expect(l).not.toContain(PRIVADA)
      expect(l).not.toContain('SECRETO')
      expect(l).not.toContain(PUBLICA)
      expect(l).not.toMatch(/len[=:]/)
      expect(l).not.toContain('@')
    }
    expect(logs.some((l) => /\[cron\/conciliacion\] revisadas=2 aprobadas=0 fallidas=1 revision=1 pendientes=0 errores=0$/.test(l))).toBe(true)
  })
})
