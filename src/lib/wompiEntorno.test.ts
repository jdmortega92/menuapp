// CIERRE 4: resolucion del entorno de Wompi y freno del cobro automatico.
// Las llaves de prueba son strings inventados con el prefijo correcto.
import { describe, it, expect } from 'vitest'
import { resolverEntornoWompi, API_WOMPI } from './wompiEntorno'
import { cobroAutomaticoHabilitado } from './frenoCobro'

const PRV_TEST = 'prv_test_abc'
const PRV_PROD = 'prv_prod_abc'
const PUB_TEST = 'pub_test_abc'
const PUB_PROD = 'pub_prod_abc'

describe('resolverEntornoWompi', () => {
  it('test + test: sandbox', () => {
    expect(resolverEntornoWompi({ privada: PRV_TEST, publica: PUB_TEST })).toEqual({
      ok: true, entorno: 'test', apiBase: 'https://sandbox.wompi.co/v1',
    })
  })
  it('prod + prod: production', () => {
    expect(resolverEntornoWompi({ privada: PRV_PROD, publica: PUB_PROD })).toEqual({
      ok: true, entorno: 'prod', apiBase: 'https://production.wompi.co/v1',
    })
  })
  it('recorta espacios y newlines pegados', () => {
    const r = resolverEntornoWompi({ privada: ` ${PRV_PROD}\n`, publica: `${PUB_PROD} ` })
    expect(r.ok && r.entorno).toBe('prod')
  })

  it('privada desconocida o ausente: falla cerrado', () => {
    for (const privada of ['', null, undefined, 'prv_stagtest_x', 'pub_test_x', 'sk_live_x']) {
      const r = resolverEntornoWompi({ privada, publica: PUB_TEST })
      expect(r.ok).toBe(false)
    }
  })
  it('publica desconocida o ausente: falla cerrado', () => {
    for (const publica of ['', null, undefined, 'prv_test_x', 'pk_x']) {
      const r = resolverEntornoWompi({ privada: PRV_TEST, publica })
      expect(r.ok).toBe(false)
    }
  })
  it('privada y publica de entornos distintos: falla cerrado', () => {
    expect(resolverEntornoWompi({ privada: PRV_PROD, publica: PUB_TEST }).ok).toBe(false)
    expect(resolverEntornoWompi({ privada: PRV_TEST, publica: PUB_PROD }).ok).toBe(false)
  })
  it('el mensaje de error no contiene material de las llaves', () => {
    const r = resolverEntornoWompi({ privada: 'prv_prod_SECRETO', publica: 'pub_test_SECRETO' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).not.toContain('SECRETO')
  })

  it('WOMPI_API_URL ausente o vacia: se ignora', () => {
    expect(resolverEntornoWompi({ privada: PRV_PROD, publica: PUB_PROD, apiUrl: '' }).ok).toBe(true)
    expect(resolverEntornoWompi({ privada: PRV_PROD, publica: PUB_PROD, apiUrl: '  ' }).ok).toBe(true)
    expect(resolverEntornoWompi({ privada: PRV_PROD, publica: PUB_PROD, apiUrl: null }).ok).toBe(true)
  })
  it('WOMPI_API_URL del MISMO entorno (con o sin barra final): ok', () => {
    expect(resolverEntornoWompi({ privada: PRV_PROD, publica: PUB_PROD, apiUrl: API_WOMPI.prod }).ok).toBe(true)
    expect(resolverEntornoWompi({ privada: PRV_TEST, publica: PUB_TEST, apiUrl: `${API_WOMPI.test}/` }).ok).toBe(true)
  })
  it('WOMPI_API_URL del OTRO entorno: falla cerrado', () => {
    expect(resolverEntornoWompi({ privada: PRV_PROD, publica: PUB_PROD, apiUrl: API_WOMPI.test }).ok).toBe(false)
    expect(resolverEntornoWompi({ privada: PRV_TEST, publica: PUB_TEST, apiUrl: API_WOMPI.prod }).ok).toBe(false)
  })
  it('WOMPI_API_URL desconocida: falla cerrado', () => {
    expect(resolverEntornoWompi({ privada: PRV_PROD, publica: PUB_PROD, apiUrl: 'https://evil.example/v1' }).ok).toBe(false)
  })
})

describe('cobroAutomaticoHabilitado', () => {
  it("solo 'true' exacto lo enciende", () => {
    expect(cobroAutomaticoHabilitado('true')).toBe(true)
  })
  // (undefined no se prueba aqui: dispara el default, que lee process.env.)
  it('vacio o cualquier otro valor: apagado', () => {
    for (const v of ['', 'false', 'TRUE', 'True', '1', 'yes', ' true', 'true ']) {
      expect(cobroAutomaticoHabilitado(v)).toBe(false)
    }
  })
})
