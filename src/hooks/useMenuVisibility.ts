'use client'

import { isCurrentlyVisible } from '@/lib/visibility'

// ── useMenuVisibility — cadena de visibilidad del menú público ──
// Derivación PURA (sin estado, sin fetch): categorías por horario → platos
// visibles → combos/promos visibles → día/ganador/sorpréndeme → búsqueda →
// dedup de destacados en el listado.
//
// CONTRATO de tiempo: `ahora` llega como PARÁMETRO — la página lo computa una
// vez por render junto a useTick(60s). Este hook NO llama new Date() ni usa
// useMemo: la cadena se recomputa en cada render A PROPÓSITO para que la
// visibilidad por horario se refresque con el tick (no "optimizar").
export function useMenuVisibility({
  categorias,
  combosEnriquecidos,
  promosPublico,
  platoDia,
  platoGanador,
  config,
  esProPublico,
  busqueda,
  ahora,
}: {
  categorias: any[]
  combosEnriquecidos: any[]
  promosPublico: any[]
  platoDia: any
  platoGanador: any
  config: any
  esProPublico: boolean
  busqueda: string
  ahora: Date
}) {
  const horaActual = `${ahora.getHours().toString().padStart(2, '0')}:${ahora.getMinutes().toString().padStart(2, '0')}`

  // Las categorías con horario configurado siempre respetan su ventana,
  // independientemente del antiguo toggle global.
  const categoriasPorHorario = categorias.filter((cat: any) =>
    isCurrentlyVisible({ horaInicio: cat.hora_inicio, horaFin: cat.hora_fin, ahora })
  )

  // IDs de platos visibles por horario
  const platosVisiblesIds = new Set<string>(categoriasPorHorario.flatMap((c: any) => c.platos.map((p: any) => p.id)))

  // Filtrar combos: solo mostrar si TODOS sus platos son visibles
  const combosVisibles = combosEnriquecidos.filter((combo: any) => {
    // Excluir combos sin precio válido
    if (combo.precio === null || combo.precio === undefined) return false

    // Restricciones propias del combo (solo si están configuradas)
    const hasDias = combo.dias && combo.dias.length > 0
    const hasHorario = combo.horario_inicio && combo.horario_fin
    if (hasDias || hasHorario) {
      const visible = isCurrentlyVisible({
        dias: hasDias ? combo.dias : null,
        horaInicio: hasHorario ? combo.horario_inicio : null,
        horaFin: hasHorario ? combo.horario_fin : null,
        ahora,
      })
      if (!visible) return false
    }

    const platosDelCombo = categorias.flatMap((c: any) => c.platos).filter((p: any) => combo.platosIds?.includes(p.id))
    return platosDelCombo.every((p: any) => platosVisiblesIds.has(p.id))
  })

  // Filtrar promos: solo mostrar si TODOS sus platos son visibles Y la promo es válida
  const promosVisibles = promosPublico.filter((promo: any) => {
    // Excluir promos con datos inválidos (valor null/undefined cuando se requiere)
    const requiereValor = promo.tipo === 'descuento'
    if (requiereValor && (promo.valor === null || promo.valor === undefined || promo.valor === 0)) {
      return false
    }
    if (!isCurrentlyVisible({ dias: promo.dias, ahora })) return false
    return promo.platosIds?.every((id: string) => platosVisiblesIds.has(id))
  })

  // Plato del día: respeta su propia ventana horaria
  const platoDiaEnHorario = isCurrentlyVisible({
    horaInicio: platoDia?.horaInicio,
    horaFin: platoDia?.horaFin,
    ahora,
  })
  const platoDiaVisible = platoDia && platoDiaEnHorario && platosVisiblesIds.has(platoDia.id)
  const platoGanadorVisible = platoGanador && platosVisiblesIds.has(platoGanador.id)

  // Sorpréndeme: verificar si ambas categorías están activas
  const sorprendemeVisible = (() => {
    const catsSorprendeme = config?.sorprendeme_categorias || []
    if (catsSorprendeme.length !== 2) return true
    return catsSorprendeme.every((catId: string) => categoriasPorHorario.some((c: any) => c.id === catId))
  })()

  const categoriasFiltradas = busqueda.trim()
    ? categoriasPorHorario.map((cat: any) => ({ ...cat, platos: cat.platos.filter((p: any) => p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.descripcion?.toLowerCase().includes(busqueda.toLowerCase())) })).filter((cat: any) => cat.platos.length > 0)
    : categoriasPorHorario

  // F8.7 — Hide platos that are currently being shown as featured (plato del día / ganador)
  // from the regular listing. Gated on the SAME visibility condition as the featured cards
  // so the plato never disappears entirely (e.g. outside día horario, the featured card
  // unmounts and the listing card reappears).
  const idsOcultarEnListado = new Set<string>()
  if (esProPublico && config?.plato_dia_activo && platoDiaVisible && !busqueda.trim() && platoDia) {
    idsOcultarEnListado.add(platoDia.id)
  }
  if (esProPublico && config?.plato_ganador_activo && platoGanadorVisible && !busqueda.trim() && platoGanador) {
    idsOcultarEnListado.add(platoGanador.id)
  }
  const categoriasListado = idsOcultarEnListado.size > 0
    ? categoriasFiltradas
        .map((cat: any) => ({ ...cat, platos: cat.platos.filter((p: any) => !idsOcultarEnListado.has(p.id)) }))
        .filter((cat: any) => cat.platos.length > 0)
    : categoriasFiltradas

  return {
    horaActual,
    categoriasPorHorario,
    platosVisiblesIds,
    combosVisibles,
    promosVisibles,
    platoDiaVisible,
    platoGanadorVisible,
    sorprendemeVisible,
    categoriasFiltradas,
    categoriasListado,
  }
}
