import { describe, it, expect } from 'vitest'
import { puedeSubirFoto, mostrarFotosPublico, LIMITE_FOTOS_GRATIS } from './fotosGate'

describe('puedeSubirFoto', () => {
  it('básico/pro: siempre, sin importar fue_pago ni conteo', () => {
    expect(puedeSubirFoto('basico', false, 0)).toBe(true)
    expect(puedeSubirFoto('basico', true, 999)).toBe(true)
    expect(puedeSubirFoto('pro', false, 0)).toBe(true)
    expect(puedeSubirFoto('pro', true, 999)).toBe(true)
  })

  it('gratis nunca-pago: permitido mientras el conteo VIVO esté bajo el límite', () => {
    expect(puedeSubirFoto('gratis', false, 0)).toBe(true)
    expect(puedeSubirFoto('gratis', false, LIMITE_FOTOS_GRATIS - 1)).toBe(true)
  })

  it('gratis nunca-pago: bloqueado en el límite exacto y por encima', () => {
    expect(puedeSubirFoto('gratis', false, LIMITE_FOTOS_GRATIS)).toBe(false)
    expect(puedeSubirFoto('gratis', false, LIMITE_FOTOS_GRATIS + 1)).toBe(false)
  })

  it('borrar una foto libera cupo (cap vivo, no presupuesto de por vida)', () => {
    // En el límite → bloqueado; tras borrar una (conteo-1) → permitido de nuevo.
    expect(puedeSubirFoto('gratis', false, LIMITE_FOTOS_GRATIS)).toBe(false)
    expect(puedeSubirFoto('gratis', false, LIMITE_FOTOS_GRATIS - 1)).toBe(true)
  })

  it('gratis fue_pago (downgrade): cero subidas, incluso con cupo', () => {
    expect(puedeSubirFoto('gratis', true, 0)).toBe(false)
    expect(puedeSubirFoto('gratis', true, LIMITE_FOTOS_GRATIS - 1)).toBe(false)
  })
})

describe('mostrarFotosPublico', () => {
  it('básico/pro: siempre visibles, sin importar fue_pago', () => {
    expect(mostrarFotosPublico('basico', false)).toBe(true)
    expect(mostrarFotosPublico('basico', true)).toBe(true)
    expect(mostrarFotosPublico('pro', false)).toBe(true)
    expect(mostrarFotosPublico('pro', true)).toBe(true)
  })

  it('gratis nunca-pago: visibles (lo NUEVO de STRATEGIC.2)', () => {
    expect(mostrarFotosPublico('gratis', false)).toBe(true)
  })

  it('gratis fue_pago (downgrade): ocultas (comportamiento previo conservado)', () => {
    expect(mostrarFotosPublico('gratis', true)).toBe(false)
  })
})
