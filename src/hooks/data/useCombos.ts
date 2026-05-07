'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase-browser'

export interface ComboPublico {
  id: string
  nombre: string
  descripcion: string | null
  precio: number
  precioIndividual: number
  platos: string[]
  platosIds: string[]
}

async function fetchCombos(restauranteId: string): Promise<ComboPublico[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('combos')
    .select('*, combo_platos(plato_id, platos(nombre, precio))')
    .eq('restaurante_id', restauranteId)
    .eq('activo', true)

  if (!data) return []
  return (data as any[]).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    descripcion: c.descripcion ?? null,
    precio: c.precio,
    precioIndividual: c.precio_individual,
    platos: (c.combo_platos ?? []).map((cp: any) => cp.platos?.nombre || 'Plato'),
    platosIds: (c.combo_platos ?? []).map((cp: any) => cp.plato_id),
  }))
}

export function useCombos(restauranteId: string | null | undefined) {
  return useSWR(
    restauranteId ? ['combos', restauranteId] : null,
    () => fetchCombos(restauranteId!),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )
}
