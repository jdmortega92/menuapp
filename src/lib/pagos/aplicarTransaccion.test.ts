import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// CIERRE 6a: el camino compartido del APPROVED, con un doble del cliente de
// service role. Se prueba lo que cambio: el credito viaja en p_plan_expira (el
// RPC no cambia) y la guarda del cobro automatico no escribe nada.

vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/email/notificaciones', () => ({
  notificarPlanActivo: vi.fn(async () => ({})),
  notificarRenovacionCobrada: vi.fn(async () => ({})),
  notificarCobroFallido: vi.fn(async () => ({})),
}))
vi.mock('@/lib/email/alertaAdmin', () => ({ enviarAlertaRevision: vi.fn(async () => 'enviada') }))
vi.mock('@/lib/pagos/cobroFallido', () => ({
  fallarCobroAutomatico: vi.fn(async () => ({ marca: 'marcado', correo: 'no_aplica' })),
}))

import { aplicarTransaccionAprobada } from './aplicarTransaccion'
import { createAdminClient } from '@/lib/supabase-admin'
import { enviarAlertaRevision } from '@/lib/email/alertaAdmin'
import { fallarCobroAutomatico } from '@/lib/pagos/cobroFallido'
import { notificarPlanActivo, notificarRenovacionCobrada } from '@/lib/email/notificaciones'
import { centavosDe, type Periodo } from '@/lib/planes'
import type { Plan } from '@/types'

const REST = 'c8a8c0d2-5887-4dd2-a37a-266fe4b856bf'
// 10:00 COT del 10 de noviembre de 2026.
const AHORA = new Date('2026-11-10T15:00:00.000Z')

function tx(plan: Plan, periodo: Periodo, sufijo = '1792500527319') {
  return {
    id: '12147249-1792514092-65778',
    reference: `sub_${REST}_${plan}_${periodo}_${sufijo}`,
    amount_in_cents: centavosDe(plan, periodo),
    currency: 'COP',
    status: 'APPROVED',
    payment_method_type: 'CARD',
  }
}

/** Doble minimo: encadenable y "await-able". Registra cada update. */
function fakeAdmin(rest: Record<string, unknown> | null, fuentes: { id: string }[] = [{ id: 'f1' }]) {
  const updates: { tabla: string; valores: unknown }[] = []
  const rpc = vi.fn(async () => ({ data: 'aplicado', error: null }))
  const from = vi.fn((tabla: string) => {
    const q: Record<string, unknown> = {}
    const chain = () => q
    q.select = chain
    q.eq = chain
    q.or = chain
    q.in = chain
    q.update = (valores: unknown) => {
      updates.push({ tabla, valores })
      return q
    }
    q.maybeSingle = async () => ({ data: tabla === 'restaurantes' ? rest : null, error: null })
    q.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
      Promise.resolve({ data: tabla === 'fuentes_pago' ? fuentes : [], error: null }).then(ok, ko)
    return q
  })
  const admin = {
    from,
    rpc,
    auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: { email: 'dueno@example.com' } }, error: null })) } },
  }
  vi.mocked(createAdminClient).mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>)
  return { admin, rpc, updates }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(AHORA)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(enviarAlertaRevision).mockClear()
  vi.mocked(fallarCobroAutomatico).mockClear()
  vi.mocked(notificarPlanActivo).mockClear()
  vi.mocked(notificarRenovacionCobrada).mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const BASICO_20 = { plan: 'basico', periodo_plan: 'mensual', plan_expira: '2026-11-30T00:00:00+00:00', plan_programado: null, usuario_id: 'u1' }

describe('credito en p_plan_expira', () => {
  it('basico mensual con 20 dias -> pro mensual: hoy + 1 mes + 10 dias', async () => {
    const { rpc } = fakeAdmin(BASICO_20)
    const r = await aplicarTransaccionAprobada(tx('pro', 'mensual'), 'webhook')
    expect(r).toMatchObject({ tipo: 'aplicado', plan: 'pro', planExpira: '2026-12-20', diasCredito: 10 })
    expect(rpc).toHaveBeenCalledTimes(1)
    const args = (rpc.mock.calls[0] as unknown as [string, Record<string, unknown>])[1]
    expect(args.p_plan_expira).toBe('2026-12-20')
    // El estado anterior viaja tal cual: el CAS del RPC protege el credito.
    expect(args.p_prev_plan).toBe('basico')
    expect(args.p_prev_periodo).toBe('mensual')
    expect(args.p_prev_plan_expira).toBe('2026-11-30T00:00:00+00:00')
  })

  it('renovacion: sin credito, suma sobre plan_expira', async () => {
    const { rpc } = fakeAdmin(BASICO_20)
    const r = await aplicarTransaccionAprobada(tx('basico', 'mensual'), 'retorno')
    expect(r).toMatchObject({ tipo: 'aplicado', planExpira: '2026-12-30', diasCredito: 0 })
    expect((rpc.mock.calls[0] as unknown as [string, Record<string, unknown>])[1].p_plan_expira).toBe('2026-12-30')
  })

  it('desde gratis: sin credito', async () => {
    fakeAdmin({ plan: 'gratis', periodo_plan: null, plan_expira: null, plan_programado: null, usuario_id: 'u1' })
    const r = await aplicarTransaccionAprobada(tx('basico', 'anual'), 'webhook')
    expect(r).toMatchObject({ tipo: 'aplicado', planExpira: '2027-11-10', diasCredito: 0 })
  })
})

describe('guarda del cobro automatico (C-15 / C-5)', () => {
  const AUTO = () => tx('basico', 'mensual', 'auto2026-11-30')

  it('la fila tal como se cobro: se aplica como renovacion', async () => {
    const { rpc } = fakeAdmin(BASICO_20)
    const r = await aplicarTransaccionAprobada(AUTO(), 'webhook')
    expect(r).toMatchObject({ tipo: 'aplicado', planExpira: '2026-12-30' })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(notificarRenovacionCobrada).toHaveBeenCalledTimes(1)
  })

  it('upgrade manual en medio: REVISION, alerta, nada escrito, sin correo al dueno', async () => {
    const { rpc, updates } = fakeAdmin({ ...BASICO_20, plan: 'pro', plan_expira: '2026-12-20' })
    const r = await aplicarTransaccionAprobada(AUTO(), 'webhook')
    expect(r).toEqual({ tipo: 'estado_cambio', motivo: 'estado cambio' })
    expect(rpc).not.toHaveBeenCalled()
    expect(updates.filter((u) => u.tabla === 'restaurantes' || u.tabla === 'facturas')).toEqual([])
    expect(fallarCobroAutomatico).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fallarCobroAutomatico).mock.calls[0][1]).toMatchObject({
      fuenteId: 'f1', destino: 'REVISION', periodoFacturado: '2026-11-30', motivo: 'estado cambio',
    })
    expect(vi.mocked(fallarCobroAutomatico).mock.calls[0][1]).not.toHaveProperty('aviso')
    expect(enviarAlertaRevision).toHaveBeenCalledTimes(1)
    expect(vi.mocked(enviarAlertaRevision).mock.calls[0][2]).toBe('pago')
    expect(notificarPlanActivo).not.toHaveBeenCalled()
    expect(notificarRenovacionCobrada).not.toHaveBeenCalled()
  })

  it('cancelacion agendada: REVISION con motivo cambio agendado', async () => {
    const { rpc } = fakeAdmin({ ...BASICO_20, plan_programado: 'gratis' })
    const r = await aplicarTransaccionAprobada(AUTO(), 'webhook')
    expect(r).toEqual({ tipo: 'estado_cambio', motivo: 'cambio agendado' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reentrega (la marca ya estaba): sin segunda alerta', async () => {
    fakeAdmin({ ...BASICO_20, plan: 'pro' })
    vi.mocked(fallarCobroAutomatico).mockResolvedValueOnce({ marca: 'ya_registrado', correo: 'no_aplica' })
    const r = await aplicarTransaccionAprobada(AUTO(), 'webhook')
    expect(r.tipo).toBe('estado_cambio')
    expect(enviarAlertaRevision).not.toHaveBeenCalled()
  })

  it('sin fuente que marcar: alerta igual (la plata entro)', async () => {
    fakeAdmin({ ...BASICO_20, plan: 'pro' }, [])
    const r = await aplicarTransaccionAprobada(AUTO(), 'webhook')
    expect(r.tipo).toBe('estado_cambio')
    expect(fallarCobroAutomatico).not.toHaveBeenCalled()
    expect(enviarAlertaRevision).toHaveBeenCalledTimes(1)
  })

  it('la marca no se pudo escribir: error (500, Wompi reentrega)', async () => {
    fakeAdmin({ ...BASICO_20, plan: 'pro' })
    vi.mocked(fallarCobroAutomatico).mockResolvedValueOnce({ marca: 'error', correo: 'no_aplica' })
    const r = await aplicarTransaccionAprobada(AUTO(), 'webhook')
    expect(r).toEqual({ tipo: 'error' })
  })

  it('origen conciliacion: no marca ni alerta (lo hace la conciliacion)', async () => {
    const { rpc } = fakeAdmin({ ...BASICO_20, plan: 'pro' })
    const r = await aplicarTransaccionAprobada(AUTO(), 'conciliacion')
    expect(r).toEqual({ tipo: 'estado_cambio', motivo: 'estado cambio' })
    expect(rpc).not.toHaveBeenCalled()
    expect(fallarCobroAutomatico).not.toHaveBeenCalled()
    expect(enviarAlertaRevision).not.toHaveBeenCalled()
  })

  it('un pago MANUAL no pasa por la guarda', async () => {
    const { rpc } = fakeAdmin({ ...BASICO_20, plan_programado: 'gratis' })
    const r = await aplicarTransaccionAprobada(tx('pro', 'mensual'), 'webhook')
    expect(r.tipo).toBe('aplicado')
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
