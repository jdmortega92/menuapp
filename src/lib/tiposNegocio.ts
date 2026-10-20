// ── Tipos de negocio (CIERRE P1) ─────────────────────────────────────────
// Fuente UNICA de la lista y de su texto visible. Antes la lista vivia
// copiada en /registro, /completa-perfil y /config, y el menu publico pintaba
// el valor CRUDO de restaurantes.tipo con text-transform: capitalize
// ("Comida_rapida", "Cafeteria" sin tilde).
//
// 'otro' trae su propio texto en restaurantes.tipo_detalle (max 40, lo exige
// tambien un CHECK en la DB). Sin ese texto el menu publico OMITE el tipo en
// vez de pintar "Otro", que no le dice nada al comensal.

export const TIPOS_NEGOCIO = [
  { valor: 'restaurante', label: 'Restaurante' },
  { valor: 'cafeteria', label: 'Cafetería' },
  { valor: 'panaderia', label: 'Panadería' },
  { valor: 'bar', label: 'Bar' },
  { valor: 'comida_rapida', label: 'Comida rápida' },
  { valor: 'heladeria', label: 'Heladería' },
  { valor: 'food_truck', label: 'Food truck' },
  { valor: 'otro', label: 'Otro' },
] as const

export const MAX_TIPO_DETALLE = 40

/** Label de la LISTA (para selects y previews del admin), '' si el valor no
 *  esta en la lista. Para el menu publico usar textoTipoNegocio. */
export function labelTipoNegocio(tipo: string | null | undefined): string {
  return TIPOS_NEGOCIO.find((t) => t.valor === tipo)?.label ?? ''
}

/** El texto que ve el COMENSAL, o '' para omitir el tipo por completo.
 *  - tipo conocido (no 'otro') -> su label con tildes;
 *  - 'otro' -> tipo_detalle recortado, o '' si esta vacio;
 *  - valor desconocido o ausente -> '' (nunca el valor crudo). */
export function textoTipoNegocio(
  tipo: string | null | undefined,
  tipoDetalle: string | null | undefined
): string {
  if (tipo === 'otro') return (tipoDetalle ?? '').trim()
  return labelTipoNegocio(tipo)
}

/** Lo que se ESCRIBE en tipo_detalle: el texto recortado solo cuando el tipo
 *  es 'otro' y hay algo escrito; null en cualquier otro caso (cambiar el tipo
 *  a otra cosa limpia el detalle). Se corta a MAX_TIPO_DETALLE por si acaso:
 *  el input ya lo limita y la DB lo rechazaria. */
export function tipoDetalleParaGuardar(
  tipo: string | null | undefined,
  tipoDetalle: string | null | undefined
): string | null {
  if (tipo !== 'otro') return null
  const limpio = (tipoDetalle ?? '').trim().slice(0, MAX_TIPO_DETALLE).trim()
  return limpio || null
}
