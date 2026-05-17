'use client'

import useSWR, { SWRResponse } from 'swr'
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

export interface PromoAdmin {
  id: string
  restaurante_id: string
  nombre: string
  descripcion: string | null
  tipo: TipoPromo
  valor: number | null
  dias: DiaSemana[]
  activo: boolean
  promo_platos: { plato_id: string; platos?: { nombre: string } | null }[]
}

async function fetchPromosPublic(restauranteId: string): Promise<PromoPublica[]> {
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

async function fetchPromosAdmin(restauranteId: string): Promise<PromoAdmin[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('promos')
    .select('*, promo_platos(plato_id, platos(nombre))')
    .eq('restaurante_id', restauranteId)
  return (data ?? []) as PromoAdmin[]
}

interface UsePromosFn {
  (restauranteId: string | null | undefined): SWRResponse<PromoPublica[], any>
  (
    restauranteId: string | null | undefined,
    options: { includeInactive: true },
  ): SWRResponse<PromoAdmin[], any>
}

const usePromosImpl = (
  restauranteId: string | null | undefined,
  options?: { includeInactive?: boolean },
) => {
  const includeInactive = !!options?.includeInactive
  return useSWR<PromoPublica[] | PromoAdmin[]>(
    restauranteId ? ['promos', restauranteId, { includeInactive }] : null,
    async () =>
      includeInactive
        ? fetchPromosAdmin(restauranteId!)
        : fetchPromosPublic(restauranteId!),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    },
  )
}

export const usePromos: UsePromosFn = usePromosImpl as UsePromosFn
