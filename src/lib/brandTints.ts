// Tintes de marca del menú público — combinan el `color` del restaurante (hex)
// con sufijos de alpha LITERALES. Estos espejan exactamente los sufijos usados a
// lo largo de menu-publico al momento del commit 4: cambiar un valor aquí es un
// cambio VISUAL, no un refactor. Funciones puras, sin React, sin imports, sin
// efectos secundarios.

/** Tinte de fondo bajo avatar de letra / placeholder de foto.
 *  Cubre: PlatoCard, PlatoDetalleModal, ComboDetalleModal, CalificarModal, page (Sorpréndeme). */
export const tintPlaceholder = (color: string) => `${color}15`

/** Lavado suave del hero (Plato del día). Cubre: PlatoDiaHero. */
export const washHero = (color: string) => `${color}10`

/** Lavado más sutil de sección. Cubre: page (Sorpréndeme toggle + tarjeta resultado). */
export const washSutil = (color: string) => `${color}08`

/** Borde de marca fuerte (string completo `1px solid …`). Cubre: PlatoDiaHero, page (combos). */
export const borderFuerte = (color: string) => `1px solid ${color}30`

/** Borde de marca sutil (string completo `1px solid …`). Cubre: page (tarjeta Sorpréndeme). */
export const borderSutil = (color: string) => `1px solid ${color}20`

/** Glow del botón "Ver menú" (boxShadow). Cubre: RestaurantLanding. */
export const glowBoton = (color: string) => `0 4px 20px ${color}40`

/** Gradiente del header de portada. Cubre: RestaurantLanding, page (bloque landing propio). */
export const gradientHeader = (color: string) =>
  `linear-gradient(135deg, ${color} 0%, ${color}CC 50%, ${color}99 100%)`
