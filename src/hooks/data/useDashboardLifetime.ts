'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase-browser'

// ─────────────────────────────────────────────────────────────────────────────
// useDashboardLifetime — Refactor Fase 4, Commit 2/4.
//
// Lecturas del dashboard INDEPENDIENTES del periodo (BL.32-B): la calificación
// promedio histórica y las últimas reseñas NO dependen del eje Hoy/Semana/Mes, así que
// viven en su propia cache key y NUNCA se refetchan al cambiar de periodo.
//
// Reemplazo PURO de fetch: devuelve FILAS CRUDAS. El componente sigue calculando
// promedio/totalResenas y el formateo "lifetime" de las reseñas (commit siguiente).
// ─────────────────────────────────────────────────────────────────────────────

export interface DashboardLifetimeData {
  // #4 calificaciones (estrellas) — todas, sin filtro de periodo → promedio + count
  calData: Array<{ estrellas: number }>
  // #9 calificaciones top-3 con join platos(nombre), orden created_at desc
  resenasData: any[]
}

async function fetchDashboardLifetime(restauranteId: string): Promise<DashboardLifetimeData> {
  const supabase = createClient()

  const [calRes, resenasRes] = await Promise.all([
    supabase.from('calificaciones').select('estrellas')
      .eq('restaurante_id', restauranteId),
    supabase.from('calificaciones').select('*, platos(nombre)')
      .eq('restaurante_id', restauranteId)
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  return {
    calData: (calRes.data ?? []) as DashboardLifetimeData['calData'],
    resenasData: (resenasRes.data ?? []) as any[],
  }
}

export function useDashboardLifetime(restauranteId: string | null | undefined) {
  return useSWR(
    restauranteId ? ['dashboard-lifetime', restauranteId] : null,
    () => fetchDashboardLifetime(restauranteId!),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )
}
