'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { parseCartKey, precioEfectivo } from '@/lib/cart'
import { fechaColombia } from '@/lib/fechas'
import { formatoPrecio } from '@/lib/precio'
import { getSessionId } from '@/lib/analytics'

// ── useCart — estado y operaciones del pedido del menú público ──
// Única fuente del carrito: lo consumen tarjetas, héroes día/ganador, modal de
// combo, modal de detalle, bandeja flotante, modal de pedido y WhatsApp.
//
// preciosPromo significa exactamente "specials CONGELADOS (keys con source
// dia/ganador)": precio capturado al agregar, nunca recalculado. Las líneas SIN
// source no escriben aquí — re-derivan su promo en vivo en itemsPedido (BL.27).
export function useCart({
  todosLosPlatos,
  platoDia,
  effDiscount,
  has2x1,
  restaurante,
  esQR,
  qrMesa,
}: {
  todosLosPlatos: any[]
  platoDia: any
  effDiscount: (platoId: string, varianteId: string | null) => number
  has2x1: (platoId: string, varianteId: string | null) => boolean
  restaurante: any
  esQR: boolean
  qrMesa: string | null
}) {
  const [pedido, setPedido] = useState<Record<string, number>>({})
  const [preciosPromo, setPreciosPromo] = useState<Record<string, { precioUnitario: number; etiqueta: string }>>({})
  const [nota, setNota] = useState('')

  function agregarAlPedido(cartKey: string) {
    // PIEZA 3c-ii: parsear ANTES del incremento para poder consultar el índice 2x1.
    // En el PRIMER add de un 2x1 la entrada de preciosPromo aún no existe, así que
    // el incremento debe derivarse del ÍNDICE (has2x1) → primer add ya suma de a 2
    // (qty par desde el inicio).
    // BL.28: el stepping consulta SOLO el índice vivo (antes también miraba el tag
    // congelado de preciosPromo, que quedaba viejo si la promo se eliminaba en el
    // admin). Edge aceptado: una línea agregada como 2x1 cuya promo luego se elimina
    // pasa a step ±1 — consistente con itemsPedido, que ya la cobra como N unidades
    // a precio normal (BL.27). Guard !source: las líneas día/ganador NUNCA step ±2
    // (su precio es congelado; un 2x1 vigente sobre el mismo plato no las afecta).
    const parsed = parseCartKey(cartKey)
    const es2x1 = !parsed.source && has2x1(parsed.platoId, parsed.varianteId ?? null)
    const incremento = es2x1 ? 2 : 1
    setPedido({ ...pedido, [cartKey]: (pedido[cartKey] || 0) + incremento })
    // F8.7: si la key es de plato del día, registrar el precio especial (idempotente).
    // PIEZA 3b-ii-A / 3c-ii: para keys CON source (specials congelados), registrar el
    // precio aplicable. MUTUAMENTE EXCLUYENTE y ordenado: día → descuento → 2x1. Día
    // gana siempre (source==='dia' nunca debe sobrescribirse); 3a garantiza que
    // descuento y 2x1 no coexisten por variante.
    // BL.28: las keys SIN source ya NO escriben en preciosPromo — tras quitar las
    // lecturas del tag congelado no les queda ningún lector (itemsPedido re-deriva
    // en vivo, BL.27). preciosPromo queda solo para specials congelados.
    if (parsed.source === 'dia' && platoDia && parsed.platoId === platoDia.id) {
      setPreciosPromo({
        ...preciosPromo,
        [cartKey]: { precioUnitario: platoDia.precioEspecial, etiqueta: 'Plato del día' }
      })
    } else if (parsed.source) {
      const plato = todosLosPlatos.find((p: any) => p.id === parsed.platoId)
      const pct = effDiscount(parsed.platoId, parsed.varianteId ?? null)
      if (pct > 0 && plato) {
        const base = precioEfectivo(plato, parsed.varianteId)
        const precioDesc = Math.round(base * (1 - pct / 100))
        setPreciosPromo({
          ...preciosPromo,
          [cartKey]: { precioUnitario: precioDesc, etiqueta: `${pct}% OFF` }
        })
      } else if (has2x1(parsed.platoId, parsed.varianteId ?? null) && plato) {
        const base = precioEfectivo(plato, parsed.varianteId)
        setPreciosPromo({
          ...preciosPromo,
          [cartKey]: { precioUnitario: Math.round(base / 2), etiqueta: '2x1' }
        })
      }
    }
  }

  function quitarDelPedido(cartKey: string) {
    // Si el plato tiene promo 2x1 VIGENTE, restar de 2 en 2 para mantener múltiplos.
    // BL.28: consulta el índice vivo (antes leía el tag congelado de preciosPromo,
    // que seguía diciendo '2x1' tras eliminar la promo en el admin, o decía nada
    // para una promo creada con la línea ya en el carrito). Mismo es2x1 que
    // agregarAlPedido, así +/- siempre step igual.
    const parsed = parseCartKey(cartKey)
    const es2x1 = !parsed.source && has2x1(parsed.platoId, parsed.varianteId ?? null)
    const decremento = es2x1 ? 2 : 1
    const c = (pedido[cartKey] || 0) - decremento

    if (c <= 0) {
      const n = { ...pedido }
      delete n[cartKey]
      // Si se elimina totalmente, limpiar también el precio promo asociado
      const p = { ...preciosPromo }
      delete p[cartKey]
      setPedido(n)
      setPreciosPromo(p)
    } else {
      setPedido({ ...pedido, [cartKey]: c })
    }
  }

  // SIN useMemo a propósito (BL.27): re-deriva contra los índices vivos en cada
  // render para que editar/eliminar una promo en el admin se refleje al instante.
  const itemsPedido = Object.entries(pedido).map(([cartKey, cantidad]) => {
    const { platoId, varianteId, source } = parseCartKey(cartKey)
    const plato = todosLosPlatos.find((p: any) => p.id === platoId)
    if (!plato) return null
    const variante = varianteId
      ? (plato as any).variantes?.find((v: any) => v.id === varianteId)
      : undefined
    // Defensive: si la cartKey referencia una variante que ya no existe, descartar el item
    if (varianteId && !variante) return null
    // Promo cart-sync: día/ganador son specials congelados (precio capturado al
    // agregar; NUNCA recalcular, ver comentario de día en agregarAlPedido). Para
    // líneas normales, RE-DERIVAR descuento/2x1 contra los índices vivos
    // (effDiscount/has2x1) en vez de leer preciosPromo congelado, para que editar o
    // eliminar una promo en el admin se refleje en el carrito (precio, total,
    // WhatsApp, productos). Mismo orden y cómputo que agregarAlPedido: descuento → 2x1.
    // Si ninguna promo aplica ahora (eliminada, fuera de día/hora, promos off) →
    // promo undefined → la línea cae al precio normal del plato/variante. La cantidad
    // NO se toca: una promo revertida queda como N unidades a precio normal.
    let promo: { precioUnitario: number; etiqueta: string } | undefined
    if (source === 'dia' || source === 'ganador') {
      promo = preciosPromo[cartKey]
    } else {
      const base = precioEfectivo(plato, varianteId)
      const pct = effDiscount(platoId, varianteId ?? null)
      if (pct > 0) {
        promo = { precioUnitario: Math.round(base * (1 - pct / 100)), etiqueta: `${pct}% OFF` }
      } else if (has2x1(platoId, varianteId ?? null)) {
        promo = { precioUnitario: Math.round(base / 2), etiqueta: '2x1' }
      } else {
        promo = undefined
      }
    }
    return { plato, variante, cantidad, promo, cartKey }
  }).filter((i: any) => i !== null) as Array<{
    plato: any
    variante?: any
    cantidad: number
    promo?: { precioUnitario: number; etiqueta: string }
    cartKey: string
  }>
  const totalPedido = itemsPedido.reduce((sum, i) => {
    const unitPrice = i.promo
      ? i.promo.precioUnitario
      : (i.variante ? i.variante.precio : i.plato.precio)
    return sum + unitPrice * i.cantidad
  }, 0)
  const totalProductos = itemsPedido.reduce((sum, i) => sum + i.cantidad, 0)

  function pedirPorWhatsApp() {
    // Registrar pedido
    const supabasePedido = createClient()
    supabasePedido.from('pedidos_whatsapp').insert({
      restaurante_id: restaurante.id,
      origen: esQR ? 'qr' : 'enlace',
      mesa: qrMesa || null,
      fecha: fechaColombia(),
      total: totalPedido,
      nota: nota || null,
      session_id: getSessionId(),
      productos: itemsPedido.map(i => ({
        nombre: i.variante ? `${i.plato.nombre} (${i.variante.nombre})` : i.plato.nombre,
        cantidad: i.cantidad,
        // Precio efectivamente cobrado (promo-aware): misma expresión que la línea del
        // mensaje de WhatsApp, para que sum(precio*cantidad) coincida con total.
        precio: i.promo ? i.promo.precioUnitario : (i.variante ? i.variante.precio : i.plato.precio),
        etiqueta: i.promo ? i.promo.etiqueta : null,
      })),
    }).then(({ error }: any) => {

    })
    const lineas = itemsPedido.map(i => {
      const nombre = i.variante ? `${i.plato.nombre} (${i.variante.nombre})` : i.plato.nombre
      const precioUnit = i.promo ? i.promo.precioUnitario : (i.variante ? i.variante.precio : i.plato.precio)
      const etiqueta = i.promo ? ` (${i.promo.etiqueta})` : ''
      return `- ${i.cantidad} ${nombre}${etiqueta} $${formatoPrecio(precioUnit * i.cantidad)}`
    })
    let msg = `Hola! Vi tu menú en ${restaurante.nombre} y quiero pedir:\n${lineas.join('\n')}`
    if (nota) msg += `\nNota: ${nota}`
    msg += `\nTotal: $${formatoPrecio(totalPedido)}`
    window.open(`https://wa.me/57${restaurante.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // Limpieza de líneas fuera de horario (el banner "platos no disponibles" del
  // menú la dispara). La página provee el predicado de visibilidad — el carrito
  // no sabe de horarios.
  function limpiarNoDisponibles(esVisible: (platoId: string) => boolean): void {
    const nuevoPedido = { ...pedido }
    const nuevosPrecios = { ...preciosPromo }
    Object.keys(nuevoPedido).forEach(cartKey => {
      const { platoId } = parseCartKey(cartKey)
      if (!esVisible(platoId)) {
        delete nuevoPedido[cartKey]
        delete nuevosPrecios[cartKey]
      }
    })
    setPedido(nuevoPedido)
    setPreciosPromo(nuevosPrecios)
  }

  return {
    pedido,
    nota,
    setNota,
    agregarAlPedido,
    quitarDelPedido,
    itemsPedido,
    totalPedido,
    totalProductos,
    pedirPorWhatsApp,
    limpiarNoDisponibles,
  }
}
