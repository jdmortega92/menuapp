import { mutate as globalMutate } from 'swr'

// Invalida TODAS las keys SWR cuyo prefijo (key[0]) coincida — las keys de los
// hooks de datos son arrays tipo ['combos', restauranteId]. populateCache: false
// + revalidate: true = descarta el cache y repobla por refetch. Compartido por
// /menu y los formularios admin extraídos (Fase 3).
export function invalidateAll(prefix: string) {
  return globalMutate(
    (key) => Array.isArray(key) && key[0] === prefix,
    undefined,
    { revalidate: true, populateCache: false },
  )
}
