'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase-browser'
import type { FuentePago } from '@/types'

// Fuente de pago VIVA del restaurante (F4.c-4). Las VOIDED se excluyen: son
// historico y evidencia, no estado actual. Se toma la mas reciente porque solo
// puede haber una viva a la vez (lo garantiza la ruta de enrolamiento y, para
// la predeterminada, el indice unico parcial).
//
// RLS solo deja leer las propias; TODAS las escrituras van por service role
// (rutas /api/wompi/fuentes/*) porque la tabla no tiene policy de escritura.
async function fetchFuentePago(restauranteId: string): Promise<FuentePago | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('fuentes_pago')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .neq('estado', 'VOIDED')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as FuentePago | null) ?? null
}

export function useFuentePago(restauranteId: string | null | undefined) {
  const swr = useSWR<FuentePago | null>(
    restauranteId ? ['fuente_pago', restauranteId] : null,
    () => fetchFuentePago(restauranteId!),
    {
      revalidateOnFocus: true,
      dedupingInterval: 3000,
      // Mientras el enrolamiento esta PENDING, quien mueve la fila es el
      // WEBHOOK (server-to-server): el navegador no se entera de nada si no
      // pregunta. Se sondea cada 4s SOLO en ese estado y se apaga al resolverse
      // — un intervalo permanente seria trafico inutil el 99% del tiempo.
      refreshInterval: (dato) => (dato?.estado === 'PENDING' ? 4000 : 0),
    }
  )
  return swr
}
