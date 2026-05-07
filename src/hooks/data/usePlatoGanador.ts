'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase-browser'

export interface PlatoGanadorPublico {
  id: string
  nombre: string
  precio: number
  descripcion: string | null
  foto_url: string | null
  titulo: string
  // descripcionEspecial proviene de plato_ganador.descripcion (la fila del plato ganador),
  // NO de platos.descripcion. Son campos distintos en el join.
  descripcionEspecial: string | null
}

async function fetchPlatoGanador(restauranteId: string): Promise<PlatoGanadorPublico | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('plato_ganador')
    .select('*, platos(*)')
    .eq('restaurante_id', restauranteId)
    .eq('activo', true)
    .maybeSingle()

  const pg = data as any
  if (!pg?.platos) return null
  return {
    id: pg.platos.id,
    nombre: pg.platos.nombre,
    precio: pg.platos.precio,
    descripcion: pg.platos.descripcion ?? null,
    foto_url: pg.platos.foto_url ?? null,
    titulo: pg.titulo,
    descripcionEspecial: pg.descripcion ?? null,
  }
}

export function usePlatoGanador(restauranteId: string | null | undefined) {
  return useSWR(
    restauranteId ? ['plato-ganador', restauranteId] : null,
    () => fetchPlatoGanador(restauranteId!),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )
}
