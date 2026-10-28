import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./sender', () => ({ enviarEmail: vi.fn(async () => ({ data: { id: 'm1' }, error: null })) }))

import { enviarAlertaRevision } from './alertaAdmin'
import { enviarEmail } from './sender'
import { alertaRevision } from './templates/alertaRevision'
import type { FilaRevision } from '@/lib/pagos/conciliacion'

const FILAS: FilaRevision[] = [
  { restauranteId: 'c8a8c0d2-5887-4dd2-a37a-266fe4b856bf', motivo: 'resultado desconocido', referencia: 'sub_c8a8c0d2-5887-4dd2-a37a-266fe4b856bf_basico_mensual_auto2026-10-30', txId: null },
  { restauranteId: '6e293a8d-b4bc-4d53-ae15-c2340cb0218e', motivo: 'pendiente 7 dias', referencia: null, txId: '12147249-1792514092-65778' },
]

let logs: string[] = []

beforeEach(() => {
  logs = []
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) })
  vi.mocked(enviarEmail).mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('alertaRevision (plantilla)', () => {
  it('lista cada fila con restaurante, motivo, referencia y tx id', () => {
    const c = alertaRevision(FILAS)
    expect(c.text).toContain('restaurante=c8a8c0d2-5887-4dd2-a37a-266fe4b856bf motivo=resultado desconocido referencia=sub_c8a8c0d2-5887-4dd2-a37a-266fe4b856bf_basico_mensual_auto2026-10-30 tx=-')
    expect(c.text).toContain('restaurante=6e293a8d-b4bc-4d53-ae15-c2340cb0218e motivo=pendiente 7 dias referencia=- tx=12147249-1792514092-65778')
    expect(c.html).toContain('motivo=pendiente 7 dias')
    expect(c.text).not.toContain('@')
  })
  it('una fila: singular, con tildes, en asunto y cuerpo', () => {
    const c = alertaRevision(FILAS.slice(0, 1))
    expect(c.subject).toBe('[MenuApp] Un cobro automático en revisión')
    expect(c.text.split('\n').slice(0, 2)).toEqual([
      'Un cobro automático quedó en revisión en esta corrida del cron.',
      'No se le avisó al dueño. Revisa cada uno en el panel de Wompi antes de tocar la fila.',
    ])
    expect(c.html).toContain('Un cobro automático quedó en revisión en esta corrida del cron.')
    expect(c.html).toContain('No se le avisó al dueño. Revisa cada uno en el panel de Wompi antes de tocar la fila.')
    expect(c.text.split('\n').filter((l) => l.startsWith('restaurante='))).toHaveLength(1)
  })

  it('dos filas: plural, con tildes, en asunto y cuerpo', () => {
    const c = alertaRevision(FILAS)
    expect(c.subject).toBe('[MenuApp] 2 cobros automáticos en revisión')
    expect(c.text.split('\n').slice(0, 2)).toEqual([
      '2 cobros automáticos quedaron en revisión en esta corrida del cron.',
      'No se le avisó al dueño. Revisa cada uno en el panel de Wompi antes de tocar la fila.',
    ])
    expect(c.html).toContain('2 cobros automáticos quedaron en revisión en esta corrida del cron.')
    expect(c.text.split('\n').filter((l) => l.startsWith('restaurante='))).toHaveLength(2)
  })
})

describe('enviarAlertaRevision', () => {
  it('UN correo a ALERTAS_EMAIL con todas las filas', async () => {
    vi.stubEnv('ALERTAS_EMAIL', 'alertas@example.com')
    expect(await enviarAlertaRevision(FILAS, 'test')).toBe('enviada')
    expect(enviarEmail).toHaveBeenCalledTimes(1)
    expect(vi.mocked(enviarEmail).mock.calls[0][0].to).toBe('alertas@example.com')
  })

  it('sin filas no manda nada', async () => {
    vi.stubEnv('ALERTAS_EMAIL', 'alertas@example.com')
    expect(await enviarAlertaRevision([], 'test')).toBe('sin_filas')
    expect(enviarEmail).not.toHaveBeenCalled()
  })

  it('sin ALERTAS_EMAIL: loguea UNA vez que falta y sigue', async () => {
    vi.stubEnv('ALERTAS_EMAIL', '')
    expect(await enviarAlertaRevision(FILAS, 'test')).toBe('sin_destino')
    expect(enviarEmail).not.toHaveBeenCalled()
    expect(logs).toEqual(['[test] falta ALERTAS_EMAIL'])
  })

  it('un error de Resend no lanza', async () => {
    vi.stubEnv('ALERTAS_EMAIL', 'alertas@example.com')
    vi.mocked(enviarEmail).mockResolvedValueOnce({ data: null, error: { message: 'x' } } as never)
    expect(await enviarAlertaRevision(FILAS, 'test')).toBe('fallo')
    vi.mocked(enviarEmail).mockRejectedValueOnce(new Error('red'))
    expect(await enviarAlertaRevision(FILAS, 'test')).toBe('fallo')
  })
})
