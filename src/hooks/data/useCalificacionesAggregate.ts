'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase-browser'

export interface CalificacionAgregada {
  promedio: number
  count: number
}

export type CalificacionesPorPlato = Record<string, CalificacionAgregada>

async function fetchCalificacionesAggregate(restauranteId: string): Promise<CalificacionesPorPlato> {
  const supabase = createClient()
  const { data } = await supabase
    .from('calificaciones')
    .select('plato_id, estrellas')
    .eq('restaurante_id', restauranteId)

  const stats: Record<string, { total: number; count: number }> = {}
  if (data) {
    for (const c of data as Array<{ plato_id: string; estrellas: number }>) {
      if (!stats[c.plato_id]) stats[c.plato_id] = { total: 0, count: 0 }
      stats[c.plato_id].total += c.estrellas
      stats[c.plato_id].count += 1
    }
  }

  const aggregate: CalificacionesPorPlato = {}
  for (const platoId in stats) {
    const s = stats[platoId]
    aggregate[platoId] = {
      promedio: Number((s.total / s.count).toFixed(1)),
      count: s.count,
    }
  }
  return aggregate
}

export function useCalificacionesAggregate(restauranteId: string | null | undefined) {
  return useSWR(
    restauranteId ? ['calificaciones-aggregate', restauranteId] : null,
    () => fetchCalificacionesAggregate(restauranteId!),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )
}
