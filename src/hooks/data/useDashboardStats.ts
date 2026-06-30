'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase-browser'
import { computeDashboardWindow, type Periodo, type DashboardWindow } from '@/lib/dashboardWindow'

// ─────────────────────────────────────────────────────────────────────────────
// useDashboardStats — Refactor Fase 4, Commit 1/4.
//
// Reemplazo PURO de la capa de fetch del dashboard (antes inline en cargarStats,
// src/app/dashboard/page.tsx). Devuelve FILAS CRUDAS + las variables de ventana, y
// NADA MÁS: no calcula escaneosPorDia, el embudo (Set-intersection), embudoData, el
// titular reconciliado de "platos vistos", ni ninguna derivación — todo eso sigue en
// el componente (commit siguiente).
//
// Paraleliza las lecturas independientes del periodo en un solo Promise.all (subsume
// la mitad "parallelize" de BL.35; los índices DB siguen aparte). La única dependencia
// secuencial es #6 platos → #11 vistas_platos anterior (.in(plato_id) con guard de
// lista vacía).
// ─────────────────────────────────────────────────────────────────────────────

export interface DashboardStatsData {
  window: DashboardWindow
  // #1 visitas_menu count (periodo actual)
  visitasCount: number
  // #2 pedidos_whatsapp count (periodo actual)
  pedidosCount: number
  // #3a/3b/3c session_id (NOT NULL) del periodo — para el embudo por sesión
  sesMenuRows: Array<{ session_id: string }>
  sesPlatoRows: Array<{ session_id: string }>
  sesPedidoRows: Array<{ session_id: string }>
  // #5 vistas_platos plato_id del periodo
  vistasData: Array<{ plato_id: string }>
  // #6 platos (id, nombre, created_at) — todos, sin filtro de periodo
  platosInfo: Array<{ id: string; nombre: string; created_at: string }>
  // #7 visitas_menu created_at + fecha (heatmap / horarios pico)
  visitasHora: Array<{ created_at: string; fecha: string }>
  // #8 visitas_menu fecha (gráfico por día / mejor-peor día)
  visitasDia: Array<{ fecha: string }>
  // #10 visitas_menu count (periodo anterior)
  visitasAntCount: number
  // #12 pedidos_whatsapp count (periodo anterior)
  pedidosAntCount: number
  // #11 vistas_platos count (periodo anterior, SOLO platos actuales — guard incluido)
  vistasPlatosAntCount: number
}

async function fetchDashboardStats(restauranteId: string, periodo: Periodo): Promise<DashboardStatsData> {
  const supabase = createClient()
  const window = computeDashboardWindow(periodo, new Date())
  const { desde, hasta, desdeAnterior, hastaAnterior } = window

  // ── Lecturas independientes del periodo: una sola tanda paralela (BL.35) ──
  const [
    visitasRes,      // #1
    pedidosRes,      // #2
    sesMenuRes,      // #3a
    sesPlatoRes,     // #3b
    sesPedidoRes,    // #3c
    vistasRes,       // #5
    platosRes,       // #6
    visitasHoraRes,  // #7
    visitasDiaRes,   // #8
    visitasAntRes,   // #10
    pedidosAntRes,   // #12
  ] = await Promise.all([
    supabase.from('visitas_menu').select('*', { count: 'exact', head: true })
      .eq('restaurante_id', restauranteId).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('pedidos_whatsapp').select('*', { count: 'exact', head: true })
      .eq('restaurante_id', restauranteId).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('visitas_menu').select('session_id')
      .eq('restaurante_id', restauranteId).gte('fecha', desde).lte('fecha', hasta)
      .not('session_id', 'is', null),
    supabase.from('vistas_platos').select('session_id')
      .eq('restaurante_id', restauranteId).gte('fecha', desde).lte('fecha', hasta)
      .not('session_id', 'is', null),
    supabase.from('pedidos_whatsapp').select('session_id')
      .eq('restaurante_id', restauranteId).gte('fecha', desde).lte('fecha', hasta)
      .not('session_id', 'is', null),
    supabase.from('vistas_platos').select('plato_id')
      .eq('restaurante_id', restauranteId).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('platos').select('id, nombre, created_at')
      .eq('restaurante_id', restauranteId),
    supabase.from('visitas_menu').select('created_at, fecha')
      .eq('restaurante_id', restauranteId).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('visitas_menu').select('fecha')
      .eq('restaurante_id', restauranteId).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('visitas_menu').select('*', { count: 'exact', head: true })
      .eq('restaurante_id', restauranteId).gte('fecha', desdeAnterior).lte('fecha', hastaAnterior),
    supabase.from('pedidos_whatsapp').select('*', { count: 'exact', head: true })
      .eq('restaurante_id', restauranteId).gte('fecha', desdeAnterior).lte('fecha', hastaAnterior),
  ])

  const platosInfo = (platosRes.data ?? []) as DashboardStatsData['platosInfo']

  // ── Dependiente: #6 → #11. Periodo anterior contando SOLO platos actuales, para
  // que la variación compare como-con-como. Guard: .in() vacío NO debe significar
  // "todas las filas" → si no hay platos actuales, el conteo es 0 sin consultar.
  const currentPlatoIds = platosInfo.map((p) => p.id)
  let vistasPlatosAntCount = 0
  if (currentPlatoIds.length > 0) {
    const { count } = await supabase
      .from('vistas_platos')
      .select('*', { count: 'exact', head: true })
      .eq('restaurante_id', restauranteId)
      .gte('fecha', desdeAnterior)
      .lte('fecha', hastaAnterior)
      .in('plato_id', currentPlatoIds)
    vistasPlatosAntCount = count || 0
  }

  return {
    window,
    visitasCount: visitasRes.count ?? 0,
    pedidosCount: pedidosRes.count ?? 0,
    sesMenuRows: (sesMenuRes.data ?? []) as DashboardStatsData['sesMenuRows'],
    sesPlatoRows: (sesPlatoRes.data ?? []) as DashboardStatsData['sesPlatoRows'],
    sesPedidoRows: (sesPedidoRes.data ?? []) as DashboardStatsData['sesPedidoRows'],
    vistasData: (vistasRes.data ?? []) as DashboardStatsData['vistasData'],
    platosInfo,
    visitasHora: (visitasHoraRes.data ?? []) as DashboardStatsData['visitasHora'],
    visitasDia: (visitasDiaRes.data ?? []) as DashboardStatsData['visitasDia'],
    visitasAntCount: visitasAntRes.count ?? 0,
    pedidosAntCount: pedidosAntRes.count ?? 0,
    vistasPlatosAntCount,
  }
}

export function useDashboardStats(restauranteId: string | null | undefined, periodo: Periodo) {
  return useSWR(
    restauranteId ? ['dashboard-stats', restauranteId, periodo] : null,
    () => fetchDashboardStats(restauranteId!, periodo),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
      // Al cambiar de periodo (nueva key) conserva los datos del periodo anterior
      // mientras llega el nuevo → sin parpadeo a cero en el toggle (replica el UX
      // pre-migración, donde el estado viejo seguía visible durante el refetch).
      keepPreviousData: true,
    }
  )
}
