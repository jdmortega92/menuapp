'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase-browser'
import { fechaColombia } from '@/lib/fechas'
import type { Plan } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// useDashboardAlertas — Refactor Fase 4, Commit 2/4.
//
// Lecturas de las alertas del dashboard. Todas usan ventanas FIJAS (últimos 3 días,
// histórico, mes-a-la-fecha) distintas del eje de periodo, así que la key incluye el
// plan (de él depende si #17 corre) pero NO el periodo seleccionado.
//
// Reemplazo PURO de fetch: devuelve CONTEOS/FILAS CRUDOS. El ensamblaje de los mensajes
// (el array `alertas`) se queda en el componente (commit siguiente).
// Las ventanas de fecha se replican VERBATIM (BL.29: starts derivados de COT).
// ─────────────────────────────────────────────────────────────────────────────

export interface DashboardAlertasData {
  // #13 visitas_menu — conteo últimos 3 días (COT)
  visitasUltimos3: number
  // #14 visitas_menu — conteo histórico (solo se consulta si visitasUltimos3 === 0)
  totalVisitasHist: number | null
  // #15 platos — updated_at del plato más reciente (para "menú sin actualizar")
  ultimoPlato: Array<{ updated_at: string }>
  // #16 platos — agotados (disponible=false) con updated_at
  platosAgotados: Array<{ id: string; nombre: string; updated_at: string }>
  // #17 visitas_menu — conteo mes-a-la-fecha; null cuando plan !== 'gratis'
  visitasMes: number | null
}

async function fetchDashboardAlertas(restauranteId: string, plan: Plan): Promise<DashboardAlertasData> {
  const supabase = createClient()
  const hoy = new Date()
  const hoyStr = fechaColombia(hoy)
  const hace3Dias = fechaColombia(new Date(hoy.getTime() - 3 * 24 * 60 * 60 * 1000))

  // Independientes: #13, #15, #16 en una sola tanda paralela.
  const [visitas3Res, ultimoPlatoRes, agotadosRes] = await Promise.all([
    supabase.from('visitas_menu').select('*', { count: 'exact', head: true })
      .eq('restaurante_id', restauranteId)
      .gte('fecha', hace3Dias).lte('fecha', hoyStr),
    supabase.from('platos').select('updated_at')
      .eq('restaurante_id', restauranteId)
      .order('updated_at', { ascending: false }).limit(1),
    supabase.from('platos').select('id, nombre, updated_at')
      .eq('restaurante_id', restauranteId)
      .eq('disponible', false),
  ])

  const visitasUltimos3 = visitas3Res.count || 0

  // Dependiente: #14 histórico solo si no hubo visitas en los últimos 3 días.
  let totalVisitasHist: number | null = null
  if (visitasUltimos3 === 0) {
    const { count } = await supabase.from('visitas_menu')
      .select('*', { count: 'exact', head: true })
      .eq('restaurante_id', restauranteId)
    totalVisitasHist = count || 0
  }

  // #17 mes-a-la-fecha SOLO en plan gratis. primerDiaMes derivado de hoyStr (BL.29 COT).
  let visitasMes: number | null = null
  if (plan === 'gratis') {
    const primerDiaMes = `${hoyStr.slice(0, 7)}-01`
    const { count } = await supabase.from('visitas_menu')
      .select('*', { count: 'exact', head: true })
      .eq('restaurante_id', restauranteId)
      .gte('fecha', primerDiaMes).lte('fecha', hoyStr)
    visitasMes = count || 0
  }

  return {
    visitasUltimos3,
    totalVisitasHist,
    ultimoPlato: (ultimoPlatoRes.data ?? []) as DashboardAlertasData['ultimoPlato'],
    platosAgotados: (agotadosRes.data ?? []) as DashboardAlertasData['platosAgotados'],
    visitasMes,
  }
}

export function useDashboardAlertas(restauranteId: string | null | undefined, plan: Plan) {
  return useSWR(
    restauranteId ? ['dashboard-alertas', restauranteId, plan] : null,
    () => fetchDashboardAlertas(restauranteId!, plan),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )
}
