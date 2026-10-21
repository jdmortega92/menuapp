// Motor de color del menú público (CIERRE P2a). Funciones puras, sin React.
// Las clases .theme-* de globals.css siguen siendo la fuente de verdad de cómo
// se ven los cuatro temas; TEMAS_BASE es una COPIA de sus colores (un test
// falla si se desincronizan) para poder calcular contraste y tintes en JS.
// Contraste y luminancia: WCAG 2.x.

export type TemaBaseId = 'claro' | 'oscuro' | 'natural' | 'premium'

export const TEMAS_BASE_IDS: TemaBaseId[] = ['claro', 'oscuro', 'natural', 'premium']

/** Variables de COLOR de un tema. Fuentes, radios y títulos no viven aquí. */
export interface ColoresTema {
  bg: string
  surface: string
  surfaceMuted: string
  text: string
  textMuted: string
  textSubtle: string
  border: string
  borderStrong: string
  shadowCard: string
  shadowModal: string
}

/** Nombre de la variable CSS de cada color de tema. */
export const VARS_COLOR_TEMA: Record<keyof ColoresTema, string> = {
  bg: '--theme-bg',
  surface: '--theme-surface',
  surfaceMuted: '--theme-surface-muted',
  text: '--theme-text',
  textMuted: '--theme-text-muted',
  textSubtle: '--theme-text-subtle',
  border: '--theme-border',
  borderStrong: '--theme-border-strong',
  shadowCard: '--theme-shadow-card',
  shadowModal: '--theme-shadow-modal',
}

/** Copia de globals.css (.theme-*). Cambiar un valor aquí sin cambiarlo allá rompe temaColor.test.ts. */
export const TEMAS_BASE: Record<TemaBaseId, ColoresTema> = {
  claro: {
    bg: '#FDFBF7', surface: '#FFFFFF', surfaceMuted: '#F5F4F0',
    text: '#1A1A18', textMuted: '#6B6A65', textSubtle: '#A3A29C',
    border: '#E8E6E0', borderStrong: '#D3D1C7',
    shadowCard: '0 1px 3px rgba(0,0,0,0.04)', shadowModal: '0 20px 60px rgba(0,0,0,0.15)',
  },
  oscuro: {
    bg: '#0F0F0E', surface: '#1C1C1A', surfaceMuted: '#252523',
    text: '#F5F4F0', textMuted: '#A3A29C', textSubtle: '#6B6A65',
    border: '#2A2A27', borderStrong: '#3D3D39',
    shadowCard: '0 1px 3px rgba(0,0,0,0.2)', shadowModal: '0 20px 60px rgba(0,0,0,0.5)',
  },
  natural: {
    bg: '#F0E6D2', surface: '#FAF4E6', surfaceMuted: '#E8DBC2',
    text: '#3E2F1A', textMuted: '#7A6B4E', textSubtle: '#A89570',
    border: '#D9C9A8', borderStrong: '#C4AE85',
    shadowCard: '0 2px 6px rgba(62,47,26,0.08)', shadowModal: '0 20px 60px rgba(62,47,26,0.22)',
  },
  premium: {
    bg: '#FAF8F3', surface: '#FFFFFF', surfaceMuted: '#F0EDE5',
    text: '#1A1A18', textMuted: '#6B6A65', textSubtle: '#A89070',
    border: '#E0DDD3', borderStrong: '#BFB8A5',
    shadowCard: '0 2px 8px rgba(0,0,0,0.06)', shadowModal: '0 24px 70px rgba(0,0,0,0.16)',
  },
}

export const BLANCO = '#FFFFFF'
export const NEGRO = '#000000'
/** Casi-negro de la marca (mismo que --theme-text de Claro). */
export const TEXTO_OSCURO = '#1A1A18'

// ── Hex y RGB ──

const HEX_ESTRICTO = /^#[0-9a-fA-F]{6}$/

/** '#RRGGBB' en mayúsculas, o null para cualquier otra cosa (sin '#', 3 dígitos, alpha, nombres, rgb()). */
export function normalizeHex(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return HEX_ESTRICTO.test(s) ? s.toUpperCase() : null
}

function exigirHex(v: string): string {
  const h = normalizeHex(v)
  if (!h) throw new Error(`Color inválido: ${v}`)
  return h
}

export function hexARgb(hex: string): [number, number, number] {
  const h = exigirHex(hex)
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}

const clamp = (x: number, min = 0, max = 1) => Math.min(max, Math.max(min, x))

export function rgbAHex(r: number, g: number, b: number): string {
  const p = (x: number) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0')
  return `#${p(r)}${p(g)}${p(b)}`.toUpperCase()
}

/** Mezcla en sRGB: t=0 → a, t=1 → b. Igual a componer b con alpha t sobre a (como lo hace el navegador). */
export function mezclar(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexARgb(a)
  const [r2, g2, b2] = hexARgb(b)
  const k = clamp(t)
  return rgbAHex(r1 + (r2 - r1) * k, g1 + (g2 - g1) * k, b1 + (b2 - b1) * k)
}

// ── WCAG ──

/** Luminancia relativa WCAG 2.x (0 = negro, 1 = blanco). */
export function luminancia(hex: string): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const [r, g, b] = hexARgb(hex)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Razón de contraste WCAG 2.x, de 1 a 21. Simétrica. */
export function contraste(a: string, b: string): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** true si sobre este fondo el blanco contrasta más que el negro. */
export function esFondoOscuro(fondo: string): boolean {
  return contraste(BLANCO, fondo) > contraste(NEGRO, fondo)
}

/** Mínimo para blanco sobre la MARCA (botones, chips, pills, +). Decisión de Julian
 *  (CIERRE P2a): la marca conserva el texto blanco hasta 3:1 — el umbral WCAG para
 *  texto grande/negrita y componentes de UI —, así el naranja por defecto (#E85D24,
 *  3.49:1) sigue blanco. Por debajo, texto oscuro. */
export const MINIMO_BLANCO_MARCA = 3
/** Mínimo estricto (AA texto normal) para blanco sobre colores SEMÁNTICOS (chip −% verde). */
export const MINIMO_BLANCO_ESTRICTO = 4.5

/** Texto para poner SOBRE un color: blanco si llega a `minimoBlanco` contra él; si no,
 *  casi negro (#1A1A18), o negro puro si el casi negro no llega a 4.5:1. La opción
 *  oscura siempre llega a 4.5:1 cuando el blanco no alcanza el mínimo (con mínimo
 *  >= 3 el color tiene luminancia > 0.18, y ahí el negro puro da > 4.6:1).
 *  Por defecto, la regla de marca; para semánticos usar textoSobreEstricto.
 *  Color inválido → blanco (el comportamiento previo). */
export function textoSobre(color: string, minimoBlanco: number = MINIMO_BLANCO_MARCA): string {
  const c = normalizeHex(color)
  if (!c) return BLANCO
  if (contraste(BLANCO, c) >= minimoBlanco) return BLANCO
  return contraste(TEXTO_OSCURO, c) >= 4.5 ? TEXTO_OSCURO : NEGRO
}

/** textoSobre con el mínimo estricto de 4.5:1 también para el blanco (colores semánticos). */
export const textoSobreEstricto = (color: string) => textoSobre(color, MINIMO_BLANCO_ESTRICTO)

// ── HSL (para ajustar tonos sin cambiar el matiz) ──

function rgbAHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255, gg = g / 255, bb = b / 255
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0)
  else if (max === gg) h = (bb - rr) / d + 2
  else h = (rr - gg) / d + 4
  return [h / 6, s, l]
}

function hslAHex(h: number, s: number, l: number): string {
  if (s === 0) return rgbAHex(l * 255, l * 255, l * 255)
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const canal = (t: number) => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return rgbAHex(canal(h + 1 / 3) * 255, canal(h) * 255, canal(h - 1 / 3) * 255)
}

const contrasteMin = (c: string, fondos: string[]) => Math.min(...fondos.map((f) => contraste(c, f)))

/** Primer tono del mismo matiz y saturación (moviendo solo la luminosidad HSL en la
 *  dirección indicada) que llega a `minimo` contra TODOS los fondos; null si no hay. */
function tonoQueCumple(color: string, fondos: string[], minimo: number, subir: boolean): string | null {
  const [r, g, b] = hexARgb(color)
  const [h, s, l] = rgbAHsl(r, g, b)
  for (let i = 1; i <= 100; i++) {
    const nl = subir ? l + i * 0.01 : l - i * 0.01
    if (nl < 0 || nl > 1) break
    const x = hslAHex(h, s, nl)
    if (contrasteMin(x, fondos) >= minimo) return x
  }
  return null
}

/** Variante del mismo matiz que llega a `minimo` contra todos los `fondos`: más clara
 *  sobre fondo oscuro, más oscura sobre fondo claro. Si ya cumple se devuelve tal cual.
 *  Para colores semánticos (verde abierto, rojo agotado, estrellas...). */
export function ajustarTono(color: string, fondos: string[], minimo: number): string {
  const c = exigirHex(color)
  const fs = fondos.map(exigirHex)
  if (contrasteMin(c, fs) >= minimo) return c
  const subir = esFondoOscuro(fs[0])
  return tonoQueCumple(c, fs, minimo, subir) ?? (subir ? BLANCO : NEGRO)
}

export interface MarcaSobreFondo {
  /** Contraste actual del color de marca contra el fondo. */
  contraste: number
  /** true si llega a 4.5:1 (texto normal, WCAG AA). */
  cumple: boolean
  /** Hasta 3 tonos del mismo matiz que llegan a >= 4.5:1, del más parecido al de más
   *  contraste. Vacío si ya cumple. Son SUGERENCIAS: nunca se aplican solas. */
  sugerencias: string[]
}

/** Contraste de la marca como texto sobre un fondo + sugerencias (aviso de P2b). */
export function marcaSobreFondo(marca: string, fondo: string): MarcaSobreFondo {
  const m = exigirHex(marca)
  const f = exigirHex(fondo)
  const c = contraste(m, f)
  if (c >= 4.5) return { contraste: c, cumple: true, sugerencias: [] }
  const [r, g, b] = hexARgb(m)
  const lOriginal = rgbAHsl(r, g, b)[2]
  const sugerencias: string[] = []
  for (const objetivo of [4.5, 6, 7.5]) {
    // Ambas direcciones; gana la que menos se aleja de la luminosidad original.
    // Se descartan los extremos (casi blanco / casi negro): ya no son "el mismo color".
    const candidatos = [tonoQueCumple(m, [f], objetivo, true), tonoQueCumple(m, [f], objetivo, false)]
      .filter((x): x is string => !!x)
      .filter((x) => { const [rr, gg, bb] = hexARgb(x); const l = rgbAHsl(rr, gg, bb)[2]; return l > 0.03 && l < 0.97 })
      .sort((a, b2) => {
        const la = rgbAHsl(...hexARgb(a))[2]
        const lb = rgbAHsl(...hexARgb(b2))[2]
        return Math.abs(la - lOriginal) - Math.abs(lb - lOriginal)
      })
    if (candidatos[0] && !sugerencias.includes(candidatos[0])) sugerencias.push(candidatos[0])
  }
  return { contraste: c, cumple: false, sugerencias }
}

// ── Paleta derivada de un fondo (base de P2b) ──

export interface PaletaTema extends ColoresTema {
  /** El fondo es oscuro (texto claro, color-scheme dark). */
  oscuro: boolean
  /** La superficie pedida se acercó al fondo porque con ella el texto no llegaba a 4.5:1. */
  superficieAjustada: boolean
}

/** Menor t en [0, tMax] (paso 0.01) con el que `f(t)` cumple; null si ninguno. */
function primerT(tMax: number, cumple: (t: number) => boolean): number | null {
  for (let i = 0; i <= Math.round(tMax * 100); i++) if (cumple(i / 100)) return i / 100
  return null
}

/** Mayor t en [0, tMax] (paso 0.01) con el que `f(t)` cumple; null si ninguno. */
function ultimoT(tMax: number, cumple: (t: number) => boolean): number | null {
  for (let i = Math.round(tMax * 100); i >= 0; i--) if (cumple(i / 100)) return i / 100
  return null
}

function sombra(bg: string, oscuro: boolean, lum: number): { card: string; modal: string } {
  // Sombra teñida hacia el matiz del fondo; sobre fondos oscuros, mucho más densa
  // (una sombra al 4% es invisible sobre #0F0F0E). Las tarjetas además llevan borde.
  const [r, g, b] = hexARgb(mezclar(bg, NEGRO, 0.85))
  const oscuridad = clamp((0.35 - lum) / 0.35)
  const aCard = ((oscuro ? 0.35 : 0.06) + 0.1 * oscuridad).toFixed(2)
  const aModal = ((oscuro ? 0.5 : 0.16) + 0.1 * oscuridad).toFixed(2)
  return {
    card: oscuro ? `0 2px 6px rgba(${r},${g},${b},${aCard})` : `0 1px 3px rgba(${r},${g},${b},${aCard})`,
    modal: `0 20px 60px rgba(${r},${g},${b},${aModal})`,
  }
}

/** Todas las variables de COLOR de tema derivadas de un fondo (y opcionalmente una
 *  superficie). Garantías, contra bg, surface y surface-muted:
 *  - text: >= 7:1 donde se pueda; nunca < 4.5:1.
 *  - text-muted: >= 4.5:1. text-subtle: >= 3:1.
 *  - bordes visibles pero suaves; sombras densas sobre fondos oscuros.
 *  Fondo inválido → los colores del tema base sin tocar (lo que pinta su clase CSS).
 *  Fuentes, radios y títulos siguen saliendo de la clase del tema base. */
export function paletaTema(base: TemaBaseId, fondo: string, superficie?: string): PaletaTema {
  const bg = normalizeHex(fondo)
  if (!bg) {
    const b = TEMAS_BASE[base]
    return { ...b, oscuro: esFondoOscuro(b.bg), superficieAjustada: false }
  }
  const oscuro = esFondoOscuro(bg)
  // Extremo puro de la polaridad del texto: el máximo contraste posible.
  const extremo = oscuro ? BLANCO : NEGRO

  // Superficie
  let surface: string
  let superficieAjustada = false
  const pedida = superficie ? normalizeHex(superficie) : null
  if (pedida) {
    surface = pedida
    // Si con esa superficie el texto no puede llegar a 4.5:1, se acerca al fondo
    // (con el fondo mismo siempre llega: el peor caso de blanco/negro es ~4.58).
    const t = primerT(1, (k) => contraste(extremo, mezclar(pedida, bg, k)) >= 4.6) ?? 1
    if (t > 0) { surface = mezclar(pedida, bg, t); superficieAjustada = true }
  } else {
    // "Un poco" más clara (convención) o, si eso le quita al texto contraste que el
    // fondo sí tenía, un poco más oscura. "Un poco" = ~1.1:1 contra el fondo, la
    // distancia que tienen hoy claro/natural/oscuro.
    const paso = (hacia: string) => {
      const t = primerT(1, (k) => contraste(mezclar(bg, hacia, k), bg) >= 1.1) ?? 1
      return mezclar(bg, hacia, t)
    }
    const convencional = paso(BLANCO)
    surface = contraste(extremo, convencional) >= Math.min(7, contraste(extremo, bg))
      ? convencional
      : paso(NEGRO)
  }

  // Superficie apagada: un paso de surface hacia la polaridad del texto, sin bajarle
  // al extremo de 4.6:1.
  const tMuted = ultimoT(0.2, (k) => {
    const x = mezclar(surface, extremo, k)
    return contraste(extremo, x) >= 4.6 && (k === 0 || contraste(x, surface) <= 1.1)
  }) ?? 0
  const surfaceMuted = mezclar(surface, extremo, tMuted)

  const superficies = [bg, surface, surfaceMuted]
  const minC = (c: string) => contrasteMin(c, superficies)

  // Texto: casi blanco / casi negro teñido hacia el matiz del fondo. Se tiñe todo lo
  // que se pueda sin bajar de 7:1; si 7:1 no es alcanzable, el extremo puro.
  const tText = ultimoT(0.08, (k) => minC(mezclar(extremo, bg, k)) >= 7) ?? 0
  const text = mezclar(extremo, bg, tText)

  // Muted/subtle: el texto acercado al fondo hasta el mínimo (con margen de 0.1).
  const tMutedText = ultimoT(0.7, (k) => minC(mezclar(text, bg, k)) >= 4.6) ?? 0
  const textMuted = mezclar(text, bg, tMutedText)
  const tSubtle = ultimoT(0.85, (k) => k >= tMutedText && minC(mezclar(text, bg, k)) >= 3.1) ?? tMutedText
  const textSubtle = mezclar(text, bg, tSubtle)

  // Bordes: el fondo acercado al texto lo justo para verse (~1.2:1 / ~1.5:1 contra
  // fondo y superficie).
  const fondosBorde = [bg, surface]
  const tBorde = primerT(0.6, (k) => contrasteMin(mezclar(bg, text, k), fondosBorde) >= 1.2) ?? 0.6
  const border = mezclar(bg, text, tBorde)
  const tBordeFuerte = primerT(0.8, (k) => contrasteMin(mezclar(bg, text, k), fondosBorde) >= 1.5) ?? 0.8
  const borderStrong = mezclar(bg, text, Math.max(tBordeFuerte, tBorde))

  const s = sombra(bg, oscuro, luminancia(bg))
  return {
    bg, surface, surfaceMuted, text, textMuted, textSubtle, border, borderStrong,
    shadowCard: s.card, shadowModal: s.modal,
    oscuro, superficieAjustada,
  }
}

/** Colores de tema como variables CSS ({'--theme-bg': '#…', …}). */
export function varsColorTema(c: ColoresTema): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of Object.keys(VARS_COLOR_TEMA) as (keyof ColoresTema)[]) out[VARS_COLOR_TEMA[k]] = c[k]
  return out
}
