'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase-browser'
import type { Factura } from '@/types'

// Facturas del restaurante, más reciente primero. RLS solo deja leer las
// propias; las escrituras llegan por service role (webhook Wompi, F4.a-2).
async function fetchFacturasByRestauranteId(restauranteId: string): Promise<Factura[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('facturas')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .order('creada_en', { ascending: false })
  return (data as Factura[] | null) ?? []
}

export function useFacturas(restauranteId: string | null | undefined) {
  return useSWR<Factura[]>(
    restauranteId ? ['facturas', restauranteId] : null,
    () => fetchFacturasByRestauranteId(restauranteId!),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )
}
