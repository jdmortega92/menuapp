// Base pública de la app. Cambiar SOLO aquí al migrar a menuapp.co (Fase 5b).
// Los flujos internos del admin usan URLs relativas ('/' + slug, ver BL.38);
// esta constante es SOLO para URLs que viajan FUERA de la app (QR impresos,
// links compartidos).
export const PUBLIC_BASE_URL = 'https://menuapp-iota.vercel.app'

export function urlMenuPublico(slug: string): string {
  return `${PUBLIC_BASE_URL}/${slug}`
}

export function urlRegistroRef(codigo: string): string {
  return `${PUBLIC_BASE_URL}/registro?ref=${codigo}`
}
