'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase-browser'

export interface HorarioRestaurante {
  id: string
  restaurante_id: string
  dia: string
  hora_apertura: string
  hora_cierre: string
  cerrado: boolean
}

async function fetchHorarios(restauranteId: string): Promise<HorarioRestaurante[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('horarios')
    .select('*')
    .eq('restaurante_id', restauranteId)

  return (data ?? []) as HorarioRestaurante[]
}

export function useHorarios(restauranteId: string | null | undefined) {
  return useSWR(
    restauranteId ? ['horarios', restauranteId] : null,
    () => fetchHorarios(restauranteId!),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )
}
