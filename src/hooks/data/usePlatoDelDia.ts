'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase-browser'

export interface PlatoDelDiaPublico {
  id: string
  nombre: string
  precio: number
  precioEspecial: number
  descripcion: string | null
  horaInicio: string | null
  horaFin: string | null
}

const normalizar = (t: string | null | undefined): string | null => (t ? t.slice(0, 5) : null)

async function fetchPlatoDelDia(restauranteId: string): Promise<PlatoDelDiaPublico | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('plato_del_dia')
    .select('*, platos(*)')
    .eq('restaurante_id', restauranteId)
    .eq('activo', true)
    .maybeSingle()

  const pd = data as any
  if (!pd?.platos) return null
  return {
    id: pd.platos.id,
    nombre: pd.platos.nombre,
    precio: pd.platos.precio,
    precioEspecial: pd.precio_especial,
    descripcion: pd.platos.descripcion ?? null,
    horaInicio: normalizar(pd.horario_inicio),
    horaFin: normalizar(pd.horario_fin),
  }
}

export function usePlatoDelDia(restauranteId: string | null | undefined) {
  return useSWR(
    restauranteId ? ['plato-del-dia', restauranteId] : null,
    () => fetchPlatoDelDia(restauranteId!),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )
}
