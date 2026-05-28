'use client'

import useSWR, { SWRResponse } from 'swr'
import { createClient } from '@/lib/supabase-browser'

export interface PlatoDelDiaPublico {
  id: string
  nombre: string
  precio: number
  precioEspecial: number
  descripcion: string | null
  horaInicio: string | null
  horaFin: string | null
  varianteId: string | null
  variante: { id: string; nombre: string; precio: number } | null
}

export interface PlatoDelDiaAdmin {
  id: string
  restaurante_id: string
  plato_id: string
  variante_id: string | null
  precio_especial: number
  horario_inicio: string | null
  horario_fin: string | null
  activo: boolean
  fecha: string | null
}

const normalizar = (t: string | null | undefined): string | null => (t ? t.slice(0, 5) : null)

async function fetchPlatoDelDiaPublic(restauranteId: string): Promise<PlatoDelDiaPublico | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('plato_del_dia')
    .select('*, platos(*, plato_variantes(*))')
    .eq('restaurante_id', restauranteId)
    .eq('activo', true)
    .maybeSingle()

  const pd = data as any
  if (!pd?.platos) return null
  const varianteId: string | null = pd.variante_id ?? null
  const variantes: any[] = pd.platos.plato_variantes ?? []
  const found = varianteId ? variantes.find((v: any) => v.id === varianteId) : null
  const variante = found ? { id: found.id, nombre: found.nombre, precio: found.precio } : null
  return {
    id: pd.platos.id,
    nombre: pd.platos.nombre,
    precio: pd.platos.precio,
    precioEspecial: pd.precio_especial,
    descripcion: pd.platos.descripcion ?? null,
    horaInicio: normalizar(pd.horario_inicio),
    horaFin: normalizar(pd.horario_fin),
    varianteId,
    variante,
  }
}

async function fetchPlatoDelDiaAdmin(restauranteId: string): Promise<PlatoDelDiaAdmin | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('plato_del_dia')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .maybeSingle()

  if (!data) return null
  return data as PlatoDelDiaAdmin
}

interface UsePlatoDelDiaFn {
  (restauranteId: string | null | undefined): SWRResponse<PlatoDelDiaPublico | null, any>
  (
    restauranteId: string | null | undefined,
    options: { includeInactive: true },
  ): SWRResponse<PlatoDelDiaAdmin | null, any>
}

const usePlatoDelDiaImpl = (
  restauranteId: string | null | undefined,
  options?: { includeInactive?: boolean },
) => {
  const includeInactive = !!options?.includeInactive
  return useSWR<PlatoDelDiaPublico | PlatoDelDiaAdmin | null>(
    restauranteId ? ['plato-del-dia', restauranteId, { includeInactive }] : null,
    async () =>
      includeInactive
        ? fetchPlatoDelDiaAdmin(restauranteId!)
        : fetchPlatoDelDiaPublic(restauranteId!),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    },
  )
}

export const usePlatoDelDia: UsePlatoDelDiaFn = usePlatoDelDiaImpl as UsePlatoDelDiaFn
