// Tema personalizado del menú público (CIERRE P2b). Funciones puras, sin React.
// - resolverTema: qué tema base y qué paleta propia ve el comensal según plan.
// - choqueMarca: si el color de marca se lee como texto sobre el fondo y las
//   tarjetas del tema elegido (base o propio).

import { TEMAS_BASE, TEMAS_BASE_IDS, marcaSobreFondo, normalizeHex, paletaTema, type PaletaTema, type TemaBaseId } from './temaColor'

/** Bases que requieren Pro (Claro es de todos los planes). */
const BASES_PRO: TemaBaseId[] = ['oscuro', 'natural', 'premium']

export interface TemaResuelto {
  /** Tema base: da la clase .theme-* (fuentes, radios, títulos) y, sin paleta, los colores. */
  base: TemaBaseId
  /** Paleta propia derivada de tema_fondo/tema_superficie, o null (colores de la base). */
  paleta: PaletaTema | null
}

/** Tema efectivo del menú público.
 *  - Base: valor desconocido → claro; base Pro sin plan Pro → claro (gating de siempre).
 *  - Paleta propia: solo con plan Pro Y tema_fondo hex válido. Si no, se ignora
 *    (los valores guardados NO se tocan: al volver a Pro reaparecen).
 *  - tema_superficie inválida se ignora (tarjetas derivadas del fondo). */
export function resolverTema(entrada: {
  tema: string | null | undefined
  plan: string | null | undefined
  temaFondo?: string | null
  temaSuperficie?: string | null
}): TemaResuelto {
  const esPro = entrada.plan === 'pro'
  const t = entrada.tema as TemaBaseId
  const base: TemaBaseId = !TEMAS_BASE_IDS.includes(t) ? 'claro' : (BASES_PRO.includes(t) && !esPro ? 'claro' : t)
  const fondo = normalizeHex(entrada.temaFondo)
  if (!esPro || !fondo) return { base, paleta: null }
  const superficie = normalizeHex(entrada.temaSuperficie) ?? undefined
  return { base, paleta: paletaTema(base, fondo, superficie) }
}

/** Colores sobre los que se lee la marca como texto: los de la paleta propia o los de la base. */
export function fondosDelTema(t: TemaResuelto): { bg: string; surface: string } {
  const c = t.paleta ?? TEMAS_BASE[t.base]
  return { bg: c.bg, surface: c.surface }
}

export type NivelChoque = 'ok' | 'aviso' | 'bloqueo'

export interface ChoqueMarca {
  /** ok >= 4.5:1; aviso 3–4.5:1; bloqueo < 3:1. */
  nivel: NivelChoque
  /** El MENOR contraste de la marca contra fondo y tarjetas. */
  contraste: number
  /** Hasta 3 tonos del mismo matiz que llegan a >= 4.5:1 contra fondo Y tarjetas.
   *  Solo sugerencias: /config las muestra para que el dueño elija; nunca se aplican solas. */
  sugerencias: string[]
}

/** Choque del color de marca (precios, enlaces, "Ver detalles"...) con el fondo y
 *  las tarjetas. Aplica a todos los temas. Marca o fondos inválidos → 'ok' sin
 *  sugerencias (no hay nada que medir; la validación de formato es aparte). */
export function choqueMarca(marca: string, fondo: string, superficie: string): ChoqueMarca {
  const m = normalizeHex(marca)
  const f = normalizeHex(fondo)
  const s = normalizeHex(superficie)
  if (!m || !f || !s) return { nivel: 'ok', contraste: 21, sugerencias: [] }
  const r = marcaSobreFondo(m, [f, s])
  const nivel: NivelChoque = r.contraste >= 4.5 ? 'ok' : r.contraste >= 3 ? 'aviso' : 'bloqueo'
  return { nivel, contraste: r.contraste, sugerencias: r.sugerencias }
}
