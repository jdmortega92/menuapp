'use client'

import { useMemo } from 'react'

// ── usePromoIndices — índices de promos activas para DISPLAY público ──
// Consume promosVisibles (output de useMenuVisibility) + los gates de plan.
// `promosActivo` llega como parámetro (la página pasa config?.promos_activo);
// el hook NO re-lee config.
export function usePromoIndices({
  promosVisibles,
  esProPublico,
  promosActivo,
}: {
  promosVisibles: any[]
  esProPublico: boolean
  promosActivo: boolean | undefined
}) {
  // PIEZA 3b-i — Índice de descuentos activos para DISPLAY público.
  // CHOKE POINT de gating: si el restaurante no es Pro o tiene promos desactivadas,
  // el índice queda VACÍO → effDiscount() devuelve 0 en todas partes → cada superficie
  // (tarjeta, modal) cae naturalmente a "sin descuento". Solo se indexan promos tipo
  // 'descuento' (dos_por_uno se ignora aquí). promoPlatos: { plato_id, variante_id }[].
  const descuentoIndex = useMemo(() => {
    const idx = new Map<string, { varianteId: string | null; valor: number; promoNombre: string }[]>()
    if (!(esProPublico && promosActivo)) return idx
    promosVisibles
      .filter((p: any) => p.tipo === 'descuento')
      .forEach((promo: any) => {
        (promo.promoPlatos ?? []).forEach((pp: any) => {
          const arr = idx.get(pp.plato_id) ?? []
          arr.push({ varianteId: pp.variante_id ?? null, valor: promo.valor, promoNombre: promo.nombre })
          idx.set(pp.plato_id, arr)
        })
      })
    return idx
  }, [promosVisibles, esProPublico, promosActivo])

  // % de descuento efectivo para un (plato, variante). Una entrada aplica si su
  // varianteId coincide con la variante pedida, o si es null (aplica a TODAS las
  // variantes). Defensivo: si varias aplican, toma el MAX valor (3a garantiza ≤1
  // por plato+variante+día). Devuelve 0 si no hay descuento (o índice vacío).
  function effDiscount(platoId: string, varianteId: string | null): number {
    const entries = descuentoIndex.get(platoId)
    if (!entries || entries.length === 0) return 0
    let max = 0
    for (const e of entries) {
      if (e.varianteId === varianteId || e.varianteId === null) {
        if (e.valor > max) max = e.valor
      }
    }
    return max
  }

  // Info para el pill de la tarjeta: min/max % aplicables sobre el plato (sobre sus
  // variantes con descuento, o el descuento único si no tiene variantes).
  function discountInfoCard(plato: any): { min: number; max: number; applies: boolean } {
    const tieneVar = plato.variantes && plato.variantes.length > 0
    const valores: number[] = []
    if (tieneVar) {
      for (const v of plato.variantes) {
        const d = effDiscount(plato.id, v.id)
        if (d > 0) valores.push(d)
      }
    } else {
      const d = effDiscount(plato.id, null)
      if (d > 0) valores.push(d)
    }
    if (valores.length === 0) return { min: 0, max: 0, applies: false }
    return { min: Math.min(...valores), max: Math.max(...valores), applies: true }
  }

  // PIEZA 3c-i — Índice de promos 2x1 activas para DISPLAY público. Paralelo y
  // separado de descuentoIndex: el "valor" de un 2x1 no es un porcentaje sino un
  // mecanismo, así que no se fuerza en la forma numérica del descuento. Mismo CHOKE
  // POINT de gating: vacío si no es Pro / promos off → has2x1() falso en todas partes.
  const promo2x1Index = useMemo(() => {
    const idx = new Map<string, { varianteId: string | null }[]>()
    if (!(esProPublico && promosActivo)) return idx
    promosVisibles
      .filter((p: any) => p.tipo === 'dos_por_uno')
      .forEach((promo: any) => {
        (promo.promoPlatos ?? []).forEach((pp: any) => {
          const arr = idx.get(pp.plato_id) ?? []
          arr.push({ varianteId: pp.variante_id ?? null })
          idx.set(pp.plato_id, arr)
        })
      })
    return idx
  }, [promosVisibles, esProPublico, promosActivo])

  // ¿El (plato, variante) tiene un 2x1 activo? Una entrada aplica si su varianteId
  // coincide con la variante pedida, o si es null (aplica a TODAS las variantes).
  // Mirror de la lógica de matching de effDiscount. Falso si el índice está vacío.
  function has2x1(platoId: string, varianteId: string | null): boolean {
    const entries = promo2x1Index.get(platoId)
    if (!entries || entries.length === 0) return false
    return entries.some(e => e.varianteId === varianteId || e.varianteId === null)
  }

  // ¿El plato tiene algún 2x1 aplicable (en cualquier variante, o null si no tiene)?
  // Para la lógica de pill de la tarjeta.
  function has2x1Card(plato: any): boolean {
    const tieneVar = plato.variantes && plato.variantes.length > 0
    if (tieneVar) return plato.variantes.some((v: any) => has2x1(plato.id, v.id))
    return has2x1(plato.id, null)
  }

  return { descuentoIndex, effDiscount, discountInfoCard, promo2x1Index, has2x1, has2x1Card }
}
