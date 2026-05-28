'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { mutate } from 'swr'
import { createClient } from '@/lib/supabase-browser'
import Modal from '@/components/ui/Modal'
import { formato12h } from '@/lib/time'
import { isCurrentlyVisible } from '@/lib/visibility'
import { useRestauranteBySlug } from '@/hooks/data/useRestauranteBySlug'
import { useCategoriasYPlatos } from '@/hooks/data/useCategoriasYPlatos'
import { useCalificacionesAggregate } from '@/hooks/data/useCalificacionesAggregate'
import { usePlatoDelDia } from '@/hooks/data/usePlatoDelDia'
import { useCombos } from '@/hooks/data/useCombos'
import { usePromos } from '@/hooks/data/usePromos'
import { usePlatoGanador } from '@/hooks/data/usePlatoGanador'
import { useConfigRestaurante } from '@/hooks/data/useConfigRestaurante'
import { useHorarios } from '@/hooks/data/useHorarios'
import { useTick } from '@/hooks/useTick'

// Helper: formatea precios de forma segura (evita crashes si viene null/undefined)
function formatoPrecio(valor: number | null | undefined): string {
  return (valor ?? 0).toLocaleString('es-CO')
}

function formatDiasFull(dias: string[]): string {
  const map: Record<string, string> = {
    lun: 'Lunes', mar: 'Martes', mie: 'Miércoles', jue: 'Jueves',
    vie: 'Viernes', sab: 'Sábado', dom: 'Domingo',
  }
  return dias.map(d => map[d] || d).join(', ')
}

// F8.4 — Cart key helpers
// Plain UUIDs for combos and platos without variantes; composite
// for variantes. UUIDs don't contain "__" so the separator is safe.
const CART_KEY_SEP = '__'

function makeCartKey(platoId: string, varianteId?: string): string {
  return varianteId ? `${platoId}${CART_KEY_SEP}${varianteId}` : platoId
}

function parseCartKey(key: string): { platoId: string; varianteId?: string } {
  const parts = key.split(CART_KEY_SEP)
  if (parts.length === 2) return { platoId: parts[0], varianteId: parts[1] }
  return { platoId: parts[0] }
}

// F8.4b — Promo helpers
function precioEfectivo(plato: any, varianteId?: string): number {
  if (varianteId && plato.variantes) {
    const v = plato.variantes.find((v: any) => v.id === varianteId)
    if (v) return v.precio
  }
  return plato.precio
}

function algunaKeyEsDePlato(seleccion: string[], platoId: string): boolean {
  return seleccion.some(key => parseCartKey(key).platoId === platoId)
}

function obtenerKeyDePlato(seleccion: string[], platoId: string): string | undefined {
  return seleccion.find(key => parseCartKey(key).platoId === platoId)
}

// F8.5a — Combo helpers
// Resolves each raw combo_plato (plato_id + variante_id from the hook) against
// the in-memory plato data, producing the enriched shape used for display:
// variante name + effective price + (foto/descripcion carried for the modal rows).
function enriquecerComboPlatos(rawComboPlatos: any[], todosLosPlatos: any[]) {
  return (rawComboPlatos || []).map(cp => {
    const plato = todosLosPlatos.find((p: any) => p.id === cp.plato_id)
    const variante = cp.variante_id && plato?.variantes
      ? plato.variantes.find((v: any) => v.id === cp.variante_id)
      : null
    // Graceful fallback: if variante_id was set but the variante was since
    // deleted, fall back to plato.precio (sentinel). ON DELETE CASCADE on
    // combo_platos.variante_id should prevent this, but defensive coding.
    const precioEfectivo = variante
      ? variante.precio
      : (cp.precioBase || plato?.precio || 0)
    return {
      plato_id: cp.plato_id,
      variante_id: cp.variante_id || null,
      nombre: cp.nombre || plato?.nombre || '',
      varianteNombre: variante?.nombre || null,
      precioEfectivo,
      // carried for the combo modal rows (image + description)
      foto_url: plato?.foto_url || null,
      descripcion: plato?.descripcion || null,
    }
  })
}

export default function MenuPublicoPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = params.slug as string
  const qrMesa = searchParams.get('qr')
  const esQR = !!qrMesa

  const [busqueda, setBusqueda] = useState('')
  const [categoriaAbierta, setCategoriaAbierta] = useState<string | null>(null)
  const [pedido, setPedido] = useState<Record<string, number>>({})
  const [preciosPromo, setPreciosPromo] = useState<Record<string, { precioUnitario: number; etiqueta: string }>>({})
  const [nota, setNota] = useState('')
  const [mostrarPedido, setMostrarPedido] = useState(false)
  const [mostrarSorpresa, setMostrarSorpresa] = useState(false)
  const [mostrarMenu, setMostrarMenu] = useState(esQR)
  type PlatoDetalleModo = 'normal' | 'ganador' | 'platoDia'
  const [platoDetalle, setPlatoDetalle] = useState<{ id: string; modo: PlatoDetalleModo } | null>(null)
  const [varianteSeleccionadaId, setVarianteSeleccionadaId] = useState<string | null>(null)
  const [platoCalificar, setPlatoCalificar] = useState<string | null>(null)
  const [calEstrellas, setCalEstrellas] = useState(0)
  const [calTags, setCalTags] = useState<string[]>([])
  const [calComentario, setCalComentario] = useState('')
  const [calEnviada, setCalEnviada] = useState(false)
  const [mostrarTodasResenas, setMostrarTodasResenas] = useState(false)

  const { data: restaurante, isLoading: cargandoRest } = useRestauranteBySlug(slug)
  const restId = restaurante?.id ?? null

  const { data: cyp, isLoading: l1 } = useCategoriasYPlatos(restId)
  const { data: calif, isLoading: l2 } = useCalificacionesAggregate(restId)
  const { data: platoDiaRaw, isLoading: l3 } = usePlatoDelDia(restId)
  const { data: combosRaw, isLoading: l4 } = useCombos(restId)
  const { data: promosRaw, isLoading: l5 } = usePromos(restId)
  const { data: platoGanador, isLoading: l6 } = usePlatoGanador(restId)
  const { data: config, isLoading: l7 } = useConfigRestaurante(restId)
  const { data: horariosData, isLoading: l8 } = useHorarios(restId)

  const cargando = cargandoRest || (!!restId && (l1 || l2 || l3 || l4 || l5 || l6 || l7 || l8))

  useTick(60_000)

  const horariosRest = horariosData ?? []
  const combosPublico = combosRaw ?? []
  const promosPublico = promosRaw ?? []
  const platoDia = platoDiaRaw ?? null

  const categorias = useMemo(() => {
    if (!cyp) return []
    const { categorias: cats, platos } = cyp
    return cats.map((cat) => ({
      id: cat.id,
      nombre: cat.nombre,
      hora_inicio: cat.hora_inicio || null,
      hora_fin: cat.hora_fin || null,
      platos: platos
        .filter((p) => p.categoria_id === cat.id)
        .map((p) => {
          const stats = calif?.[p.id]
          return {
            id: p.id,
            nombre: p.nombre,
            precio: p.precio,
            descripcion: p.descripcion || '',
            disponible: p.disponible,
            foto_url: p.foto_url || null,
            estrellas: stats?.promedio ?? 0,
            resenas: stats?.count ?? 0,
            variantes: ((p as any).variantes || []).slice().sort((a: any, b: any) => a.orden - b.orden),
          }
        }),
    }))
  }, [cyp, calif])

  const [mostrarPromos, setMostrarPromos] = useState(false)
  const [promoDetalle, setPromoDetalle] = useState<any>(null)
  const [promoSeleccion, setPromoSeleccion] = useState<string[]>([])
  const [mostrarCombos, setMostrarCombos] = useState(false)
  const [comboDetalle, setComboDetalle] = useState<any>(null)

  useEffect(() => {
    if (!restaurante) return
    const supabase = createClient()
    const fechaColombia = new Date(new Date().getTime() - 5 * 60 * 60 * 1000).toISOString().split('T')[0]
    supabase.from('visitas_menu').insert({
      restaurante_id: restaurante.id,
      origen: esQR ? 'qr' : 'enlace',
      mesa: qrMesa || null,
      fecha: fechaColombia,
    }).then(() => {})
  }, [restaurante?.id])
  useEffect(() => {
    if (!platoDetalle || !restaurante) return
    setResenasReales([])
    setMostrarTodasResenas(false) // Resetear al abrir otro plato
    // Registrar vista del plato
    const supabaseVista = createClient()
    const fechaCOL = new Date(new Date().getTime() - 5 * 60 * 60 * 1000).toISOString().split('T')[0]
    supabaseVista.from('vistas_platos').insert({
      plato_id: platoDetalle.id,
      restaurante_id: restaurante.id,
      fecha: fechaCOL,
    }).then(({ error }: any) => {

    })
    const supabase = createClient()
    supabase.from('calificaciones')
      .select('*')
      .eq('plato_id', platoDetalle.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }: any) => {
        if (data) setResenasReales(data)
        else setResenasReales([])
      })
  }, [platoDetalle, restaurante?.id])

  const color = restaurante?.color_principal || '#E85D24'
  const planRest = restaurante?.plan || 'gratis'

  // Tema del menú público (Claro es default; Oscuro/Natural/Premium requieren Pro)
  const temaConfigurado = restaurante?.tema || 'claro'
  const temaValido = ['claro', 'oscuro', 'natural', 'premium'].includes(temaConfigurado)
  const temaRequierePro = ['oscuro', 'natural', 'premium'].includes(temaConfigurado)
  const tema = (temaRequierePro && planRest !== 'pro')
    ? 'claro'
    : (temaValido ? temaConfigurado : 'claro')
  const themeClass = `theme-${tema}`
  const esProPublico = planRest === 'pro'
  const esBasicoPublico = planRest === 'basico' || planRest === 'pro'
  const todosLosPlatos = [
    ...categorias.flatMap((c: any) => c.platos),
    ...combosPublico.map((c: any) => ({ id: c.id, nombre: c.nombre, precio: c.precio, descripcion: c.descripcion || '', disponible: true, foto_url: null })),
  ]

  // F8.5a — enrich each combo with variante names/prices for display.
  // Runs after todosLosPlatos so the plato/variante lookup has data.
  const combosEnriquecidos = combosPublico.map((combo: any) => ({
    ...combo,
    comboPlatosEnriquecidos: enriquecerComboPlatos(combo.comboPlatos, todosLosPlatos),
  }))

  // F8.4 — al abrir el detalle, preseleccionar la primera variante (orden ASC) o limpiar
  useEffect(() => {
    if (platoDetalle) {
      const plato = todosLosPlatos.find((p: any) => p.id === platoDetalle.id)
      const variantes = (plato as any)?.variantes
      if (variantes && variantes.length > 0) {
        // F8.7: si el modal abre en modo platoDia/ganador con variante lockeada,
        // pre-seleccionar esa variante en lugar de variantes[0].
        let preseleccion: string = variantes[0].id
        if (platoDetalle.modo === 'platoDia' && platoDia?.varianteId) {
          if (variantes.some((v: any) => v.id === platoDia.varianteId)) {
            preseleccion = platoDia.varianteId
          }
        } else if (platoDetalle.modo === 'ganador' && platoGanador?.varianteId) {
          if (variantes.some((v: any) => v.id === platoGanador.varianteId)) {
            preseleccion = platoGanador.varianteId
          }
        }
        setVarianteSeleccionadaId(preseleccion)
      } else {
        setVarianteSeleccionadaId(null)
      }
    }
    // Solo re-ejecutar al abrir un PLATO distinto, no en cada render.
    // todosLosPlatos se reconstruye cada render (no memoizado): incluirlo
    // dispararía el efecto y sobrescribiría la selección del usuario (BL.17).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platoDetalle?.id])

  // Filtrar por horario si está activo
  const ahora = new Date()
  const horaActual = `${ahora.getHours().toString().padStart(2, '0')}:${ahora.getMinutes().toString().padStart(2, '0')}`

  // Las categorías con horario configurado siempre respetan su ventana,
  // independientemente del antiguo toggle global.
  const categoriasPorHorario = categorias.filter((cat) =>
    isCurrentlyVisible({ horaInicio: cat.hora_inicio, horaFin: cat.hora_fin, ahora })
  )

  // IDs de platos visibles por horario
  const platosVisiblesIds = new Set(categoriasPorHorario.flatMap((c) => c.platos.map((p) => p.id)))

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
    const requiereValor = promo.tipo === 'descuento' || promo.tipo === 'precio_especial'
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
    ? categoriasPorHorario.map((cat) => ({ ...cat, platos: cat.platos.filter((p) => p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.descripcion?.toLowerCase().includes(busqueda.toLowerCase())) })).filter((cat) => cat.platos.length > 0)
    : categoriasPorHorario

  function agregarAlPedido(cartKey: string) {
    // Si el plato tiene promo 2x1, sumar de 2 en 2 (lleva 4, paga 2)
    const esPromo2x1 = preciosPromo[cartKey]?.etiqueta === '2x1'
    const incremento = esPromo2x1 ? 2 : 1
    setPedido({ ...pedido, [cartKey]: (pedido[cartKey] || 0) + incremento })
  }

  function quitarDelPedido(cartKey: string) {
    // Si el plato tiene promo 2x1, restar de 2 en 2 para mantener múltiplos
    const esPromo2x1 = preciosPromo[cartKey]?.etiqueta === '2x1'
    const decremento = esPromo2x1 ? 2 : 1
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

  const itemsPedido = Object.entries(pedido).map(([cartKey, cantidad]) => {
    const { platoId, varianteId } = parseCartKey(cartKey)
    const plato = todosLosPlatos.find((p: any) => p.id === platoId)
    if (!plato) return null
    const variante = varianteId
      ? (plato as any).variantes?.find((v: any) => v.id === varianteId)
      : undefined
    // Defensive: si la cartKey referencia una variante que ya no existe, descartar el item
    if (varianteId && !variante) return null
    const promo = preciosPromo[cartKey]
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

  const [sorpresaPlatos, setSorpresaPlatos] = useState<typeof todosLosPlatos>([])
  function sorprendeme() {
    
    const resultado: any[] = []
    
    // Si hay categorías configuradas para sorpréndeme, usar esas
    const catsSorprendeme = config?.sorprendeme_categorias || []
    
    
    if (catsSorprendeme.length === 2) {
      catsSorprendeme.forEach((catId: string) => {
        const cat = categorias.find((c: any) => c.id === catId)
        if (cat) {
          const disponibles = cat.platos.filter((p: any) => p.disponible)
          if (disponibles.length > 0) {
            resultado.push(disponibles[Math.floor(Math.random() * disponibles.length)])
          }
        }
      })
    } else {
      // Fallback: uno de cada categoría diferente
      const catsConPlatos = categorias.filter((c: any) => c.platos.some((p: any) => p.disponible))
      const catsRandom = [...catsConPlatos].sort(() => Math.random() - 0.5)
      for (const cat of catsRandom) {
        if (resultado.length >= 3) break
        const disponibles = cat.platos.filter((p: any) => p.disponible && !resultado.find((r: any) => r.id === p.id))
        if (disponibles.length > 0) {
          resultado.push(disponibles[Math.floor(Math.random() * disponibles.length)])
        }
      }
    }

    if (resultado.length === 0) return
    setSorpresaPlatos(resultado)
    setMostrarSorpresa(true)
  }

  function pedirPorWhatsApp() {
    // Registrar pedido
    const supabasePedido = createClient()
    supabasePedido.from('pedidos_whatsapp').insert({
      restaurante_id: restaurante.id,
      origen: esQR ? 'qr' : 'enlace',
      mesa: qrMesa || null,
      fecha: new Date(new Date().getTime() - 5 * 60 * 60 * 1000).toISOString().split('T')[0],
      total: totalPedido,
      nota: nota || null,
      productos: itemsPedido.map(i => ({
        nombre: i.variante ? `${i.plato.nombre} (${i.variante.nombre})` : i.plato.nombre,
        cantidad: i.cantidad,
        precio: i.variante ? i.variante.precio : i.plato.precio,
      })),
    }).then(({ error }: any) => {

    })
    const lineas = itemsPedido.map(i => {
      const nombre = i.variante ? `${i.plato.nombre} (${i.variante.nombre})` : i.plato.nombre
      const precioUnit = i.promo ? i.promo.precioUnitario : (i.variante ? i.variante.precio : i.plato.precio)
      const etiqueta = i.promo ? ` (${i.promo.etiqueta})` : ''
      return `- ${i.cantidad} ${nombre}${etiqueta} $${(precioUnit * i.cantidad).toLocaleString('es-CO')}`
    })
    let msg = `Hola! Vi tu menú en ${restaurante.nombre} y quiero pedir:\n${lineas.join('\n')}`
    if (nota) msg += `\nNota: ${nota}`
    msg += `\nTotal: $${totalPedido.toLocaleString('es-CO')}`
    window.open(`https://wa.me/57${restaurante.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  function Qty({ cartKey }: { cartKey: string }) {
    const c = pedido[cartKey] || 0
    return c > 0 ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div onClick={(e) => { e.stopPropagation(); quitarDelPedido(cartKey) }} style={{ width: '26px', height: '26px', borderRadius: '50%', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', cursor: 'pointer', color: 'var(--text-secondary)' }}>-</div>
        <span style={{ fontSize: '14px', fontWeight: 500, minWidth: '16px', textAlign: 'center' }}>{c}</span>
        <div onClick={(e) => { e.stopPropagation(); agregarAlPedido(cartKey) }} style={{ width: '26px', height: '26px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', cursor: 'pointer' }}>+</div>
      </div>
    ) : (
      <div onClick={(e) => { e.stopPropagation(); agregarAlPedido(cartKey) }} style={{ width: '26px', height: '26px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', cursor: 'pointer' }}>+</div>
    )
  }

  const [resenasReales, setResenasReales] = useState<any[]>([])
  
  if (cargando) {
    return (
      <div className="theme-claro" style={{ background: 'var(--theme-bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 500, fontFamily: 'var(--font-display)', color: 'var(--theme-text)' }}>Menu<span style={{ color: 'var(--color-accent)' }}>App</span></div>
          <div style={{ fontSize: '13px', color: 'var(--theme-text-muted)', marginTop: '8px' }}>Cargando menú...</div>
        </div>
      </div>
    )
  }

  if (!restaurante) {
    return (
      <div className="theme-claro" style={{ background: 'var(--theme-bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🍽️</div>
          <div style={{ fontSize: '18px', fontWeight: 500, color: 'var(--theme-text)' }}>Restaurante no encontrado</div>
          <div style={{ fontSize: '13px', color: 'var(--theme-text-muted)', marginTop: '8px' }}>Verifica el enlace e intenta de nuevo</div>
        </div>
      </div>
    )
  }
  return (
    <div className={themeClass} style={{ background: 'var(--theme-bg)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '500px', minWidth: '320px', margin: '0 auto', paddingBottom: totalProductos > 0 ? '140px' : '20px' }}>
        {/* Presentación del restaurante (solo enlace web) */}
        {!mostrarMenu && (
          <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Portada: banner sin texto encima (banner solo desde plan Básico) */}
            <div style={{
              height: '200px',
              background: (esBasicoPublico && restaurante.banner_url)
                ? `url(${restaurante.banner_url}) center/cover`
                : `linear-gradient(135deg, ${color} 0%, ${color}CC 50%, ${color}99 100%)`,
              position: 'relative',
            }}>
              {esBasicoPublico && restaurante.banner_url && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.15) 100%)',
                }} />
              )}
            </div>

            {/* Identidad del restaurante: logo + nombre + estado */}
            <div style={{
              padding: '0 20px',
              marginTop: '-36px',
              position: 'relative',
            }}>
              {/* Logo circular sobre fondo claro */}
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'var(--theme-surface)',
                border: '4px solid var(--theme-bg)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 600,
                color: color,
                marginBottom: '14px',
                overflow: 'hidden',
              }}>
                {esBasicoPublico && restaurante.logo_url ? (
                  <img
                    src={restaurante.logo_url}
                    alt={restaurante.nombre}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  restaurante.nombre.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
                )}
              </div>

              {/* Nombre */}
              <div style={{
                fontSize: '22px',
                fontWeight: 'var(--theme-title-weight)' as any,
                fontFamily: 'var(--theme-font-display)',
                letterSpacing: 'var(--theme-title-letter-spacing)',
                textTransform: 'var(--theme-title-transform)' as any,
                lineHeight: 1.2,
                color: 'var(--theme-text)',
                marginBottom: '6px',
              }}>
                {restaurante.nombre}
              </div>

              {/* Meta: estado + tipo + ciudad */}
              {(() => {
                if (horariosRest.length === 0) {
                  return (
                    <div style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      gap: '6px',
                      alignItems: 'center',
                    }}>
                      <span style={{ textTransform: 'capitalize' }}>{restaurante.tipo}</span>
                      <span>·</span>
                      <span>{restaurante.ciudad}</span>
                    </div>
                  )
                }

                const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
                const diaHoy = diasSemana[ahora.getDay()]
                const horarioHoy = horariosRest.find((h: any) => h.dia === diaHoy)

                let estadoBadge = null
                let estadoTexto = null

                if (horarioHoy?.cerrado) {
                  estadoBadge = (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--color-danger)',
                    }}>
                      <span style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: 'var(--color-danger)',
                      }} />
                      Cerrado hoy
                    </span>
                  )
                } else if (horarioHoy) {
                  const apertura = horarioHoy.hora_apertura.slice(0, 5)
                  const cierre = horarioHoy.hora_cierre.slice(0, 5)
                  const abiertoAhora = horaActual >= apertura && horaActual <= cierre

                  if (abiertoAhora) {
                    estadoBadge = (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#2E7D32',
                      }}>
                        <span style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: '#2E7D32',
                        }} />
                        Abierto
                      </span>
                    )
                    estadoTexto = `Cierra a las ${formato12h(horarioHoy.hora_cierre)}`
                  } else if (horaActual < apertura) {
                    estadoBadge = (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'var(--text-tertiary)',
                      }}>
                        <span style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: 'var(--text-tertiary)',
                        }} />
                        Cerrado
                      </span>
                    )
                    estadoTexto = `Abre a las ${formato12h(horarioHoy.hora_apertura)}`
                  } else {
                    estadoBadge = (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'var(--text-tertiary)',
                      }}>
                        <span style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: 'var(--text-tertiary)',
                        }} />
                        Cerrado
                      </span>
                    )
                    estadoTexto = 'Abre mañana'
                  }
                }

                return (
                  <>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      marginBottom: estadoTexto ? '4px' : '0',
                    }}>
                      {estadoBadge}
                      {estadoBadge && <span>·</span>}
                      <span style={{ textTransform: 'capitalize' }}>{restaurante.tipo}</span>
                      <span>·</span>
                      <span>{restaurante.ciudad}</span>
                    </div>
                    {estadoTexto && (
                      <div style={{
                        fontSize: '11px',
                        color: 'var(--text-tertiary)',
                      }}>
                        {estadoTexto}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            {/* Info */}
            <div style={{ padding: '20px', flex: 1 }}>
              {/* Descripción */}
              <div style={{
                fontSize: '14px',
                color: 'var(--theme-text-muted)',
                lineHeight: 1.6,
                marginBottom: '20px',
                overflowWrap: 'break-word',
              }}>
                {restaurante?.descripcion || ''}
              </div>

              {/* Horario */}
              {horariosRest.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '10px',
                    color: 'var(--theme-text)',
                  }}>
                    Horario
                  </div>
                  <div style={{
                    background: 'var(--theme-surface)',
                    border: '1px solid var(--theme-border)',
                    borderRadius: 'var(--theme-radius-card)',
                    boxShadow: 'var(--theme-shadow-card)',
                    overflow: 'hidden',
                  }}>
                    {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((dia: string, i: number) => {
                      const h = horariosRest.find((x: any) => x.dia === dia)
                      if (!h) return null
                      return (
                        <div key={dia} style={{
                          padding: '10px 14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          borderBottom: i < 6 ? '1px solid var(--theme-border)' : 'none',
                          fontSize: '13px',
                          color: 'var(--theme-text)',
                        }}>
                          <span>{dia}</span>
                          <span style={{ color: h.cerrado ? 'var(--color-danger)' : 'var(--theme-text-muted)' }}>
                            {h.cerrado ? 'Cerrado' : `${formato12h(h.hora_apertura)} — ${formato12h(h.hora_cierre)}`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Dirección */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  marginBottom: '10px',
                  color: 'var(--theme-text)',
                }}>
                  Ubicación
                </div>
                {restaurante.direccion && (
                  <div onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(restaurante.direccion + ', ' + restaurante.ciudad)}`, '_blank')}
                    style={{
                      background: 'var(--theme-surface)',
                      border: '1px solid var(--theme-border)',
                      borderRadius: 'var(--theme-radius-card)',
                      boxShadow: 'var(--theme-shadow-card)',
                      padding: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                    <div>
                      <div style={{ fontSize: '13px', color: 'var(--theme-text)' }}>{restaurante.direccion}</div>
                      <div style={{ fontSize: '12px', color: 'var(--theme-text-muted)', marginTop: '2px' }}>{restaurante.ciudad}</div>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--color-info)' }}>Ver mapa →</span>
                  </div>
                )}
              </div>

              {/* WhatsApp info */}
              {config?.whatsapp_activo && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{
                    background: 'var(--theme-surface)',
                    border: '1px solid var(--theme-border)',
                    borderRadius: 'var(--theme-radius-card)',
                    boxShadow: 'var(--theme-shadow-card)',
                    padding: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}>
                    <span style={{ fontSize: '20px' }}>💬</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--theme-text)' }}>Pedidos por WhatsApp</div>
                      <div style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>Arma tu pedido en el menú y envíalo directo</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Botón ver menú */}
              <div onClick={() => setMostrarMenu(true)} style={{
                background: color,
                color: 'white',
                borderRadius: 'var(--theme-radius-button)',
                padding: '16px',
                textAlign: 'center',
                fontSize: '16px',
                fontWeight: 500,
                cursor: 'pointer',
                boxShadow: `0 4px 20px ${color}40`,
              }}>
                Ver menú
              </div>

              {/* Powered by */}
              <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '11px', color: 'var(--theme-text-subtle)' }}>
                Menú creado con <span style={{ fontWeight: 500 }}>MenuApp</span>
              </div>
            </div>
          </div>
        )}
        {mostrarMenu && (<>
        {/* Header: Banner + Logo superpuesto estilo Facebook (banner solo desde plan Básico) */}
        <div style={{ position: 'relative', marginBottom: '56px' }}>
          {/* Banner */}
          <div style={{
            height: '140px',
            background: (esBasicoPublico && restaurante.banner_url)
              ? `url(${restaurante.banner_url}) center/cover`
              : `linear-gradient(135deg, ${color} 0%, ${color}CC 50%, ${color}99 100%)`,
            position: 'relative',
          }}>
            {/* Overlay sutil para legibilidad si hay banner */}
            {esBasicoPublico && restaurante.banner_url && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, transparent 50%, rgba(0,0,0,0.1) 100%)',
              }} />
            )}
          </div>

          {/* Logo redondo sobresaliendo */}
          <div style={{
            position: 'absolute',
            bottom: '-40px',
            left: '16px',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'var(--theme-surface)',
            border: '4px solid var(--theme-bg)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '26px',
            fontWeight: 600,
            color: color,
            overflow: 'hidden',
          }}>
            {esBasicoPublico && restaurante.logo_url ? (
              <img
                src={restaurante.logo_url}
                alt={restaurante.nombre}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              restaurante.nombre.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
            )}
          </div>
        </div>

        {/* Nombre e información del restaurante */}
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{
            fontSize: '20px',
            fontWeight: 'var(--theme-title-weight)' as any,
            fontFamily: 'var(--theme-font-display)',
            letterSpacing: 'var(--theme-title-letter-spacing)',
            textTransform: 'var(--theme-title-transform)' as any,
            lineHeight: 1.2,
            marginBottom: '4px',
            color: 'var(--theme-text)',
          }}>
            {restaurante.nombre}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
            fontSize: '12px',
            color: 'var(--theme-text-muted)',
          }}>
            <span style={{ textTransform: 'capitalize' }}>{restaurante.tipo}</span>
            <span>·</span>
            <span>{restaurante.ciudad}</span>
            {(() => {
              // Indicador de abierto/cerrado ahora mismo
              if (horariosRest.length === 0) return null
              const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
              const diaHoy = diasSemana[ahora.getDay()]
              const horarioHoy = horariosRest.find((h: any) => h.dia === diaHoy)
              if (!horarioHoy) return null
              if (horarioHoy.cerrado) {
                return (
                  <>
                    <span>·</span>
                    <span style={{ color: 'var(--color-danger)', fontWeight: 500 }}>● Cerrado hoy</span>
                  </>
                )
              }
              const abiertoAhora = horaActual >= horarioHoy.hora_apertura.slice(0, 5)
                && horaActual <= horarioHoy.hora_cierre.slice(0, 5)
              return (
                <>
                  <span>·</span>
                  <span style={{
                    color: abiertoAhora ? '#2E7D32' : 'var(--text-tertiary)',
                    fontWeight: 500,
                  }}>
                    ● {abiertoAhora ? 'Abierto ahora' : `Cierra a las ${formato12h(horarioHoy.hora_cierre)}`}
                  </span>
                </>
              )
            })()}
          </div>
        </div>

        {/* Buscador */}
        <div style={{ padding: '12px 16px 8px' }}>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en el menú..."
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid var(--theme-border)',
              borderRadius: 'var(--theme-radius-image)',
              fontSize: '13px',
              fontFamily: 'var(--theme-font-body)',
              background: 'var(--theme-surface)',
              color: 'var(--theme-text)',
              outline: 'none',
            }} />
          {busqueda.trim() && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>{categoriasFiltradas.reduce((s, c) => s + c.platos.length, 0)} resultados</span>
              <span onClick={() => setBusqueda('')} style={{ fontSize: '11px', color: color, cursor: 'pointer' }}>Limpiar</span>
            </div>
          )}
        </div>

        {/* Filtros */}
        <div style={{ padding: '4px 16px 10px', display: 'flex', gap: '6px', overflowX: 'auto' }}>
          <div onClick={() => setCategoriaAbierta(categoriaAbierta ? null : 'open')} style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 500, background: color, color: 'white', cursor: 'pointer', whiteSpace: 'nowrap' }}>Categorías ↓</div>
          {esProPublico && config?.combos_activo && combosVisibles.length > 0 && <div onClick={() => setMostrarCombos(!mostrarCombos)} style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '11px', border: mostrarCombos ? 'none' : '1px solid var(--theme-border)', color: mostrarCombos ? 'white' : 'var(--theme-text-muted)', background: mostrarCombos ? color : 'var(--theme-surface)', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s' }}>Combos</div>}
          {esProPublico && config?.promos_activo && promosVisibles.length > 0 && <div onClick={() => setMostrarPromos(!mostrarPromos)} style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '11px', border: mostrarPromos ? 'none' : '1px solid var(--theme-border)', color: mostrarPromos ? 'white' : 'var(--theme-text-muted)', background: mostrarPromos ? color : 'var(--theme-surface)', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s' }}>Promos</div>}
        </div>

        {/* Dropdown categorías */}
        {categoriaAbierta && (
          <div style={{ padding: '0 16px 10px' }}>
            <div style={{
              background: 'var(--theme-surface)',
              border: '1px solid var(--theme-border)',
              borderRadius: 'var(--theme-radius-image)',
              overflow: 'hidden',
            }}>
              {categorias.map((cat: any, i: number) => (
                <div key={cat.id} onClick={() => { setCategoriaAbierta(null); document.getElementById(cat.id)?.scrollIntoView({ behavior: 'smooth' }) }}
                  style={{
                    padding: '10px 14px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    borderBottom: i < categorias.length - 1 ? '1px solid var(--theme-border)' : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: 'var(--theme-text)',
                  }}>
                  <span>{cat.nombre}</span>
                  <span style={{ fontSize: '11px', color: 'var(--theme-text-subtle)' }}>{cat.platos.filter((p: any) => p.disponible).length}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plato ganador */}
        {esProPublico && config?.plato_ganador_activo && platoGanadorVisible && !busqueda.trim() && (
          <div style={{ padding: '0 16px 10px' }}>
            <div onClick={() => setPlatoDetalle({ id: platoGanador.id, modo: 'ganador' })} style={{
              background: `linear-gradient(135deg, #FFF8E1 0%, #FFF3CD 100%)`,
              border: '1px solid #F2A62330',
              borderRadius: 'var(--theme-radius-card)',
              boxShadow: 'var(--theme-shadow-card)',
              padding: '12px',
              cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span style={{ fontSize: '16px' }}>⭐</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#B8860B', letterSpacing: '0.5px' }}>{platoGanador.titulo?.toUpperCase() || 'RECOMENDADO DEL CHEF'}</span>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: 'var(--theme-radius-image)',
                  flexShrink: 0,
                  background: '#F2A62315',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  {esBasicoPublico && platoGanador.foto_url ? (
                    <img src={platoGanador.foto_url} alt={platoGanador.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '20px', fontWeight: 500, color: '#B8860B' }}>{platoGanador.nombre?.charAt(0)}</span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  {(() => {
                    const varianteLocked = platoGanador.varianteId && platoGanador.variante ? platoGanador.variante : null
                    return (
                      <div style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#1A1A18',
                      }}>
                        {platoGanador.nombre}{varianteLocked ? ` · ${varianteLocked.nombre}` : ''}
                      </div>
                    )
                  })()}
                  {platoGanador.descripcionEspecial && (
                    <div style={{ fontSize: '11px', color: '#6B6A65', marginTop: '2px', fontStyle: 'italic', overflowWrap: 'break-word' }}>"{platoGanador.descripcionEspecial}"</div>
                  )}
                  {(() => {
                    // D4: si el ganador tiene variantes pero sin lock, mostrar "desde $X" y sin Qty inline
                    // F8.7: si hay variante lockeada, mostrar variante.precio + Qty con composite cartKey
                    const ganadorPlato = todosLosPlatos.find((p: any) => p.id === platoGanador.id)
                    const ganadorTieneVariantes = (ganadorPlato as any)?.variantes && (ganadorPlato as any).variantes.length > 0
                    const varianteLocked = platoGanador.varianteId && platoGanador.variante ? platoGanador.variante : null
                    if (varianteLocked) {
                      const cartKeyGanador = makeCartKey(platoGanador.id, varianteLocked.id)
                      return (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 500, color: '#B8860B' }}>${formatoPrecio(varianteLocked.precio)}</span>
                          <Qty cartKey={cartKeyGanador} />
                        </div>
                      )
                    }
                    return (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: '#B8860B' }}>{ganadorTieneVariantes ? 'desde ' : ''}${platoGanador.precio?.toLocaleString('es-CO')}</span>
                        {ganadorTieneVariantes ? null : <Qty cartKey={platoGanador.id} />}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Plato del día */}
        {esProPublico && config?.plato_dia_activo && platoDiaVisible && !busqueda.trim() && (() => {
          // D4: si el plato del día tiene variantes, mostrarlo como un plato normal variantizado
          // ("desde $X", sin precio tachado ni "+" inline). El click de la tarjeta abre el modal.
          const platoDiaPlato = todosLosPlatos.find((p: any) => p.id === platoDia.id)
          const platoDiaTieneVariantes = (platoDiaPlato as any)?.variantes && (platoDiaPlato as any).variantes.length > 0
          // F8.7: variante locked → resolved variante card path
          const varianteLocked = platoDia.varianteId && platoDia.variante ? platoDia.variante : null
          const cartKeyDia = varianteLocked ? makeCartKey(platoDia.id, varianteLocked.id) : platoDia.id
          return (
          <div style={{ padding: '0 16px 10px' }}>
            <div onClick={() => setPlatoDetalle({ id: platoDia.id, modo: 'platoDia' })} style={{
              background: `${color}10`,
              border: `1px solid ${color}30`,
              borderRadius: 'var(--theme-radius-card)',
              boxShadow: 'var(--theme-shadow-card)',
              padding: '12px',
              cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 500, color: color }}>⏰ PLATO DEL DÍA</span>
                {platoDia.horaInicio && platoDia.horaFin && (
                  <span style={{ fontSize: '10px', color: 'var(--theme-text-subtle)' }}>
                    {formato12h(platoDia.horaInicio)} — {formato12h(platoDia.horaFin)}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--theme-text)',
                  }}>
                    {platoDia.nombre}{varianteLocked ? ` · ${varianteLocked.nombre}` : ''}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--theme-text-muted)',
                    marginTop: '2px',
                    overflowWrap: 'break-word',
                  }}>
                    {platoDia.descripcion}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    {varianteLocked ? (
                      <>
                        <span style={{
                          fontSize: '12px',
                          color: 'var(--theme-text-subtle)',
                          textDecoration: 'line-through',
                        }}>
                          ${formatoPrecio(varianteLocked.precio)}
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: color }}>${formatoPrecio(platoDia.precioEspecial)}</span>
                      </>
                    ) : platoDiaTieneVariantes ? (
                      <span style={{ fontSize: '14px', fontWeight: 500, color: color }}>desde ${formatoPrecio(platoDia.precio)}</span>
                    ) : (
                      <>
                        <span style={{
                          fontSize: '12px',
                          color: 'var(--theme-text-subtle)',
                          textDecoration: 'line-through',
                        }}>
                          ${formatoPrecio(platoDia.precio)}
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: color }}>${formatoPrecio(platoDia.precioEspecial)}</span>
                      </>
                    )}
                  </div>
                </div>
                {(!varianteLocked && platoDiaTieneVariantes) ? null : (
                <div onClick={(e) => {
                  e.stopPropagation()
                  // Agregar plato del día CON precio especial registrado
                  setPedido({ ...pedido, [cartKeyDia]: (pedido[cartKeyDia] || 0) + 1 })
                  setPreciosPromo({
                    ...preciosPromo,
                    [cartKeyDia]: { precioUnitario: platoDia.precioEspecial, etiqueta: 'Plato del día' }
                  })
                }} style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}>+</div>
                )}
              </div>
            </div>
          </div>
          )
        })()}

        {/* Sorpréndeme botón */}
        {esBasicoPublico && config?.sorprendeme_activo && sorprendemeVisible && !busqueda.trim() && (
          <div style={{ padding: '0 16px 10px' }}>
            <div onClick={sorprendeme} style={{
              border: mostrarSorpresa ? `1px solid ${color}` : '1px dashed var(--theme-border-strong)',
              borderRadius: 'var(--theme-radius-card)',
              padding: '12px',
              textAlign: 'center',
              cursor: 'pointer',
              background: mostrarSorpresa ? `${color}08` : 'transparent',
            }}>
              <span style={{ fontSize: '13px', color: mostrarSorpresa ? color : 'var(--theme-text-muted)' }}>
                🎲 {mostrarSorpresa ? 'Generar otra combinación' : 'Sorpréndeme — ¿No sabes qué pedir?'}
              </span>
            </div>
          </div>
        )}

        {/* Sorpréndeme resultado */}
        {esBasicoPublico && sorprendemeVisible && mostrarSorpresa && (
          <div style={{ padding: '0 16px 14px' }}>
            <div style={{
              background: `${color}08`,
              border: `1px solid ${color}20`,
              borderRadius: 'var(--theme-radius-card)',
              padding: '12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: color }}>🎲 Tu combinación</span>
                <span onClick={() => setMostrarSorpresa(false)} style={{ fontSize: '11px', color: 'var(--theme-text-subtle)', cursor: 'pointer' }}>✕ Cerrar</span>
              </div>
              {sorpresaPlatos.map((plato: any) => (
                <div key={plato.id} onClick={() => setPlatoDetalle({ id: plato.id, modo: 'normal' })} style={{
                  background: 'var(--theme-surface)',
                  borderRadius: 'var(--theme-radius-image)',
                  padding: '10px',
                  display: 'flex',
                  gap: '10px',
                  marginBottom: '6px',
                  border: '1px solid var(--theme-border)',
                  cursor: 'pointer',
                }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: 'var(--theme-radius-image)',
                    flexShrink: 0,
                    background: `${color}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    fontWeight: 500,
                    color: color,
                    overflow: 'hidden',
                  }}>
                    {plato.foto_url ? (
                      <img src={plato.foto_url} alt={plato.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : plato.nombre.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--theme-text)',
                    }}>
                      {plato.nombre}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: 'var(--theme-text-muted)',
                      overflowWrap: 'break-word',
                    }}>
                      {plato.descripcion}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      <span style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color: 'var(--theme-text)',
                      }}>
                        {plato.variantes && plato.variantes.length > 0 ? 'desde ' : ''}${plato.precio.toLocaleString('es-CO')}
                      </span>
                      {plato.variantes && plato.variantes.length > 0
                        ? null // Card click abre el modal; sin Qty inline para platos con variantes
                        : <Qty cartKey={plato.id} />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Combos */}
        {esProPublico && mostrarCombos && combosVisibles.length > 0 && !busqueda.trim() && (
          <div id="combos-section" style={{ padding: '0 16px', marginBottom: '14px' }}>
            <div style={{
              fontSize: '14px',
              fontWeight: 'var(--theme-title-weight)' as any,
              fontFamily: 'var(--theme-font-display)',
              letterSpacing: 'var(--theme-title-letter-spacing)',
              textTransform: 'var(--theme-title-transform)' as any,
              color: 'var(--theme-text)',
              marginBottom: '8px',
              paddingTop: '4px',
            }}>
              🍱 Combos
            </div>
            {combosVisibles.map((combo: any) => (
              <div key={combo.id} onClick={() => setComboDetalle(combo)} style={{
                background: 'var(--theme-surface)',
                border: `1px solid ${color}30`,
                borderRadius: 'var(--theme-radius-card)',
                boxShadow: 'var(--theme-shadow-card)',
                padding: '12px',
                marginBottom: '8px',
                cursor: 'pointer',
              }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--theme-text)',
                }}>
                  {combo.nombre}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: 'var(--theme-text-subtle)',
                  marginTop: '4px',
                }}>
                  {(combo.comboPlatosEnriquecidos ?? []).length > 0
                    ? combo.comboPlatosEnriquecidos
                        .map((cp: any) => cp.varianteNombre ? `${cp.nombre} (${cp.varianteNombre})` : cp.nombre)
                        .join(' + ')
                    : combo.platos.join(' + ')}
                </div>
                {((combo.dias && combo.dias.length > 0) || (combo.horario_inicio && combo.horario_fin)) && (
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--theme-text-subtle)',
                    marginTop: '4px',
                  }}>
                    {combo.dias && combo.dias.length > 0 && formatDiasFull(combo.dias)}
                    {combo.dias && combo.dias.length > 0 && combo.horario_inicio && combo.horario_fin && ' · '}
                    {combo.horario_inicio && combo.horario_fin && `${formato12h(combo.horario_inicio)}–${formato12h(combo.horario_fin)}`}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '15px', fontWeight: 500, color: color }}>${combo.precio.toLocaleString('es-CO')}</span>
                    <span style={{
                      fontSize: '12px',
                      color: 'var(--theme-text-subtle)',
                      textDecoration: 'line-through',
                    }}>
                      ${combo.precioIndividual.toLocaleString('es-CO')}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--color-green)', fontWeight: 500 }}>-${(combo.precioIndividual - combo.precio).toLocaleString('es-CO')}</span>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Qty cartKey={combo.id} />
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: color, marginTop: '6px', fontWeight: 500 }}>Ver detalles →</div>
              </div>
            ))}
          </div>
        )}
        {/* Promos */}
        {mostrarPromos && promosVisibles.length > 0 && !busqueda.trim() && (
          <div style={{ padding: '0 16px', marginBottom: '14px' }}>
            <div style={{
              fontSize: '14px',
              fontWeight: 'var(--theme-title-weight)' as any,
              fontFamily: 'var(--theme-font-display)',
              letterSpacing: 'var(--theme-title-letter-spacing)',
              textTransform: 'var(--theme-title-transform)' as any,
              color: 'var(--theme-text)',
              marginBottom: '8px',
              paddingTop: '4px',
            }}>
              🏷️ Promociones
            </div>
            {promosVisibles.map((promo: any) => {
              const diasTexto = promo.dias.map((d: string) => {
                const nombres: Record<string, string> = { lun: 'Lunes', mar: 'Martes', mie: 'Miércoles', jue: 'Jueves', vie: 'Viernes', sab: 'Sábado', dom: 'Domingo' }
                return nombres[d] || d
              }).join(', ')
              return (
                <div key={promo.id} onClick={() => { setPromoDetalle(promo); setPromoSeleccion([]) }} style={{
                  background: 'var(--theme-surface)',
                  border: `1px solid ${color}30`,
                  borderRadius: 'var(--theme-radius-card)',
                  boxShadow: 'var(--theme-shadow-card)',
                  padding: '12px',
                  marginBottom: '8px',
                  cursor: 'pointer',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: 'var(--theme-text)',
                    }}>
                      {promo.nombre}
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'white', background: color, padding: '3px 10px', borderRadius: '12px' }}>
                      {promo.tipo === 'dos_por_uno' ? '2x1' : promo.tipo === 'descuento' ? `${promo.valor ?? 0}% OFF` : `$${formatoPrecio(parseInt(promo.valor || '0'))}`}
                    </span>
                  </div>
                  {promo.platos && promo.platos.length > 0 && (
                    <div style={{
                      fontSize: '12px',
                      color: 'var(--theme-text-muted)',
                      marginTop: '6px',
                    }}>
                      Aplica en: {promo.platos.join(', ')}
                    </div>
                  )}
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--theme-text-subtle)',
                    marginTop: '4px',
                  }}>
                    {diasTexto}
                  </div>
                  <div style={{ fontSize: '11px', color: color, marginTop: '6px', fontWeight: 500 }}>Toca para ver platos →</div>
                </div>
              )
            })}
          </div>
        )}
        {/* Modal detalle combo */}
        {comboDetalle && (() => {
          // F8.5a — preferir los platos enriquecidos (con variante + precio efectivo).
          const enriquecidos = comboDetalle.comboPlatosEnriquecidos
          const tieneEnriquecidos = Array.isArray(enriquecidos) && enriquecidos.length > 0

          // Fallback defensivo (Task 7): si por algún motivo no hay datos
          // enriquecidos, reconstruir desde categorías y usar el precio
          // individual almacenado — preserva el comportamiento previo.
          const platosDelCombo = tieneEnriquecidos
            ? enriquecidos
            : categorias
                .flatMap((c: any) => c.platos)
                .filter((p: any) => comboDetalle.platosIds?.includes(p.id))

          // Strategy B: recomputar precio individual desde los platos del combo.
          const precioIndividual = tieneEnriquecidos
            ? enriquecidos.reduce((sum: number, p: any) => sum + (p.precioEfectivo || 0), 0)
            : comboDetalle.precioIndividual

          const ahorro = precioIndividual - comboDetalle.precio
          const porcentajeAhorro = precioIndividual > 0
            ? Math.round((ahorro / precioIndividual) * 100)
            : 0

          return (
            <Modal
              isOpen={!!comboDetalle}
              onClose={() => setComboDetalle(null)}
              maxWidth={500}
              noPadding
              showClose={false}
              themeClass={themeClass}
            >
              {/* Header con nombre y badge de ahorro */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--theme-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                  <span style={{
                    fontSize: '16px',
                    fontWeight: 'var(--theme-title-weight)' as any,
                    fontFamily: 'var(--theme-font-display)',
                    letterSpacing: 'var(--theme-title-letter-spacing)',
                    textTransform: 'var(--theme-title-transform)' as any,
                    color: 'var(--theme-text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>🍱 {comboDetalle.nombre}</span>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    color: 'white',
                    background: 'var(--color-green)',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    flexShrink: 0,
                  }}>
                    -{porcentajeAhorro}%
                  </span>
                </div>
                <span onClick={() => setComboDetalle(null)} style={{
                  fontSize: '18px',
                  color: 'var(--theme-text-subtle)',
                  cursor: 'pointer',
                  marginLeft: '12px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  lineHeight: 1,
                }}>✕</span>
              </div>

              <div style={{ padding: '16px 20px' }}>
                {/* Descripción del combo */}
                {comboDetalle.descripcion && (
                  <div style={{
                    fontSize: '13px',
                    color: 'var(--theme-text-muted)',
                    marginBottom: '16px',
                    lineHeight: 1.5,
                    overflowWrap: 'break-word',
                  }}>
                    {comboDetalle.descripcion}
                  </div>
                )}

                {/* Título de la sección */}
                <div style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--theme-text-muted)',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  Incluye {platosDelCombo.length} platos
                </div>

                {/* Lista de platos del combo */}
                {platosDelCombo.map((plato: any) => (
                  <div key={plato.id ?? `${plato.plato_id}-${plato.variante_id ?? 'base'}`} style={{
                    padding: '12px',
                    borderRadius: 'var(--theme-radius-card)',
                    marginBottom: '8px',
                    border: '1px solid var(--theme-border)',
                    background: 'var(--theme-bg)',
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center',
                  }}>
                    <div style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: 'var(--theme-radius-image)',
                      background: `${color}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}>
                      {esBasicoPublico && plato.foto_url ? (
                        <img src={plato.foto_url} alt={plato.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: '20px', fontWeight: 500, color: color }}>
                          {plato.nombre.charAt(0)}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color: 'var(--theme-text)',
                      }}>
                        {plato.nombre}{plato.varianteNombre ? ` (${plato.varianteNombre})` : ''}
                      </div>
                      {plato.descripcion && (
                        <div style={{
                          fontSize: '11px',
                          color: 'var(--theme-text-muted)',
                          marginTop: '2px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical' as any,
                          overflowWrap: 'break-word',
                        }}>
                          {plato.descripcion}
                        </div>
                      )}
                      <div style={{
                        fontSize: '11px',
                        color: 'var(--theme-text-subtle)',
                        marginTop: '4px',
                      }}>
                        Precio individual: ${(plato.precioEfectivo ?? plato.precio).toLocaleString('es-CO')}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Resumen de precios */}
                <div style={{
                  background: 'var(--theme-surface-muted)',
                  borderRadius: 'var(--theme-radius-card)',
                  padding: '14px',
                  marginTop: '16px',
                  marginBottom: '16px',
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '12px',
                    color: 'var(--theme-text-muted)',
                    marginBottom: '6px',
                  }}>
                    <span>Comprando por separado</span>
                    <span style={{ textDecoration: 'line-through' }}>${precioIndividual.toLocaleString('es-CO')}</span>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '15px',
                    fontWeight: 500,
                    marginBottom: '6px',
                    color: 'var(--theme-text)',
                  }}>
                    <span>Precio del combo</span>
                    <span style={{ color: color }}>${comboDetalle.precio.toLocaleString('es-CO')}</span>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '12px',
                    color: 'var(--color-green)',
                    fontWeight: 500,
                    paddingTop: '6px',
                    borderTop: '1px solid var(--theme-border)',
                  }}>
                    <span>Tu ahorro</span>
                    <span>${ahorro.toLocaleString('es-CO')}</span>
                  </div>
                </div>

                {/* Botón agregar al pedido */}
                <div onClick={() => {
                  agregarAlPedido(comboDetalle.id)
                  setComboDetalle(null)
                }} style={{
                  background: color,
                  color: 'white',
                  borderRadius: 'var(--theme-radius-button)',
                  padding: '16px',
                  textAlign: 'center',
                  fontSize: '15px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}>
                  Agregar combo al pedido · ${comboDetalle.precio.toLocaleString('es-CO')}
                </div>
              </div>
            </Modal>
          )
        })()}
        {/* Modal detalle promo */}
        {promoDetalle && (() => {
          const platosPromo = categorias.flatMap((c: any) => c.platos).filter((p: any) =>
            promoDetalle.platosIds.includes(p.id)
          )

          function agregarPromoAlPedido() {
            if (promoSeleccion.length === 0) return
            const nuevoPedido = { ...pedido }
            const nuevosPrecios = { ...preciosPromo }

            promoSeleccion.forEach(key => {
              const { platoId, varianteId } = parseCartKey(key)
              const plato = platosPromo.find((p: any) => p.id === platoId)
              if (!plato) return
              // Defensive: la variante pudo eliminarse entre la selección y el submit.
              if (varianteId) {
                const variante = plato.variantes?.find((v: any) => v.id === varianteId)
                if (!variante) return
              }
              const base = precioEfectivo(plato, varianteId)

              if (promoDetalle.tipo === 'dos_por_uno') {
                // 2x1: agrega 2 unidades, cobra solo 1
                nuevoPedido[key] = (nuevoPedido[key] || 0) + 2
                nuevosPrecios[key] = { precioUnitario: Math.round(base / 2), etiqueta: '2x1' }
              } else if (promoDetalle.tipo === 'descuento') {
                const precioDesc = Math.round(base * (1 - (promoDetalle.valor || 0) / 100))
                nuevoPedido[key] = (nuevoPedido[key] || 0) + 1
                nuevosPrecios[key] = { precioUnitario: precioDesc, etiqueta: `${promoDetalle.valor}% OFF` }
              } else if (promoDetalle.tipo === 'precio_especial') {
                // Interim F8.4b D4: valor fijo sin importar la variante. F8.6 lo bloqueará en admin.
                nuevoPedido[key] = (nuevoPedido[key] || 0) + 1
                nuevosPrecios[key] = { precioUnitario: promoDetalle.valor, etiqueta: 'Precio especial' }
              }
            })

            setPedido(nuevoPedido)
            setPreciosPromo(nuevosPrecios)
            setPromoDetalle(null)
          }

          return (
            <Modal
              isOpen={!!promoDetalle}
              onClose={() => setPromoDetalle(null)}
              maxWidth={500}
              noPadding
              showClose={false}
              themeClass={themeClass}
            >
              {/* Header personalizado con título + badge de descuento */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--theme-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                  <span style={{
                    fontSize: '16px',
                    fontWeight: 'var(--theme-title-weight)' as any,
                    fontFamily: 'var(--theme-font-display)',
                    letterSpacing: 'var(--theme-title-letter-spacing)',
                    textTransform: 'var(--theme-title-transform)' as any,
                    color: 'var(--theme-text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>{promoDetalle.nombre}</span>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'white',
                    background: color,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    flexShrink: 0,
                  }}>
                    {promoDetalle.tipo === 'dos_por_uno' ? '2x1' : promoDetalle.tipo === 'descuento' ? `${promoDetalle.valor}% OFF` : `$${parseInt(promoDetalle.valor || '0').toLocaleString('es-CO')}`}
                  </span>
                </div>
                <span onClick={() => setPromoDetalle(null)} style={{
                  fontSize: '18px',
                  color: 'var(--theme-text-subtle)',
                  cursor: 'pointer',
                  marginLeft: '12px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  lineHeight: 1,
                }}>✕</span>
              </div>

              <div style={{ padding: '16px 20px' }}>
                {promoDetalle.descripcion && (
                  <div style={{
                    fontSize: '13px',
                    color: 'var(--theme-text-muted)',
                    marginBottom: '12px',
                    lineHeight: 1.5,
                    overflowWrap: 'break-word',
                  }}>
                    {promoDetalle.descripcion}
                  </div>
                )}
                <div style={{ fontSize: '13px', color: 'var(--theme-text-muted)', marginBottom: '12px' }}>
                  {promoDetalle.tipo === 'dos_por_uno' && 'Selecciona un plato y lleva 2 por el precio de 1'}
                  {promoDetalle.tipo === 'descuento' && `Selecciona los platos con ${promoDetalle.valor}% de descuento`}
                  {promoDetalle.tipo === 'precio_especial' && `Platos a precio especial de $${parseInt(promoDetalle.valor || '0').toLocaleString('es-CO')}`}
                </div>

                {platosPromo.map((plato: any) => {
                  const seleccionado = algunaKeyEsDePlato(promoSeleccion, plato.id)
                  const tieneVariantes = plato.variantes && plato.variantes.length > 0
                  const keyDePlato = obtenerKeyDePlato(promoSeleccion, plato.id)
                  const varianteIdSeleccionada = keyDePlato
                    ? parseCartKey(keyDePlato).varianteId
                    : undefined
                  const precioEfectivoPlato = precioEfectivo(plato, varianteIdSeleccionada)
                  const maxSeleccion = promoDetalle.tipo === 'dos_por_uno' ? 1 : platosPromo.length
                  const puedeSeleccionar = seleccionado || promoSeleccion.length < maxSeleccion

                  return (
                    <div key={plato.id} onClick={() => {
                      if (keyDePlato) {
                        setPromoSeleccion(promoSeleccion.filter(k => k !== keyDePlato))
                      } else if (puedeSeleccionar) {
                        const newKey = tieneVariantes
                          ? makeCartKey(plato.id, plato.variantes[0].id)
                          : plato.id
                        if (promoDetalle.tipo === 'dos_por_uno') {
                          setPromoSeleccion([newKey])
                        } else {
                          setPromoSeleccion([...promoSeleccion, newKey])
                        }
                      }
                    }} style={{
                      padding: '12px',
                      borderRadius: 'var(--theme-radius-card)',
                      marginBottom: '8px',
                      cursor: puedeSeleccionar || seleccionado ? 'pointer' : 'default',
                      border: seleccionado ? `2px solid ${color}` : '1px solid var(--theme-border)',
                      background: seleccionado ? `${color}08` : 'var(--theme-bg)',
                      opacity: !puedeSeleccionar && !seleccionado ? 0.4 : 1,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <div style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: 'var(--theme-radius-image)',
                          background: `${color}15`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          flexShrink: 0,
                        }}>
                          {plato.foto_url ? (
                            <img src={plato.foto_url} alt={plato.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : <span style={{ fontSize: '16px', color: color }}>{plato.nombre.charAt(0)}</span>}
                        </div>
                        <div>
                          <div style={{
                            fontSize: '13px',
                            fontWeight: 500,
                            color: 'var(--theme-text)',
                          }}>
                            {plato.nombre}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                            {promoDetalle.tipo === 'dos_por_uno' ? (
                              <>
                                <span style={{ fontSize: '12px', color: 'var(--theme-text-subtle)', textDecoration: 'line-through' }}>${(precioEfectivoPlato * 2).toLocaleString('es-CO')}</span>
                                <span style={{ fontSize: '13px', fontWeight: 500, color: color }}>${precioEfectivoPlato.toLocaleString('es-CO')}</span>
                                <span style={{ fontSize: '10px', color: 'var(--color-green)', fontWeight: 500 }}>× 2 unidades</span>
                              </>
                            ) : promoDetalle.tipo === 'descuento' ? (
                              <>
                                <span style={{ fontSize: '12px', color: 'var(--theme-text-subtle)', textDecoration: 'line-through' }}>${precioEfectivoPlato.toLocaleString('es-CO')}</span>
                                <span style={{ fontSize: '13px', fontWeight: 500, color: color }}>${Math.round(precioEfectivoPlato * (1 - (promoDetalle.valor || 0) / 100)).toLocaleString('es-CO')}</span>
                              </>
                            ) : (
                              <>
                                <span style={{ fontSize: '12px', color: 'var(--theme-text-subtle)', textDecoration: 'line-through' }}>${precioEfectivoPlato.toLocaleString('es-CO')}</span>
                                <span style={{ fontSize: '13px', fontWeight: 500, color: color }}>${parseInt(promoDetalle.valor || '0').toLocaleString('es-CO')}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        border: seleccionado ? 'none' : '2px solid var(--theme-border)',
                        background: seleccionado ? color : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        {seleccionado && <span style={{ color: 'white', fontSize: '14px' }}>✓</span>}
                      </div>
                      </div>
                      {seleccionado && tieneVariantes && (
                        <div style={{
                          marginTop: '10px',
                          paddingTop: '10px',
                          borderTop: '1px solid var(--theme-border)',
                        }}>
                          <div style={{ fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'var(--theme-text-muted)' }}>
                            Elige una opción
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {plato.variantes.map((v: any) => (
                              <label
                                key={v.id}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '8px 10px',
                                  border: `1px solid ${varianteIdSeleccionada === v.id ? color : 'var(--theme-border)'}`,
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  background: varianteIdSeleccionada === v.id ? 'var(--theme-surface-muted)' : 'transparent',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <input
                                    type="radio"
                                    name={`variante-promo-${plato.id}`}
                                    checked={varianteIdSeleccionada === v.id}
                                    onChange={() => {
                                      const oldKey = obtenerKeyDePlato(promoSeleccion, plato.id)
                                      const newKey = makeCartKey(plato.id, v.id)
                                      setPromoSeleccion(promoSeleccion.map(k => k === oldKey ? newKey : k))
                                    }}
                                    style={{ accentColor: color }}
                                  />
                                  <span style={{ fontSize: '13px', color: 'var(--theme-text)' }}>{v.nombre}</span>
                                </div>
                                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--theme-text)' }}>
                                  ${v.precio.toLocaleString('es-CO')}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                {promoSeleccion.length > 0 && (
                  <div onClick={agregarPromoAlPedido} style={{
                    background: color,
                    color: 'white',
                    borderRadius: 'var(--theme-radius-button)',
                    padding: '16px',
                    textAlign: 'center',
                    fontSize: '15px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    marginTop: '12px',
                  }}>
                    Agregar al pedido
                  </div>
                )}
              </div>
            </Modal>
          )
        })()}
        {/* Categorías y platos */}
        {categoriasFiltradas.map((cat: any) => (
          <div key={cat.id} id={cat.id} style={{ padding: '0 16px', marginBottom: '14px' }}>
            <div style={{
              fontSize: '14px',
              fontWeight: 'var(--theme-title-weight)' as any,
              fontFamily: 'var(--theme-font-display)',
              letterSpacing: 'var(--theme-title-letter-spacing)',
              textTransform: 'var(--theme-title-transform)' as any,
              color: 'var(--theme-text)',
              marginBottom: '8px',
              paddingTop: '4px',
            }}>
              {cat.nombre}
            </div>
            {cat.platos.map((plato: any) => (
              <div key={plato.id} style={{
                background: 'var(--theme-surface)',
                border: '1px solid var(--theme-border)',
                borderRadius: 'var(--theme-radius-card)',
                boxShadow: 'var(--theme-shadow-card)',
                padding: '10px',
                display: 'flex',
                gap: '10px',
                marginBottom: '8px',
                opacity: plato.disponible ? 1 : 0.4,
              }}>
                <div onClick={() => plato.disponible && setPlatoDetalle({ id: plato.id, modo: 'normal' })} style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: 'var(--theme-radius-image)',
                  flexShrink: 0,
                  cursor: plato.disponible ? 'pointer' : 'default',
                  background: `${color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                  fontWeight: 500,
                  color: color,
                  overflow: 'hidden',
                }}>
                  {esBasicoPublico && plato.foto_url ? (
                    <img src={plato.foto_url} alt={plato.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : plato.nombre.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div onClick={() => plato.disponible && setPlatoDetalle({ id: plato.id, modo: 'normal' })} style={{ cursor: plato.disponible ? 'pointer' : 'default' }}>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--theme-text)',
                    }}>
                      {plato.nombre}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: 'var(--theme-text-muted)',
                      marginTop: '2px',
                      overflowWrap: 'break-word',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 1,
                      WebkitBoxOrient: 'vertical' as any,
                    }}>
                      {plato.descripcion}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color: 'var(--theme-text)',
                      }}>
                        {plato.variantes && plato.variantes.length > 0 ? 'desde ' : ''}${plato.precio.toLocaleString('es-CO')}
                      </span>
                      {config?.calificaciones_activo && plato.resenas > 0 && (
                        <span style={{ fontSize: '10px', color: '#F2A623' }}>
                          ★ {plato.estrellas} <span style={{ color: 'var(--theme-text-subtle)' }}>({plato.resenas})</span>
                        </span>
                      )}
                    </div>
                    {plato.disponible
                      ? (plato.variantes && plato.variantes.length > 0
                          ? null // Card click abre el modal; sin Qty inline para platos con variantes
                          : <Qty cartKey={plato.id} />)
                      : <span style={{ fontSize: '10px', color: 'var(--color-danger)', fontWeight: 500 }}>Agotado</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Aviso platos no disponibles en pedido */}
        {totalProductos > 0 && itemsPedido.some(i => !platosVisiblesIds.has(i.plato.id) && !combosVisibles.some((c: any) => c.id === i.plato.id)) && (
          <div style={{ padding: '0 16px 10px' }}>
            <div style={{
              background: 'var(--color-warning-light)',
              border: '1px solid var(--color-warning)',
              borderRadius: 'var(--theme-radius-card)',
              padding: '12px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-warning)', marginBottom: '4px' }}>Algunos platos ya no están disponibles</div>
              <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)', marginBottom: '8px' }}>Estos platos pertenecen a categorías fuera de horario y se eliminarán del pedido.</div>
              <div onClick={() => {
                const nuevoPedido = { ...pedido }
                const nuevosPrecios = { ...preciosPromo }
                Object.keys(nuevoPedido).forEach(cartKey => {
                  const { platoId } = parseCartKey(cartKey)
                  if (!platosVisiblesIds.has(platoId) && !combosVisibles.some((c: any) => c.id === platoId)) {
                    delete nuevoPedido[cartKey]
                    delete nuevosPrecios[cartKey]
                  }
                })
                setPedido(nuevoPedido)
                setPreciosPromo(nuevosPrecios)
              }} style={{ fontSize: '12px', color: 'var(--color-warning)', fontWeight: 500, cursor: 'pointer' }}>
                Limpiar platos no disponibles →
              </div>
            </div>
          </div>
        )}

        {/* Bandeja flotante */}
        {totalProductos > 0 && !mostrarPedido && !platoDetalle && (
          <div onClick={() => setMostrarPedido(true)} style={{
            position: 'fixed',
            bottom: '16px',
            left: '16px',
            right: '16px',
            maxWidth: '468px',
            margin: '0 auto',
            background: 'var(--theme-text)',
            borderRadius: 'var(--theme-radius-button)',
            padding: '14px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 40,
            cursor: 'pointer',
            boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
          }}>
            <div style={{ color: 'var(--theme-bg)' }}>
              <div style={{ fontSize: '14px', fontWeight: 500 }}>{totalProductos} producto{totalProductos > 1 ? 's' : ''}</div>
              <div style={{
                fontSize: '10px',
                opacity: 0.6,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '200px',
              }}>
                {(() => {
                  const items = itemsPedido.map(i => `${i.cantidad} ${i.plato.nombre}${i.variante ? ` · ${i.variante.nombre}` : ''}`)
                  if (items.length <= 2) return items.join(' + ')
                  const visibles = items.slice(0, 2).join(' + ')
                  const restantes = items.length - 2
                  return `${visibles} · y ${restantes} más`
                })()}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: 'var(--theme-bg)', fontWeight: 500 }}>${totalPedido.toLocaleString('es-CO')}</span>
              <div style={{
                background: 'var(--theme-bg)',
                color: 'var(--theme-text)',
                padding: '6px 12px',
                borderRadius: 'var(--theme-radius-image)',
                fontSize: '12px',
                fontWeight: 600,
              }}>
                Ver pedido
              </div>
            </div>
          </div>
        )}

        {/* Modal ver pedido */}
        <Modal
          isOpen={mostrarPedido}
          onClose={() => setMostrarPedido(false)}
          title="Tu pedido"
          maxWidth={500}
          noPadding
          themeClass={themeClass}
        >
          {esQR && (
            <div style={{ padding: '12px 20px', background: 'var(--color-info-light)', fontSize: '12px', color: 'var(--color-info)' }}>
              Mesa {qrMesa?.replace('mesa', '')} · Muéstrale este resumen al mesero
            </div>
          )}
          <div style={{ padding: '16px 20px' }}>
            {itemsPedido.map((item: any) => (
              <div key={item.cartKey} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: '1px solid var(--theme-border)',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--theme-text)',
                    fontFamily: 'var(--theme-font-body)',
                  }}>
                    {item.plato.nombre}{item.variante ? ` · ${item.variante.nombre}` : ''}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--theme-text-muted)',
                    fontFamily: 'var(--theme-font-body)',
                  }}>
                    {item.promo ? (
                      <><span style={{ textDecoration: 'line-through', marginRight: '4px' }}>${formatoPrecio(item.variante ? item.variante.precio : item.plato.precio)}</span><span style={{ color: color, fontWeight: 500 }}>${formatoPrecio(item.promo.precioUnitario)} c/u</span> <span style={{ fontSize: '10px', color: 'var(--color-green)' }}>({item.promo.etiqueta})</span></>
                    ) : `$${formatoPrecio(item.variante ? item.variante.precio : item.plato.precio)} c/u`}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div onClick={() => quitarDelPedido(item.cartKey)} style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    border: '1px solid var(--theme-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    cursor: 'pointer',
                    color: 'var(--theme-text-muted)',
                  }}>-</div>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    minWidth: '16px',
                    textAlign: 'center',
                    color: 'var(--theme-text)',
                    fontFamily: 'var(--theme-font-body)',
                  }}>
                    {item.cantidad}
                  </span>
                  <div onClick={() => agregarAlPedido(item.cartKey)} style={{ width: '24px', height: '24px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', cursor: 'pointer' }}>+</div>
                </div>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  minWidth: '70px',
                  textAlign: 'right',
                  color: 'var(--theme-text)',
                  fontFamily: 'var(--theme-font-body)',
                }}>
                  ${((item.promo ? item.promo.precioUnitario : (item.variante ? item.variante.precio : item.plato.precio)) * item.cantidad).toLocaleString('es-CO')}
                </div>
              </div>
            ))}
            <div style={{ marginTop: '14px' }}>
              <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder={esQR ? 'Nota para el mesero (opcional)' : 'Nota para el restaurante (opcional)'}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--theme-border)',
                  borderRadius: 'var(--theme-radius-image)',
                  fontSize: '13px',
                  fontFamily: 'var(--theme-font-body)',
                  background: 'var(--theme-surface)',
                  color: 'var(--theme-text)',
                  outline: 'none',
                }} />
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '16px',
              paddingTop: '14px',
              borderTop: '1px solid var(--theme-border)',
            }}>
              <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--theme-text)', fontFamily: 'var(--theme-font-body)' }}>Total</span>
              <span style={{ fontSize: '20px', fontWeight: 500, color: 'var(--theme-text)', fontFamily: 'var(--theme-font-body)' }}>${totalPedido.toLocaleString('es-CO')}</span>
            </div>
            {esQR ? (
              <div style={{ marginTop: '16px', textAlign: 'center' }}>
                <div style={{
                  background: 'var(--theme-text)',
                  color: 'var(--theme-bg)',
                  borderRadius: 'var(--theme-radius-button)',
                  padding: '16px',
                  fontSize: '15px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}>
                  Mostrar al mesero
                </div>
                <div style={{ fontSize: '11px', color: 'var(--theme-text-subtle)', marginTop: '8px' }}>El mesero tomará tu pedido desde esta pantalla</div>
              </div>
            ) : config?.whatsapp_activo ? (
              <div style={{ marginTop: '16px', textAlign: 'center' }}>
                <div onClick={pedirPorWhatsApp} style={{
                  background: '#25D366',
                  color: 'white',
                  borderRadius: 'var(--theme-radius-button)',
                  padding: '16px',
                  fontSize: '15px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}>
                  Pedir por WhatsApp
                </div>
                <div style={{ fontSize: '11px', color: 'var(--theme-text-subtle)', marginTop: '8px' }}>Se abrirá WhatsApp con tu pedido listo</div>
              </div>
            ) : (
              <div style={{ marginTop: '16px', textAlign: 'center' }}>
                <div style={{
                  background: 'var(--theme-text)',
                  color: 'var(--theme-bg)',
                  borderRadius: 'var(--theme-radius-button)',
                  padding: '16px',
                  fontSize: '15px',
                  fontWeight: 500,
                }}>
                  Muestra este resumen en caja
                </div>
              </div>
            )}
          </div>
        </Modal>
        {/* Modal calificar plato */}
        {platoCalificar && (() => {
          const plato = todosLosPlatos.find((p: any) => p.id === platoCalificar)
          if (!plato) return null
          const tagsDisponibles = [
            { id: 'buena_porcion', label: 'Buena porción' },
            { id: 'buen_sabor', label: 'Buen sabor' },
            { id: 'buena_presentacion', label: 'Buena presentación' },
            { id: 'buen_precio', label: 'Buen precio' },
            { id: 'rapido', label: 'Rápido' },
            { id: 'fresco', label: 'Fresco' },
          ]
          const textoEstrellas = ['', 'Malo', 'Regular', 'Bueno', 'Muy bueno', 'Excelente']

          function toggleTag(id: string) {
            setCalTags(calTags.includes(id) ? calTags.filter(t => t !== id) : [...calTags, id])
          }

          async function enviarCalificacion() {
            if (calEstrellas === 0) return
            const supabase = createClient()

            // Guardar en Supabase y obtener la reseña recién creada
            const { data: nuevaResena } = await supabase
              .from('calificaciones')
              .insert({
                plato_id: plato.id,
                restaurante_id: restaurante.id,
                estrellas: calEstrellas,
                tags: calTags,
                comentario: calComentario || null,
              })
              .select()
              .single()

            // Optimistic update: agregar la nueva reseña al estado local inmediatamente
            // Así el usuario la ve al cerrar el modal de calificar, sin recargar el plato
            if (nuevaResena) {
              setResenasReales(prev => [nuevaResena, ...prev].slice(0, 5))
            }

            mutate(['calificaciones-aggregate', restaurante.id])

            setCalEnviada(true)
            setTimeout(() => { setPlatoCalificar(null); setCalEnviada(false) }, 2000)
          }

          // ===== Estado 2: Confirmación de envío =====
          if (calEnviada) {
            return (
              <Modal
                isOpen={!!platoCalificar}
                onClose={() => setPlatoCalificar(null)}
                maxWidth={440}
                showClose={false}
                themeClass={themeClass}
                stackLevel={1}
              >
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>✓</div>
                  <div style={{
                    fontSize: '18px',
                    fontWeight: 'var(--theme-title-weight)' as any,
                    fontFamily: 'var(--theme-font-display)',
                    letterSpacing: 'var(--theme-title-letter-spacing)',
                    textTransform: 'var(--theme-title-transform)' as any,
                    color: 'var(--theme-text)',
                    marginBottom: '6px',
                  }}>
                    ¡Gracias!
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>Tu calificación ayuda a otros comensales</div>
                </div>
              </Modal>
            )
          }

          // ===== Estado 1: Formulario =====
          return (
            <Modal
              isOpen={!!platoCalificar}
              onClose={() => setPlatoCalificar(null)}
              title="Calificar plato"
              maxWidth={500}
              themeClass={themeClass}
              stackLevel={1}
            >
              {/* Plato que va a calificar */}
              <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '12px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 500, color: color, flexShrink: 0, overflow: 'hidden' }}>
                  {plato.foto_url ? (
                    <img src={plato.foto_url} alt={plato.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : plato.nombre.charAt(0)}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>{plato.nombre}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{restaurante.nombre}</div>
                </div>
              </div>

              {/* Estrellas */}
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '12px' }}>¿Qué te pareció?</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '8px' }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <span key={n} onClick={() => setCalEstrellas(n)} style={{
                      fontSize: '36px', cursor: 'pointer',
                      color: n <= calEstrellas ? '#F2A623' : 'var(--theme-border-strong)',
                      transition: 'transform 0.15s',
                      transform: n <= calEstrellas ? 'scale(1.1)' : 'scale(1)',
                    }}>★</span>
                  ))}
                </div>
                {calEstrellas > 0 && <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{textoEstrellas[calEstrellas]}</div>}
              </div>

              {/* Tags rápidos */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>¿Qué destacas? (opcional)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {tagsDisponibles.map(tag => (
                    <div key={tag.id} onClick={() => toggleTag(tag.id)} style={{
                      padding: '8px 14px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                      background: calTags.includes(tag.id) ? 'var(--text-primary)' : 'var(--bg-secondary)',
                      color: calTags.includes(tag.id) ? 'white' : 'var(--text-secondary)',
                      border: calTags.includes(tag.id) ? '1px solid var(--text-primary)' : '1px solid var(--border-light)',
                      transition: 'all 0.15s',
                    }}>{tag.label}</div>
                  ))}
                </div>
              </div>

              {/* Comentario */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Comentario (opcional)</div>
                <div style={{ position: 'relative' }}>
                  <textarea value={calComentario} onChange={(e) => { if (e.target.value.length <= 200) setCalComentario(e.target.value) }}
                    placeholder="Cuéntanos más sobre tu experiencia..."
                    style={{
                      width: '100%', padding: '12px', border: '1px solid var(--border-light)', borderRadius: '10px',
                      fontSize: '13px', fontFamily: 'var(--font-body)', outline: 'none', resize: 'none', minHeight: '80px',
                    }} />
                  <span style={{ position: 'absolute', right: '12px', bottom: '8px', fontSize: '10px', color: calComentario.length > 180 ? 'var(--color-warning)' : 'var(--text-tertiary)' }}>
                    {calComentario.length}/200
                  </span>
                </div>
              </div>

              {/* Enviar */}
              <div onClick={enviarCalificacion} style={{
                background: calEstrellas > 0 ? 'var(--text-primary)' : 'var(--border-light)',
                color: calEstrellas > 0 ? 'white' : 'var(--text-tertiary)',
                borderRadius: '12px', padding: '16px', textAlign: 'center',
                fontSize: '15px', fontWeight: 500, cursor: calEstrellas > 0 ? 'pointer' : 'default',
                marginBottom: '12px',
              }}>
                Enviar calificación
              </div>

              <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                Tu reseña es anónima y ayuda a otros comensales
              </div>
            </Modal>
          )
        })()}
        {/* Modal detalle plato */}
        {platoDetalle && (() => {
          const plato = todosLosPlatos.find((p: any) => p.id === platoDetalle?.id)
          if (!plato) return null
          // F8.4 — variantes del plato (ya ordenadas por orden ASC en la proyección)
          const tieneVariantes = (plato as any).variantes && (plato as any).variantes.length > 0
          const varianteActual = tieneVariantes
            ? (plato as any).variantes.find((v: any) => v.id === varianteSeleccionadaId)
            : null
          // cartKey según selección: composite si hay variante, plano si no
          const cartKey = tieneVariantes && varianteSeleccionadaId
            ? makeCartKey(plato.id, varianteSeleccionadaId)
            : plato.id
          const cantidadActual = pedido[cartKey] || 0
          const cantidadMostrar = cantidadActual || 1

          return (
            <Modal
              isOpen={!!platoDetalle}
              onClose={() => setPlatoDetalle(null)}
              maxWidth={500}
              noPadding
              showClose={false}
              themeClass={themeClass}
            >
              {/* Foto grande */}
              <div style={{
                height: '200px',
                background: `${color}15`,
                borderRadius: 'var(--theme-radius-modal) var(--theme-radius-modal) 0 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
              }}>
                {esBasicoPublico && plato.foto_url ? (
                  <img src={plato.foto_url} alt={plato.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '60px', fontWeight: 500, color: color, opacity: 0.3 }}>{plato.nombre.charAt(0)}</span>
                )}
                <div onClick={() => setPlatoDetalle(null)} style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '16px',
                  cursor: 'pointer',
                }}>✕</div>
              </div>

              <div style={{ padding: '16px 20px' }}>
                {/* Nombre y calificación */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                  <div style={{
                    fontSize: '20px',
                    fontWeight: 'var(--theme-title-weight)' as any,
                    fontFamily: 'var(--theme-font-display)',
                    letterSpacing: 'var(--theme-title-letter-spacing)',
                    textTransform: 'var(--theme-title-transform)' as any,
                    color: 'var(--theme-text)',
                  }}>
                    {plato.nombre}
                  </div>
                  {config?.calificaciones_activo && plato.resenas > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '13px', color: '#F2A623' }}>★</span>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--theme-text)' }}>{plato.estrellas}</span>
                      <span style={{ fontSize: '12px', color: 'var(--theme-text-subtle)' }}>({plato.resenas})</span>
                    </div>
                  )}
                </div>

                <div style={{
                  fontSize: '13px',
                  color: 'var(--theme-text-muted)',
                  lineHeight: 1.6,
                  marginBottom: '14px',
                  overflowWrap: 'break-word',
                }}>
                  {plato.descripcion}
                </div>

                {/* F8.4 — Selector de variantes */}
                {tieneVariantes && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--theme-text)' }}>
                      Elige una opción
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(plato as any).variantes.map((v: any) => (
                        <label
                          key={v.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            border: `1px solid ${varianteSeleccionadaId === v.id ? color : 'var(--theme-border)'}`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            background: varianteSeleccionadaId === v.id ? 'var(--theme-surface-muted)' : 'transparent',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                              type="radio"
                              name="variante"
                              checked={varianteSeleccionadaId === v.id}
                              onChange={() => setVarianteSeleccionadaId(v.id)}
                              style={{ accentColor: color }}
                            />
                            <span style={{ fontSize: '14px', color: 'var(--theme-text)' }}>{v.nombre}</span>
                          </div>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--theme-text)' }}>
                            ${v.precio.toLocaleString('es-CO')}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {(() => {
                  // F8.7: si el plato del día tiene variante lockeada Y el usuario tiene esa variante
                  // seleccionada en el modal, mostrar discount (variante.precio tachado + precioEspecial).
                  const esPlatoDelDiaModo = !!(platoDia && platoDia.id === plato.id && esProPublico && config?.plato_dia_activo && platoDiaVisible && platoDetalle?.modo !== 'ganador')
                  const lockedVarianteCoincide = !!(esPlatoDelDiaModo && platoDia && platoDia.varianteId && platoDia.varianteId === varianteSeleccionadaId)
                  if (tieneVariantes && lockedVarianteCoincide && varianteActual && platoDia) {
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                        <span style={{
                          fontSize: '16px',
                          color: 'var(--theme-text-subtle)',
                          textDecoration: 'line-through',
                        }}>
                          ${formatoPrecio(varianteActual.precio)}
                        </span>
                        <span style={{
                          fontSize: '22px',
                          fontWeight: 500,
                          color: color,
                        }}>
                          ${formatoPrecio(platoDia.precioEspecial)}
                        </span>
                        <span style={{
                          fontSize: '11px',
                          color: 'white',
                          background: color,
                          padding: '3px 8px',
                          borderRadius: '10px',
                          fontWeight: 500,
                        }}>
                          Plato del día
                        </span>
                      </div>
                    )
                  }
                  // D4: con variantes (sin lock o variante no coincide), mostrar el precio de la variante seleccionada
                  if (tieneVariantes) {
                    return (
                      <div style={{
                        fontSize: '22px',
                        fontWeight: 500,
                        marginBottom: '16px',
                        color: 'var(--theme-text)',
                      }}>
                        ${formatoPrecio(varianteActual ? varianteActual.precio : plato.precio)}
                      </div>
                    )
                  }
                  if (esPlatoDelDiaModo && platoDia) {
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                        <span style={{
                          fontSize: '16px',
                          color: 'var(--theme-text-subtle)',
                          textDecoration: 'line-through',
                        }}>
                          ${formatoPrecio(platoDia.precio)}
                        </span>
                        <span style={{
                          fontSize: '22px',
                          fontWeight: 500,
                          color: color,
                        }}>
                          ${formatoPrecio(platoDia.precioEspecial)}
                        </span>
                        <span style={{
                          fontSize: '11px',
                          color: 'white',
                          background: color,
                          padding: '3px 8px',
                          borderRadius: '10px',
                          fontWeight: 500,
                        }}>
                          Plato del día
                        </span>
                      </div>
                    )
                  }
                  return (
                    <div style={{
                      fontSize: '22px',
                      fontWeight: 500,
                      marginBottom: '16px',
                      color: 'var(--theme-text)',
                    }}>
                      ${formatoPrecio(plato.precio)}
                    </div>
                  )
                })()}

                {/* Reseñas */}
                {config?.calificaciones_activo && (
                  <>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      marginBottom: '10px',
                      color: 'var(--theme-text)',
                    }}>
                      Reseñas {resenasReales.length > 0 ? `(${resenasReales.length})` : ''}
                    </div>
                    {resenasReales.length > 0 ? (
                      <>
                        <div style={{
                          background: 'var(--theme-bg)',
                          border: '1px solid var(--theme-border)',
                          borderRadius: 'var(--theme-radius-card)',
                          overflow: 'hidden',
                          marginBottom: '10px',
                        }}>
                          {(mostrarTodasResenas ? resenasReales : resenasReales.slice(0, 3)).map((r: any, i: number, arr: any[]) => (
                            <div key={i} style={{
                              padding: '12px 14px',
                              borderBottom: i < arr.length - 1 ? '1px solid var(--theme-border)' : 'none',
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <div style={{ fontSize: '11px', color: '#F2A623' }}>{'★'.repeat(r.estrellas)}{'☆'.repeat(5 - r.estrellas)}</div>
                                <div style={{ fontSize: '10px', color: 'var(--theme-text-subtle)' }}>
                                  {new Date(r.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                                </div>
                              </div>
                              {r.tags && r.tags.length > 0 && (
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                  {r.tags.map((t: string, ti: number) => (
                                    <span key={ti} style={{
                                      fontSize: '10px',
                                      background: 'var(--theme-surface-muted)',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      color: 'var(--theme-text-muted)',
                                    }}>
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {r.comentario && (
                                <div style={{
                                  fontSize: '12px',
                                  color: 'var(--theme-text-muted)',
                                }}>
                                  {r.comentario}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Botón Ver más / Ver menos */}
                        {resenasReales.length > 3 && (
                          <div
                            onClick={() => setMostrarTodasResenas(!mostrarTodasResenas)}
                            style={{
                              textAlign: 'center',
                              padding: '10px',
                              fontSize: '12px',
                              fontWeight: 500,
                              color: color,
                              cursor: 'pointer',
                              marginBottom: '14px',
                              borderRadius: 'var(--theme-radius-image)',
                              transition: 'background 0.15s ease',
                            }}
                          >
                            {mostrarTodasResenas 
                              ? '− Ver menos reseñas' 
                              : `+ Ver las ${resenasReales.length} reseñas`}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{
                        background: 'var(--theme-bg)',
                        border: '1px solid var(--theme-border)',
                        borderRadius: 'var(--theme-radius-card)',
                        padding: '16px',
                        textAlign: 'center',
                        marginBottom: '14px',
                      }}>
                        <div style={{ fontSize: '12px', color: 'var(--theme-text-subtle)' }}>Aún no hay reseñas. ¡Sé el primero!</div>
                      </div>
                    )}
                    <div onClick={() => { setCalEstrellas(0); setCalTags([]); setCalComentario(''); setCalEnviada(false); setPlatoCalificar(plato.id) }} style={{
                      border: '1px dashed var(--theme-border-strong)',
                      borderRadius: 'var(--theme-radius-card)',
                      padding: '14px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      marginBottom: '16px',
                    }}>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--theme-text)' }}>Calificar este plato</div>
                      <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)', marginTop: '2px' }}>Comparte tu experiencia</div>
                    </div>
                  </>
                )}

                {/* Agregar al pedido */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'var(--theme-bg)',
                    border: '1px solid var(--theme-border)',
                    borderRadius: 'var(--theme-radius-card)',
                    padding: '10px 14px',
                  }}>
                    <div onClick={() => { if (cantidadActual > 0) quitarDelPedido(cartKey) }} style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      border: '1px solid var(--theme-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                      cursor: 'pointer',
                      color: cantidadActual > 0 ? 'var(--theme-text-muted)' : 'var(--theme-border)',
                    }}>-</div>
                    <span style={{
                      fontSize: '16px',
                      fontWeight: 500,
                      minWidth: '20px',
                      textAlign: 'center',
                      color: 'var(--theme-text)',
                    }}>
                      {cantidadMostrar}
                    </span>
                    <div onClick={() => agregarAlPedido(cartKey)} style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '16px',
                      cursor: 'pointer',
                    }}>+</div>
                  </div>
                  {(() => {
                    // F8.7: discount aplica cuando (a) plato sin variantes, o (b) plato con variantes
                    // Y variante lockeada coincide con la seleccionada en el modal.
                    const esPlatoDelDiaBase = !!(platoDia && platoDia.id === plato.id && esProPublico && config?.plato_dia_activo && platoDiaVisible && platoDetalle?.modo !== 'ganador')
                    const lockMatch = !!(esPlatoDelDiaBase && platoDia && platoDia.varianteId && platoDia.varianteId === varianteSeleccionadaId)
                    const esPlatoDelDia = !!(esPlatoDelDiaBase && platoDia && (!tieneVariantes || lockMatch))
                    const precioParaCalcular = (esPlatoDelDia && platoDia)
                      ? platoDia.precioEspecial
                      : (varianteActual ? varianteActual.precio : plato.precio)
                    return (
                      <div onClick={() => {
                        if (cantidadActual === 0) {
                          if (esPlatoDelDia && platoDia) {
                            // Agregar con precio especial registrado
                            setPedido({ ...pedido, [cartKey]: 1 })
                            setPreciosPromo({
                              ...preciosPromo,
                              [cartKey]: { precioUnitario: platoDia.precioEspecial, etiqueta: 'Plato del día' }
                            })
                          } else {
                            agregarAlPedido(cartKey)
                          }
                        }
                        setPlatoDetalle(null)
                      }} style={{
                        flex: 1,
                        background: color,
                        color: 'white',
                        borderRadius: 'var(--theme-radius-button)',
                        padding: '14px',
                        textAlign: 'center',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}>
                        Agregar ${formatoPrecio(cantidadMostrar * precioParaCalcular)}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </Modal>
          )
        })()}

        {/* Powered by */}
        {!busqueda.trim() && totalProductos === 0 && (
          <div style={{ textAlign: 'center', padding: '20px', fontSize: '11px', color: 'var(--theme-text-subtle)' }}>
            Menú creado con <span style={{ fontWeight: 500 }}>MenuApp</span>
          </div>
        )}
        </>)}
      </div>
    </div>
  )
}