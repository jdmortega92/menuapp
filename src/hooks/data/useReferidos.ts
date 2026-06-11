'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase-browser'

export interface ReferidoRow {
  id: string
  estado: string
  beneficio_aplicado: string | null
  created_at: string
  // Join al restaurante referido (nombre) vía FK referidos_referido_id_fkey.
  restaurantes: { nombre: string } | null
}

async function fetchReferidos(restauranteId: string): Promise<ReferidoRow[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('referidos')
    .select('*, restaurantes!referidos_referido_id_fkey(nombre)')
    .eq('referidor_id', restauranteId)
    .order('created_at', { ascending: false })

  return (data ?? []) as ReferidoRow[]
}

export function useReferidos(restauranteId: string | null | undefined) {
  return useSWR(
    restauranteId ? ['referidos', restauranteId] : null,
    () => fetchReferidos(restauranteId!),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )
}
