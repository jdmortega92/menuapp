'use client'

import useSWR, { SWRResponse } from 'swr'
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
  varianteId: string | null
  variante: { id: string; nombre: string; precio: number } | null
}

export interface PlatoGanadorAdmin {
  id: string
  restaurante_id: string
  plato_id: string
  variante_id: string | null
  titulo: string
  descripcion: string | null
  activo: boolean
}

async function fetchPlatoGanadorPublic(restauranteId: string): Promise<PlatoGanadorPublico | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('plato_ganador')
    .select('*, platos(*, plato_variantes(*))')
    .eq('restaurante_id', restauranteId)
    .eq('activo', true)
    .maybeSingle()

  const pg = data as any
  if (!pg?.platos) return null
  const varianteId: string | null = pg.variante_id ?? null
  const variantes: any[] = pg.platos.plato_variantes ?? []
  const found = varianteId ? variantes.find((v: any) => v.id === varianteId) : null
  const variante = found ? { id: found.id, nombre: found.nombre, precio: found.precio } : null
  return {
    id: pg.platos.id,
    nombre: pg.platos.nombre,
    precio: pg.platos.precio,
    descripcion: pg.platos.descripcion ?? null,
    foto_url: pg.platos.foto_url ?? null,
    titulo: pg.titulo,
    descripcionEspecial: pg.descripcion ?? null,
    varianteId,
    variante,
  }
}

async function fetchPlatoGanadorAdmin(restauranteId: string): Promise<PlatoGanadorAdmin | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('plato_ganador')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .maybeSingle()

  if (!data) return null
  return data as PlatoGanadorAdmin
}

interface UsePlatoGanadorFn {
  (restauranteId: string | null | undefined): SWRResponse<PlatoGanadorPublico | null, any>
  (
    restauranteId: string | null | undefined,
    options: { includeInactive: true },
  ): SWRResponse<PlatoGanadorAdmin | null, any>
}

const usePlatoGanadorImpl = (
  restauranteId: string | null | undefined,
  options?: { includeInactive?: boolean },
) => {
  const includeInactive = !!options?.includeInactive
  return useSWR<PlatoGanadorPublico | PlatoGanadorAdmin | null>(
    restauranteId ? ['plato-ganador', restauranteId, { includeInactive }] : null,
    async () =>
      includeInactive
        ? fetchPlatoGanadorAdmin(restauranteId!)
        : fetchPlatoGanadorPublic(restauranteId!),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    },
  )
}

export const usePlatoGanador: UsePlatoGanadorFn = usePlatoGanadorImpl as UsePlatoGanadorFn
