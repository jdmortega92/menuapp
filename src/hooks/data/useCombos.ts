'use client'

import useSWR, { SWRResponse } from 'swr'
import { createClient } from '@/lib/supabase-browser'
import type { DiaSemana } from '@/types'

export interface ComboPublico {
  id: string
  nombre: string
  descripcion: string | null
  precio: number
  precioIndividual: number
  platos: string[]
  platosIds: string[]
  // ───── New fields ─────
  dias: DiaSemana[] | null
  horario_inicio: string | null
  horario_fin: string | null
}

export interface ComboAdmin {
  id: string
  restaurante_id: string
  nombre: string
  descripcion: string | null
  precio: number
  precio_individual: number
  activo: boolean
  dias: DiaSemana[] | null
  horario_inicio: string | null
  horario_fin: string | null
  combo_platos: { plato_id: string; platos?: { nombre: string; precio: number } | null }[]
}

async function fetchCombosPublic(restauranteId: string): Promise<ComboPublico[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('combos')
    .select('*, combo_platos(plato_id, platos(nombre, precio))')
    .eq('restaurante_id', restauranteId)
    .eq('activo', true)
    .order('created_at', { ascending: false })

  if (!data) return []
  return (data as any[]).map((c: any) => ({
    id: c.id,
    nombre: c.nombre,
    descripcion: c.descripcion ?? null,
    precio: c.precio,
    precioIndividual: c.precio_individual,
    platos: (c.combo_platos ?? []).map((cp: any) => cp.platos?.nombre || 'Plato'),
    platosIds: (c.combo_platos ?? []).map((cp: any) => cp.plato_id),
    dias: (c.dias && c.dias.length > 0) ? c.dias as DiaSemana[] : null,
    horario_inicio: c.horario_inicio ?? null,
    horario_fin: c.horario_fin ?? null,
  }))
}

async function fetchCombosAdmin(restauranteId: string): Promise<ComboAdmin[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('combos')
    .select('*, combo_platos(plato_id, platos(nombre, precio))')
    .eq('restaurante_id', restauranteId)
    .order('created_at', { ascending: false })
  return (data ?? []) as ComboAdmin[]
}

interface UseCombosFn {
  (restauranteId: string | null | undefined): SWRResponse<ComboPublico[], any>
  (
    restauranteId: string | null | undefined,
    options: { includeInactive: true },
  ): SWRResponse<ComboAdmin[], any>
}

const useCombosImpl = (
  restauranteId: string | null | undefined,
  options?: { includeInactive?: boolean },
) => {
  const includeInactive = !!options?.includeInactive
  return useSWR<ComboPublico[] | ComboAdmin[]>(
    restauranteId ? ['combos', restauranteId, { includeInactive }] : null,
    async () =>
      includeInactive
        ? fetchCombosAdmin(restauranteId!)
        : fetchCombosPublic(restauranteId!),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    },
  )
}

export const useCombos: UseCombosFn = useCombosImpl as UseCombosFn
