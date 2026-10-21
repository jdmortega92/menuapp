// Tintes de marca del menú público — combinan el `color` del restaurante (hex)
// con el fondo REAL sobre el que se pintan (CIERRE P2a). Devuelven colores
// opacos: sobre fondo claro son idénticos (±1/255) a los sufijos de alpha de
// antes (#RRGGBB15 sobre ese fondo), así que los temas claros no cambian. Sobre
// fondo oscuro el alpha de antes se volvía invisible; ahora el tinte sube hasta
// verse igual que se vería sobre blanco, y si la marca casi coincide con el fondo
// (marca oscura sobre tema oscuro) se levanta con neutro.
// Funciones puras, sin React, sin efectos secundarios.

import { BLANCO, contraste, esFondoOscuro, mezclar, normalizeHex } from './temaColor'

const A15 = 0x15 / 255
const A10 = 0x10 / 255
const A08 = 0x08 / 255
const A30 = 0x30 / 255
const A20 = 0x20 / 255

/** Marca compuesta con alpha `a` sobre `fondo`, visible también en fondos oscuros. */
export function tinte(color: string, fondo: string, a: number): string {
  const f = normalizeHex(fondo) ?? BLANCO
  const m = normalizeHex(color)
  if (!m) return f
  if (!esFondoOscuro(f)) return mezclar(f, m, a)
  // Visibilidad de referencia: la que tiene este mismo tinte sobre blanco.
  const objetivo = contraste(mezclar(BLANCO, m, a), BLANCO)
  for (let k = 2 * a; k <= Math.min(1, 4 * a); k += 0.005) {
    const x = mezclar(f, m, k)
    if (contraste(x, f) >= objetivo) return x
  }
  // Marca demasiado parecida al fondo: el matiz no alcanza, se levanta con neutro.
  const conMarca = mezclar(f, m, 4 * a)
  for (let k = 0; k <= 0.5; k += 0.005) {
    const x = mezclar(conMarca, BLANCO, k)
    if (contraste(x, f) >= objetivo) return x
  }
  return mezclar(conMarca, BLANCO, 0.5)
}

/** Tinte de fondo bajo avatar de letra / placeholder de foto (fondo = la superficie de la tarjeta).
 *  Cubre: PlatoCard, PlatoDetalleModal, ComboDetalleModal, CalificarModal, page (Sorpréndeme). */
export const tintPlaceholder = (color: string, fondo: string) => tinte(color, fondo, A15)

/** Lavado suave del hero (Plato del día). Cubre: PlatoDiaHero. */
export const washHero = (color: string, fondo: string) => tinte(color, fondo, A10)

/** Lavado más sutil de sección. Cubre: page (Sorpréndeme toggle + tarjeta resultado). */
export const washSutil = (color: string, fondo: string) => tinte(color, fondo, A08)

/** Borde de marca fuerte (string completo `1px solid …`). Cubre: PlatoDiaHero, page (combos). */
export const borderFuerte = (color: string, fondo: string) => `1px solid ${tinte(color, fondo, A30)}`

/** Borde de marca sutil (string completo `1px solid …`). Cubre: page (tarjeta Sorpréndeme). */
export const borderSutil = (color: string, fondo: string) => `1px solid ${tinte(color, fondo, A20)}`

/** Glow del botón "Ver menú" (boxShadow); más denso sobre fondo oscuro. Cubre: RestaurantLanding. */
export const glowBoton = (color: string, fondo: string) => {
  const m = normalizeHex(color)
  if (!m) return 'none'
  const f = normalizeHex(fondo) ?? BLANCO
  return `0 4px 20px ${m}${esFondoOscuro(f) ? '66' : '40'}`
}

/** Gradiente del header de portada, opaco sobre el fondo (antes: CC/99 de alpha
 *  sobre ese mismo fondo — mismo resultado, sin depender de lo que haya detrás).
 *  Cubre: RestaurantLanding, page (header del menú), vista previa de /config. */
export const gradientHeader = (color: string, fondo: string) => {
  const f = normalizeHex(fondo) ?? BLANCO
  const m = normalizeHex(color) ?? f
  return `linear-gradient(135deg, ${m} 0%, ${mezclar(f, m, 0xCC / 255)} 50%, ${mezclar(f, m, 0x99 / 255)} 100%)`
}
