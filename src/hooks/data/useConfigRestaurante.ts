'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase-browser'
import type { ConfigRestaurante } from '@/types'

export interface ConfigRestaurantePublico extends ConfigRestaurante {
  // Columna existente en DB pero no incluida en ConfigRestaurante de '@/types'.
  sorprendeme_categorias?: string[]
}

async function fetchConfigRestaurante(restauranteId: string): Promise<ConfigRestaurantePublico | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('config_restaurante')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .maybeSingle()

  if (!data) return null
  return data as ConfigRestaurantePublico
}

export function useConfigRestaurante(restauranteId: string | null | undefined) {
  return useSWR(
    restauranteId ? ['config-restaurante', restauranteId] : null,
    () => fetchConfigRestaurante(restauranteId!),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )
}
