import { describe, it, expect } from 'vitest'
import {
  tintPlaceholder,
  washHero,
  washSutil,
  borderFuerte,
  borderSutil,
  glowBoton,
  gradientHeader,
} from './brandTints'

// Estos asserts CONGELAN la paridad byte-a-byte que hace segura la adopción del
// part 2: cada función debe devolver exactamente el string que los call sites
// producen hoy.
describe('brandTints', () => {
  describe("color por defecto '#E85D24'", () => {
    const c = '#E85D24'
    it('tintPlaceholder', () => expect(tintPlaceholder(c)).toBe('#E85D2415'))
    it('washHero', () => expect(washHero(c)).toBe('#E85D2410'))
    it('washSutil', () => expect(washSutil(c)).toBe('#E85D2408'))
    it('borderFuerte', () => expect(borderFuerte(c)).toBe('1px solid #E85D2430'))
    it('borderSutil', () => expect(borderSutil(c)).toBe('1px solid #E85D2420'))
    it('glowBoton', () => expect(glowBoton(c)).toBe('0 4px 20px #E85D2440'))
    it('gradientHeader', () =>
      expect(gradientHeader(c)).toBe(
        'linear-gradient(135deg, #E85D24 0%, #E85D24CC 50%, #E85D2499 100%)',
      ))
  })

  describe("otro color '#1A1A18'", () => {
    const c = '#1A1A18'
    it('tintPlaceholder', () => expect(tintPlaceholder(c)).toBe('#1A1A1815'))
    it('washHero', () => expect(washHero(c)).toBe('#1A1A1810'))
    it('washSutil', () => expect(washSutil(c)).toBe('#1A1A1808'))
    it('borderFuerte', () => expect(borderFuerte(c)).toBe('1px solid #1A1A1830'))
    it('borderSutil', () => expect(borderSutil(c)).toBe('1px solid #1A1A1820'))
    it('glowBoton', () => expect(glowBoton(c)).toBe('0 4px 20px #1A1A1840'))
    it('gradientHeader', () =>
      expect(gradientHeader(c)).toBe(
        'linear-gradient(135deg, #1A1A18 0%, #1A1A18CC 50%, #1A1A1899 100%)',
      ))
  })
})
