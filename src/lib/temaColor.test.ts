import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  TEMAS_BASE, TEMAS_BASE_IDS, VARS_COLOR_TEMA, BLANCO, NEGRO, TEXTO_OSCURO,
  normalizeHex, luminancia, contraste, mezclar, esFondoOscuro, textoSobre, textoSobreEstricto, MINIMO_BLANCO_MARCA,
  ajustarTono, marcaSobreFondo, paletaTema, varsColorTema,
  type ColoresTema,
} from './temaColor'
import { SEMANTICOS, GANADOR_OSCURO, estiloMenuPublico } from './estiloTema'

// Paleta curada de /config (config/page.tsx, coloresPreset).
const PRESETS = [
  '#E85D24', '#B85C38', '#C0392B', '#722F37', '#E91E63', '#D4A017', '#A87900', '#7B4B2A', '#4E342E',
  '#1B5E20', '#5C6B2F', '#2D5A3D', '#1565C0', '#1F3A5F', '#6C63FF', '#47566A', '#1A1A18',
]

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

/** Variables declaradas en el primer bloque `selector { … }` de globals.css. */
function bloque(selector: string): Record<string, string> {
  const i = css.indexOf(`${selector} {`)
  if (i < 0) throw new Error(`No está ${selector} en globals.css`)
  const cuerpo = css.slice(i, css.indexOf('}', i))
  const out: Record<string, string> = {}
  for (const m of cuerpo.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

describe('normalizeHex', () => {
  it('acepta #RRGGBB y lo pasa a mayúsculas', () => {
    expect(normalizeHex('#e85d24')).toBe('#E85D24')
    expect(normalizeHex('  #1a1A18 ')).toBe('#1A1A18')
  })
  it('rechaza todo lo demás', () => {
    for (const v of ['E85D24', '#FFF', '#E85D2415', 'red', 'rgb(0,0,0)', '#GGGGGG', '', null, undefined, 42]) {
      expect(normalizeHex(v)).toBeNull()
    }
  })
})

describe('luminancia y contraste (WCAG 2.x)', () => {
  it('extremos', () => {
    expect(luminancia(BLANCO)).toBeCloseTo(1, 5)
    expect(luminancia(NEGRO)).toBeCloseTo(0, 5)
    expect(contraste(BLANCO, NEGRO)).toBeCloseTo(21, 5)
    expect(contraste('#777777', '#777777')).toBeCloseTo(1, 5)
  })
  it('pares conocidos', () => {
    expect(contraste('#767676', BLANCO)).toBeCloseTo(4.54, 2) // el gris más claro AA sobre blanco
    expect(contraste('#777777', BLANCO)).toBeCloseTo(4.48, 2)
    expect(contraste('#FF0000', BLANCO)).toBeCloseTo(4.0, 1)
    expect(contraste('#0000FF', BLANCO)).toBeCloseTo(8.59, 2)
  })
  it('es simétrico', () => {
    expect(contraste('#E85D24', '#0F0F0E')).toBe(contraste('#0F0F0E', '#E85D24'))
  })
  it('mezclar', () => {
    expect(mezclar('#000000', '#FFFFFF', 0)).toBe('#000000')
    expect(mezclar('#000000', '#FFFFFF', 1)).toBe('#FFFFFF')
    expect(mezclar('#000000', '#FFFFFF', 0.5)).toBe('#808080')
  })
})

describe('textoSobre', () => {
  it('blanco → casi negro; negro → blanco', () => {
    expect(textoSobre(BLANCO)).toBe(TEXTO_OSCURO)
    expect(textoSobre(NEGRO)).toBe(BLANCO)
  })
  it('naranja por defecto #E85D24 → blanco (3.49:1, marca conserva blanco hasta 3:1)', () => {
    expect(textoSobre('#E85D24')).toBe(BLANCO)
  })
  it('Dorado #D4A017 → casi negro (blanco da 2.4:1)', () => {
    expect(textoSobre('#D4A017')).toBe(TEXTO_OSCURO)
    expect(contraste(TEXTO_OSCURO, '#D4A017')).toBeGreaterThanOrEqual(4.5)
  })
  it.each(PRESETS)('preset %s: blanco si llega a 3:1; si no, oscuro que llega a 4.5:1', (p) => {
    const t = textoSobre(p)
    if (contraste(BLANCO, p) >= MINIMO_BLANCO_MARCA) {
      expect(t).toBe(BLANCO)
    } else {
      expect([TEXTO_OSCURO, NEGRO]).toContain(t)
      expect(contraste(t, p)).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('barrido: blanco >= 3:1 o texto oscuro >= 4.5:1, siempre', () => {
    for (let v = 0; v <= 255; v += 5) {
      for (const c of [mezclar('#000000', '#FFFFFF', v / 255), mezclar('#000000', '#E91E63', v / 255), mezclar('#000000', '#25D366', v / 255)]) {
        const t = textoSobre(c)
        expect(contraste(t, c)).toBeGreaterThanOrEqual(t === BLANCO ? 3 : 4.5)
      }
    }
  })
  it('estricto (semánticos): siempre >= 4.5:1; el verde de Oscuro lleva texto oscuro', () => {
    for (let v = 0; v <= 255; v += 5) {
      const c = mezclar('#000000', '#1D9E75', v / 255)
      expect(contraste(textoSobreEstricto(c), c)).toBeGreaterThanOrEqual(4.5)
    }
    expect(textoSobreEstricto('#1D9E75')).toBe(TEXTO_OSCURO)
    expect(textoSobre('#1D9E75')).toBe(BLANCO) // con la regla de marca sería blanco (3.4:1)
  })
  it('color inválido → blanco (comportamiento previo)', () => {
    expect(textoSobre('naranja')).toBe(BLANCO)
  })
})

describe('TEMAS_BASE = globals.css (deriva)', () => {
  it.each(TEMAS_BASE_IDS)('.theme-%s', (id) => {
    const vars = bloque(`.theme-${id}`)
    for (const k of Object.keys(VARS_COLOR_TEMA) as (keyof ColoresTema)[]) {
      expect(vars[VARS_COLOR_TEMA[k]], `${id} ${VARS_COLOR_TEMA[k]}`).toBe(TEMAS_BASE[id][k])
    }
  })
  it('semánticos de :root', () => {
    const root = bloque(':root')
    expect(root['--color-green']).toBe(SEMANTICOS.ok)
    expect(root['--color-danger']).toBe(SEMANTICOS.peligro)
    expect(root['--color-warning']).toBe(SEMANTICOS.aviso)
    expect(root['--color-info']).toBe(SEMANTICOS.info)
    expect(root['--color-rating']).toBe(SEMANTICOS.rating)
  })
  it('varsColorTema produce los nombres --theme-*', () => {
    expect(varsColorTema(TEMAS_BASE.claro)['--theme-bg']).toBe('#FDFBF7')
    expect(Object.keys(varsColorTema(TEMAS_BASE.claro))).toHaveLength(10)
  })
})

describe('ajustarTono', () => {
  it('si ya cumple no cambia', () => {
    expect(ajustarTono('#1A1A18', ['#FFFFFF'], 4.5)).toBe('#1A1A18')
  })
  it('oscurece sobre claro y aclara sobre oscuro, hasta el mínimo', () => {
    const sobreClaro = ajustarTono('#F2A623', ['#FFFFFF'], 4.5)
    expect(contraste(sobreClaro, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    expect(luminancia(sobreClaro)).toBeLessThan(luminancia('#F2A623'))
    const sobreOscuro = ajustarTono('#C0392B', ['#0F0F0E'], 4.5)
    expect(contraste(sobreOscuro, '#0F0F0E')).toBeGreaterThanOrEqual(4.5)
    expect(luminancia(sobreOscuro)).toBeGreaterThan(luminancia('#C0392B'))
  })
})

describe('marcaSobreFondo', () => {
  it('cumple → sin sugerencias', () => {
    const r = marcaSobreFondo('#1A1A18', '#FDFBF7')
    expect(r.cumple).toBe(true)
    expect(r.sugerencias).toEqual([])
  })
  it('no cumple → hasta 3 tonos que llegan a 4.5:1', () => {
    for (const [marca, fondo] of [['#4E342E', '#3B2A20'], ['#1A1A18', '#0F0F0E'], ['#D4A017', '#FDFBF7'], ['#E85D24', '#2E7D32']]) {
      const r = marcaSobreFondo(marca, fondo)
      expect(r.cumple).toBe(false)
      expect(r.sugerencias.length).toBeGreaterThan(0)
      expect(r.sugerencias.length).toBeLessThanOrEqual(3)
      for (const s of r.sugerencias) expect(contraste(s, fondo)).toBeGreaterThanOrEqual(4.5)
      expect(new Set(r.sugerencias).size).toBe(r.sugerencias.length)
    }
  })
})

/** Verifica todas las garantías de paletaTema. */
function verificarPaleta(fondo: string, superficie?: string) {
  const p = paletaTema('claro', fondo, superficie)
  const sup = [p.bg, p.surface, p.surfaceMuted]
  const min = (c: string) => Math.min(...sup.map((s) => contraste(c, s)))
  const extremo = p.oscuro ? BLANCO : NEGRO
  const alcanzable = Math.min(...sup.map((s) => contraste(extremo, s)))
  expect(min(p.text), `${fondo} text`).toBeGreaterThanOrEqual(Math.min(7, alcanzable) - 1e-9)
  expect(min(p.text), `${fondo} text`).toBeGreaterThanOrEqual(4.5)
  expect(min(p.textMuted), `${fondo} muted`).toBeGreaterThanOrEqual(4.5)
  expect(min(p.textSubtle), `${fondo} subtle`).toBeGreaterThanOrEqual(3)
  for (const b of [p.border, p.borderStrong]) {
    expect(contraste(b, p.bg), `${fondo} borde`).toBeGreaterThanOrEqual(1.15)
    expect(contraste(b, p.bg), `${fondo} borde suave`).toBeLessThan(3)
  }
  expect(contraste(p.borderStrong, p.bg)).toBeGreaterThanOrEqual(contraste(p.border, p.bg))
  if (!superficie) expect(contraste(p.surface, p.bg), `${fondo} superficie cerca del fondo`).toBeLessThan(1.6)
  if (p.oscuro) {
    // Sombras visibles sobre oscuro: alpha alto
    const alpha = (s: string) => Number(s.match(/,([0-9.]+)\)$/)![1])
    expect(alpha(p.shadowCard)).toBeGreaterThanOrEqual(0.3)
    expect(alpha(p.shadowModal)).toBeGreaterThanOrEqual(0.45)
  }
  return p
}

describe('paletaTema', () => {
  it('fondo claro', () => {
    const p = verificarPaleta('#F4EFE6')
    expect(p.oscuro).toBe(false)
    expect(luminancia(p.surface)).toBeGreaterThan(luminancia(p.bg))
  })
  it('fondo oscuro', () => {
    const p = verificarPaleta('#121212')
    expect(p.oscuro).toBe(true)
    expect(luminancia(p.surface)).toBeGreaterThan(luminancia(p.bg)) // superficie elevada, más clara
  })
  it('verde saturado (7:1 no alcanzable: nunca baja de 4.5)', () => {
    const p = verificarPaleta('#2E7D32')
    expect(p.oscuro).toBe(true)
  })
  it('café oscuro', () => {
    verificarPaleta('#3B2A20')
  })
  it('texto teñido hacia el matiz del fondo (no gris puro)', () => {
    const p = paletaTema('oscuro', '#3B2A20')
    const [r, , b] = [parseInt(p.text.slice(1, 3), 16), 0, parseInt(p.text.slice(5, 7), 16)]
    expect(r).toBeGreaterThan(b)
  })
  it('superficie dada se respeta si se puede', () => {
    const p = verificarPaleta('#3B2A20', '#4A3628')
    expect(p.surface).toBe('#4A3628')
    expect(p.superficieAjustada).toBe(false)
  })
  it('superficie imposible (crema sobre café) se acerca al fondo y avisa', () => {
    const p = verificarPaleta('#3B2A20', '#F4EFE6')
    expect(p.superficieAjustada).toBe(true)
  })
  it('barrido de fondos: las garantías valen siempre', () => {
    const tonos = ['#FFFFFF', '#000000', '#E85D24', '#2E7D32', '#1565C0', '#D4A017', '#E91E63', '#7CB342', '#808080']
    for (const t of tonos) for (const k of [0, 0.25, 0.5, 0.75]) {
      verificarPaleta(mezclar(t, '#000000', k))
      verificarPaleta(mezclar(t, '#FFFFFF', k))
    }
  })
  it('fondo inválido → colores del tema base', () => {
    const p = paletaTema('natural', 'cafecito')
    expect(p.bg).toBe(TEMAS_BASE.natural.bg)
    expect(p.text).toBe(TEMAS_BASE.natural.text)
  })
})

describe('estiloMenuPublico (cuatro temas base)', () => {
  it.each(TEMAS_BASE_IDS)('%s: semánticos legibles contra fondo, tarjeta y superficie apagada', (id) => {
    const b = TEMAS_BASE[id]
    const e = estiloMenuPublico(id, '#E85D24')
    const fondos = [b.bg, b.surface, b.surfaceMuted]
    const min = (c: string) => Math.min(...fondos.map((f) => contraste(c, f)))
    for (const v of ['--tema-ok', '--tema-peligro', '--tema-aviso', '--tema-rating-texto']) {
      expect(min(e[v]), `${id} ${v}`).toBeGreaterThanOrEqual(4.5)
    }
    expect(min(e['--tema-rating']), `${id} estrellas`).toBeGreaterThanOrEqual(3)
    expect(contraste(e['--tema-info'], e['--tema-info-fondo'])).toBeGreaterThanOrEqual(4.5)
    expect(contraste(e['--tema-ok-sobre'], e['--tema-ok'])).toBeGreaterThanOrEqual(4.5)
    expect(e.colorScheme).toBe(esFondoOscuro(b.bg) ? 'dark' : 'light')
  })
  it('oscuro usa la placa Ganador oscura y legible', () => {
    const e = estiloMenuPublico('oscuro', '#E85D24')
    expect(e['--ganador-bg-start']).toBe(GANADOR_OSCURO.bgStart)
    for (const fondo of [GANADOR_OSCURO.bgStart, GANADOR_OSCURO.bgEnd]) {
      expect(contraste(GANADOR_OSCURO.texto, fondo)).toBeGreaterThanOrEqual(7)
      expect(contraste(GANADOR_OSCURO.textoMuted, fondo)).toBeGreaterThanOrEqual(4.5)
      expect(contraste(GANADOR_OSCURO.tinta, fondo)).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('temas claros conservan la placa dorada de siempre', () => {
    for (const id of ['claro', 'natural', 'premium'] as const) {
      expect(estiloMenuPublico(id, '#E85D24')['--ganador-bg-start']).toBe('var(--gold-bg-start)')
    }
  })
  it('sin paleta no pisa las --theme-* de la clase; con paleta sí las define', () => {
    expect(estiloMenuPublico('oscuro', '#E85D24')['--theme-bg']).toBeUndefined()
    const p = paletaTema('oscuro', '#3B2A20')
    expect(estiloMenuPublico('oscuro', '#E85D24', p)['--theme-bg']).toBe('#3B2A20')
  })
})
