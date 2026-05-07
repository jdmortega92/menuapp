'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase-browser'
import type { TipoPromo, DiaSemana } from '@/types'

export interface PromoPublica {
  id: string
  nombre: string
  tipo: TipoPromo
  valor: number | null
  dias: DiaSemana[]
  platos: string[]
  platosIds: string[]
}

async function fetchPromos(restauranteId: string): Promise<PromoPublica[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('promos')
    .select('*, promo_platos(plato_id, platos(nombre))')
    .eq('restaurante_id', restauranteId)
    .eq('activo', true)

  if (!data) return []
  return (data as any[]).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    tipo: p.tipo as TipoPromo,
    valor: p.valor ?? null,
    dias: (p.dias ?? []) as DiaSemana[],
    platos: (p.promo_platos ?? []).map((pp: any) => pp.platos?.nombre || 'Plato'),
    platosIds: (p.promo_platos ?? []).map((pp: any) => pp.plato_id),
  }))
}

export function usePromos(restauranteId: string | null | undefined) {
  return useSWR(
    restauranteId ? ['promos', restauranteId] : null,
    () => fetchPromos(restauranteId!),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )
}
