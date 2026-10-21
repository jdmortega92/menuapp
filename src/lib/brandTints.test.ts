import { describe, it, expect } from 'vitest'
import {
  tinte,
  tintPlaceholder,
  washHero,
  washSutil,
  borderFuerte,
  borderSutil,
  glowBoton,
  gradientHeader,
} from './brandTints'
import { TEMAS_BASE, contraste, mezclar } from './temaColor'

// CIERRE P2a: los tintes dejaron de ser sufijos de alpha (`${color}15`) y pasaron
// a ser colores opacos calculados contra el fondo real. Sobre fondo claro deben
// verse IGUAL que antes (alpha compuesto sobre ese fondo, ±1/255 por redondeo);
// sobre fondo oscuro deben verse.

/** Lo que pintaba el navegador antes: `${color}${aa}` compuesto sobre `fondo`. */
const antes = (color: string, fondo: string, aa: number) => mezclar(fondo, color, aa / 255)

const difCanal = (a: string, b: string) =>
  Math.max(...[1, 3, 5].map((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16))))

describe('brandTints sobre fondos claros: mismo resultado visual que el alpha de antes', () => {
  const claros = [TEMAS_BASE.claro, TEMAS_BASE.natural, TEMAS_BASE.premium]
  for (const t of claros) {
    for (const c of ['#E85D24', '#1A1A18', '#D4A017']) {
      it(`${c} sobre ${t.bg}`, () => {
        expect(difCanal(tintPlaceholder(c, t.surface), antes(c, t.surface, 0x15))).toBeLessThanOrEqual(1)
        expect(difCanal(washHero(c, t.bg), antes(c, t.bg, 0x10))).toBeLessThanOrEqual(1)
        expect(difCanal(washSutil(c, t.bg), antes(c, t.bg, 0x08))).toBeLessThanOrEqual(1)
        expect(difCanal(borderFuerte(c, t.surface).replace('1px solid ', ''), antes(c, t.surface, 0x30))).toBeLessThanOrEqual(1)
        expect(difCanal(borderSutil(c, t.bg).replace('1px solid ', ''), antes(c, t.bg, 0x20))).toBeLessThanOrEqual(1)
      })
    }
  }

  it('strings exactos para el naranja por defecto en Claro', () => {
    const c = '#E85D24'
    expect(tintPlaceholder(c, '#FFFFFF')).toBe('#FDF2ED')
    expect(borderFuerte(c, '#FFFFFF')).toBe('1px solid #FBE1D6')
    expect(glowBoton(c, '#FDFBF7')).toBe('0 4px 20px #E85D2440')
    expect(gradientHeader(c, '#FDFBF7')).toBe('linear-gradient(135deg, #E85D24 0%, #EC7D4E 50%, #F09C78 100%)')
  })
})

describe('brandTints sobre Oscuro: visibles', () => {
  const o = TEMAS_BASE.oscuro
  // Visibilidad de referencia: el mismo tinte sobre blanco.
  const ref = (c: string, aa: number) => contraste(antes(c, '#FFFFFF', aa), '#FFFFFF')

  for (const c of ['#E85D24', '#1565C0', '#D4A017', '#1B5E20', '#4E342E', '#1A1A18']) {
    it(`${c}: placeholder y lavados se ven al menos como sobre blanco`, () => {
      expect(contraste(tintPlaceholder(c, o.surface), o.surface)).toBeGreaterThanOrEqual(ref(c, 0x15))
      expect(contraste(washHero(c, o.bg), o.bg)).toBeGreaterThanOrEqual(ref(c, 0x10))
      expect(contraste(washSutil(c, o.bg), o.bg)).toBeGreaterThanOrEqual(ref(c, 0x08))
      // y más que el alpha de antes, que sobre oscuro casi desaparecía
      expect(contraste(tintPlaceholder(c, o.surface), o.surface)).toBeGreaterThan(contraste(antes(c, o.surface, 0x15), o.surface))
    })
  }

  it('glow más denso sobre oscuro', () => {
    expect(glowBoton('#E85D24', o.bg)).toBe('0 4px 20px #E85D2466')
  })

  it('no ensucia sobre fondo saturado: el resultado conserva más del fondo que de la marca', () => {
    const verde = '#2E7D32'
    const x = tinte('#E85D24', verde, 0x15 / 255)
    expect(difCanal(x, verde)).toBeLessThan(difCanal(x, '#E85D24'))
  })
})

describe('entradas inválidas', () => {
  it('marca inválida → sin tinte (el fondo); fondo inválido → se asume blanco', () => {
    expect(tintPlaceholder('naranja', '#1C1C1A')).toBe('#1C1C1A')
    expect(tintPlaceholder('#E85D24', 'x')).toBe(tintPlaceholder('#E85D24', '#FFFFFF'))
    expect(glowBoton('naranja', '#FFFFFF')).toBe('none')
  })
})
