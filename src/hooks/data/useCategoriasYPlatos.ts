'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase-browser'
import type { Categoria, Plato } from '@/types'

async function fetchCategoriasYPlatos(restauranteId: string): Promise<{ categorias: Categoria[]; platos: Plato[] }> {
  const supabase = createClient()
  const [catsRes, platosRes] = await Promise.all([
    supabase
      .from('categorias')
      .select('*')
      .eq('restaurante_id', restauranteId)
      .order('orden', { ascending: true }),
    supabase
      .from('platos')
      .select('*, variantes:plato_variantes(*)')
      .eq('restaurante_id', restauranteId)
      .order('orden', { ascending: true })
      .order('orden', { ascending: true, foreignTable: 'plato_variantes' }),
  ])
  return {
    categorias: (catsRes.data ?? []) as Categoria[],
    platos: (platosRes.data ?? []) as Plato[],
  }
}

export function useCategoriasYPlatos(restauranteId: string | null | undefined) {
  return useSWR(
    restauranteId ? ['categorias-y-platos', restauranteId] : null,
    () => fetchCategoriasYPlatos(restauranteId!),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )
}
