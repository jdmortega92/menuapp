// Cart key codec + helpers de precio del menú público.
//
// CONTRATO de source-tag: source 'dia'/'ganador' en la cart key ⇒ precio
// CONGELADO al agregar (preciosPromo), nunca recalculado; keys sin source
// re-derivan promo en vivo (BL.27).

// F8.4 — Cart key helpers
// Plain UUIDs for combos and platos without variantes; composite
// for variantes. UUIDs don't contain "__" so the separator is safe.
export const CART_KEY_SEP = '__'

export function makeCartKey(platoId: string, varianteId?: string, source?: string): string {
  if (source) return `${platoId}${CART_KEY_SEP}${varianteId || ''}${CART_KEY_SEP}${source}`
  return varianteId ? `${platoId}${CART_KEY_SEP}${varianteId}` : platoId
}

export function parseCartKey(key: string): { platoId: string; varianteId?: string; source?: string } {
  const parts = key.split(CART_KEY_SEP)
  return { platoId: parts[0], varianteId: parts[1] || undefined, source: parts[2] || undefined }
}

// F8.4b — Promo helpers
export function precioEfectivo(plato: any, varianteId?: string): number {
  if (varianteId && plato.variantes) {
    const v = plato.variantes.find((v: any) => v.id === varianteId)
    if (v) return v.precio
  }
  return plato.precio
}

// F8.5a — Combo helpers
// Resolves each raw combo_plato (plato_id + variante_id from the hook) against
// the in-memory plato data, producing the enriched shape used for display:
// variante name + effective price + (foto/descripcion carried for the modal rows).
export function enriquecerComboPlatos(rawComboPlatos: any[], todosLosPlatos: any[]) {
  return (rawComboPlatos || []).map(cp => {
    const plato = todosLosPlatos.find((p: any) => p.id === cp.plato_id)
    const variante = cp.variante_id && plato?.variantes
      ? plato.variantes.find((v: any) => v.id === cp.variante_id)
      : null
    // Graceful fallback: if variante_id was set but the variante was since
    // deleted, fall back to plato.precio (sentinel). ON DELETE CASCADE on
    // combo_platos.variante_id should prevent this, but defensive coding.
    const precioEfectivo = variante
      ? variante.precio
      : (cp.precioBase || plato?.precio || 0)
    return {
      plato_id: cp.plato_id,
      variante_id: cp.variante_id || null,
      nombre: cp.nombre || plato?.nombre || '',
      varianteNombre: variante?.nombre || null,
      precioEfectivo,
      // carried for the combo modal rows (image + description)
      foto_url: plato?.foto_url || null,
      descripcion: plato?.descripcion || null,
    }
  })
}
