import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { obtenerTransaccion } from './wompiApi'

// GET /transactions/{id} con LLAVE PRIVADA (smoke 5a: sin llave o con la publica
// Wompi responde 404). Sin red: fetch y las variables de entorno se simulan.

const PRIVADA = 'prv_test_SECRETO_DE_PRUEBA_123'
const PUBLICA = 'pub_test_publica_de_prueba_456'
const ID = '12147249-1792514092-65778'

function respuesta(status: number, cuerpo: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as unknown as Response
}

let logs: string[] = []
let fetchMock: ReturnType<typeof vi.fn>

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
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Ningun log puede llevar la llave, un pedazo de ella ni su longitud. */
function sinFugas() {
  for (const l of logs) {
    expect(l).not.toContain(PRIVADA)
    expect(l).not.toContain('SECRETO')
    expect(l).not.toContain(PUBLICA)
    expect(l).not.toMatch(/len[=:]/)
    expect(l).not.toContain(String(PRIVADA.length))
  }
}

describe('obtenerTransaccion', () => {
  it('manda Authorization: Bearer <llave privada> a /transactions/{id} del entorno', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { data: { id: ID, status: 'APPROVED', reference: 'sub_x_pro_mensual_1' } }))
    const r = await obtenerTransaccion(ID, 'test')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`https://sandbox.wompi.co/v1/transactions/${ID}`)
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${PRIVADA}`)
    expect(r).toEqual({ ok: true, datos: { id: ID, status: 'APPROVED', reference: 'sub_x_pro_mensual_1' } })
  })

  it('el log dice llave=privada y no filtra la llave', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { data: { id: ID } }))
    await obtenerTransaccion(ID, 'test')
    expect(logs.some(l => l.includes('GET /transactions/{id} llave=privada -> 200'))).toBe(true)
    sinFugas()
  })

  it('sin llave privada: NO llama a Wompi y solo loguea cual falta', async () => {
    vi.stubEnv('WOMPI_PRIVATE_KEY', '')
    const r = await obtenerTransaccion(ID, 'test')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(r).toEqual({ ok: false, status: 500, mensaje: 'Falta la llave privada' })
    expect(logs.some(l => l.includes('falta la llave: privada'))).toBe(true)
    sinFugas()
  })

  it('404 de Wompi se devuelve como 404 (la ruta responde 404)', async () => {
    fetchMock.mockResolvedValue(respuesta(404, { error: { type: 'NOT_FOUND_ERROR' } }))
    const r = await obtenerTransaccion(ID, 'test')
    expect(r).toEqual({ ok: false, status: 404, mensaje: 'NOT_FOUND_ERROR' })
    sinFugas()
  })

  it('id invalido: ni siquiera revisa llaves ni llama a Wompi', async () => {
    const r = await obtenerTransaccion('1-2', 'test')
    expect(r.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
