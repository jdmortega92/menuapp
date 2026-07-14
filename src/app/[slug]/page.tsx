'use client'

import { useState, useEffect, useMemo } from 'react'
import type { MouseEvent } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Dices, X, ChevronDown, ChevronUp, Utensils, UtensilsCrossed } from 'lucide-react'
import Icono from '@/components/ui/Icono'
import { createClient } from '@/lib/supabase-browser'
import QtyControl from '@/components/menu-publico/QtyControl'
import PedidoModal from '@/components/menu-publico/PedidoModal'
import ComboDetalleModal from '@/components/menu-publico/ComboDetalleModal'
import PlatoGanadorHero from '@/components/menu-publico/PlatoGanadorHero'
import PlatoDiaHero from '@/components/menu-publico/PlatoDiaHero'
import PlatoCard from '@/components/menu-publico/PlatoCard'
import PlatoDetalleModal from '@/components/menu-publico/PlatoDetalleModal'
import BandejaFlotante from '@/components/menu-publico/BandejaFlotante'
import RestaurantLanding from '@/components/menu-publico/RestaurantLanding'
import { formato12h } from '@/lib/time'
import { tintPlaceholder, washSutil, borderFuerte, borderSutil, gradientHeader } from '@/lib/brandTints'
import { useMenuVisibility } from '@/hooks/useMenuVisibility'
import { usePromoIndices } from '@/hooks/usePromoIndices'
import { fechaColombia } from '@/lib/fechas'
import { formatoPrecio } from '@/lib/precio'
import { formatDias } from '@/lib/dias'
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
import { getSessionId, visitaYaLogueada, marcarVisitaLogueada } from '@/lib/analytics'
import { makeCartKey, enriquecerComboPlatos } from '@/lib/cart'
import { useCart } from '@/hooks/useCart'
import { mostrarFotosPublico } from '@/lib/fotosGate'
import type { Plan } from '@/types'

export default function MenuPublicoPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = params.slug as string
  const qrMesa = searchParams.get('qr')
  const esQR = !!qrMesa

  const [busqueda, setBusqueda] = useState('')
  const [categoriaAbierta, setCategoriaAbierta] = useState<string | null>(null)
  const [mostrarPedido, setMostrarPedido] = useState(false)
  const [mostrarSorpresa, setMostrarSorpresa] = useState(false)
  const [mostrarMenu, setMostrarMenu] = useState(esQR)
  type PlatoDetalleModo = 'normal' | 'ganador' | 'platoDia'
  const [platoDetalle, setPlatoDetalle] = useState<{ id: string; modo: PlatoDetalleModo } | null>(null)

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

  const [mostrarCombos, setMostrarCombos] = useState(false)
  const [comboDetalle, setComboDetalle] = useState<any>(null)

  useEffect(() => {
    if (!restaurante) return
    // Dedup por sesión y por restaurante (BL.34): StrictMode/remounts re-disparan
    // este effect y inflaban el conteo crudo 2-3x. El flag se setea ANTES del
    // insert (ver invariante en lib/analytics). Trade-off: si el insert falla no
    // se reintenta en esta sesión — perder una visita es mejor que contarla 2-3 veces.
    if (visitaYaLogueada(restaurante.id)) return
    marcarVisitaLogueada(restaurante.id)
    const supabase = createClient()
    supabase.from('visitas_menu').insert({
      restaurante_id: restaurante.id,
      origen: esQR ? 'qr' : 'enlace',
      mesa: qrMesa || null,
      fecha: fechaColombia(),
      session_id: getSessionId(),
    }).then(() => {})
  }, [restaurante?.id])

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
  // Fotos de PLATOS en el público (STRATEGIC.2): pagos siempre; gratis solo si la
  // cuenta NUNCA pagó (latch fue_pago). Se computa UNA vez y baja como prop.
  // logo_url/banner_url NO pasan por aquí: siguen gateados por esBasicoPublico.
  const mostrarFotos = mostrarFotosPublico(planRest as Plan, !!restaurante?.fue_pago)
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

  // Cadena de visibilidad extraída a useMenuVisibility (Refactor Fase 2).
  // `ahora` se computa UNA vez por render aquí, junto a useTick (60s), y la
  // cadena entera se recomputa cada render a propósito (visibilidad por horario).
  const ahora = new Date()
  const {
    horaActual,
    platosVisiblesIds,
    combosVisibles,
    promosVisibles,
    platoDiaVisible: platoDiaVisibleRaw,
    platoGanadorVisible: platoGanadorVisibleRaw,
    sorprendemeVisible,
    categoriasFiltradas,
    categoriasListado,
  } = useMenuVisibility({
    categorias,
    combosEnriquecidos,
    promosPublico,
    platoDia,
    platoGanador,
    config,
    esProPublico,
    busqueda,
    ahora,
  })
  // Re-alias local para que TS narrowee platoDia/platoGanador en el JSX
  // (aliased condition narrowing requiere el `x && ...` en este scope).
  // Idéntico en valor: el flag del hook ya incluye la truthiness de x.
  const platoDiaVisible = platoDia && platoDiaVisibleRaw
  const platoGanadorVisible = platoGanador && platoGanadorVisibleRaw

  // Índices de promos extraídos a usePromoIndices (Refactor Fase 2). Consumen
  // promosVisibles (output de useMenuVisibility) + gates de plan; el contrato
  // de gating por índice-vacío vive documentado en el hook.
  const { effDiscount, discountInfoCard, has2x1, has2x1Card } = usePromoIndices({
    promosVisibles,
    esProPublico,
    promosActivo: config?.promos_activo,
  })

  // Carrito extraído a useCart (Refactor Fase 2, con fix BL.28: stepping 2x1
  // consulta el índice vivo). Única fuente de pedido/nota/totales/WhatsApp.
  const {
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
  } = useCart({
    todosLosPlatos,
    platoDia,
    effDiscount,
    has2x1,
    restaurante,
    esQR,
    qrMesa,
  })

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

  // Props estándar de QtyControl para una cartKey: count del carrito + handlers
  // con stopPropagation (un solo lugar, seis call sites).
  function qtyProps(cartKey: string) {
    return {
      count: pedido[cartKey] || 0,
      onAdd: (e: MouseEvent) => { e.stopPropagation(); agregarAlPedido(cartKey) },
      onRemove: (e: MouseEvent) => { e.stopPropagation(); quitarDelPedido(cartKey) },
      color,
    }
  }

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
          <div style={{ marginBottom: '12px', color: 'var(--theme-text-subtle)' }}><Icono icono={UtensilsCrossed} size={40} /></div>
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
          <RestaurantLanding
            restaurante={restaurante}
            horariosRest={horariosRest}
            esBasicoPublico={esBasicoPublico}
            color={color}
            ahora={ahora}
            horaActual={horaActual}
            whatsappActivo={config?.whatsapp_activo}
            onVerMenu={() => setMostrarMenu(true)}
          />
        )}
        {mostrarMenu && (<>
        {/* Header: Banner + Logo superpuesto estilo Facebook (banner solo desde plan Básico) */}
        <div style={{ position: 'relative', marginBottom: '56px' }}>
          {/* Banner */}
          <div style={{
            height: '140px',
            background: (esBasicoPublico && restaurante.banner_url)
              ? `url(${restaurante.banner_url}) center/cover`
              : gradientHeader(color),
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
                    color: abiertoAhora ? 'var(--color-green)' : 'var(--theme-text-subtle)',
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
          <div onClick={() => setCategoriaAbierta(categoriaAbierta ? null : 'open')} style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 500, background: color, color: 'white', cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>Categorías <Icono icono={categoriaAbierta ? ChevronUp : ChevronDown} size={12} /></div>
          {esProPublico && config?.combos_activo && combosVisibles.length > 0 && <div onClick={() => setMostrarCombos(!mostrarCombos)} style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '11px', border: mostrarCombos ? 'none' : '1px solid var(--theme-border)', color: mostrarCombos ? 'white' : 'var(--theme-text-muted)', background: mostrarCombos ? color : 'var(--theme-surface)', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all var(--transicion-ui)' }}>Combos</div>}
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
          <PlatoGanadorHero
            platoGanador={platoGanador}
            todosLosPlatos={todosLosPlatos}
            esBasicoPublico={esBasicoPublico}
            onOpenDetalle={() => setPlatoDetalle({ id: platoGanador.id, modo: 'ganador' })}
            qtyProps={qtyProps}
          />
        )}

        {/* Plato del día */}
        {esProPublico && config?.plato_dia_activo && platoDiaVisible && !busqueda.trim() && (
          <PlatoDiaHero
            platoDia={platoDia}
            todosLosPlatos={todosLosPlatos}
            color={color}
            onOpenDetalle={() => setPlatoDetalle({ id: platoDia.id, modo: 'platoDia' })}
            qtyProps={qtyProps}
          />
        )}

        {/* Sorpréndeme botón */}
        {esBasicoPublico && config?.sorprendeme_activo && sorprendemeVisible && !busqueda.trim() && (
          <div style={{ padding: '0 16px 10px' }}>
            <div onClick={sorprendeme} style={{
              border: mostrarSorpresa ? `1px solid ${color}` : '1px dashed var(--theme-border-strong)',
              borderRadius: 'var(--theme-radius-card)',
              padding: '12px',
              textAlign: 'center',
              cursor: 'pointer',
              background: mostrarSorpresa ? washSutil(color) : 'transparent',
            }}>
              <span style={{ fontSize: '13px', color: mostrarSorpresa ? color : 'var(--theme-text-muted)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Icono icono={Dices} size={18} /> {mostrarSorpresa ? 'Generar otra combinación' : 'Sorpréndeme — ¿No sabes qué pedir?'}
              </span>
            </div>
          </div>
        )}

        {/* Sorpréndeme resultado */}
        {esBasicoPublico && sorprendemeVisible && mostrarSorpresa && (
          <div style={{ padding: '0 16px 14px' }}>
            <div style={{
              background: washSutil(color),
              border: borderSutil(color),
              borderRadius: 'var(--theme-radius-card)',
              padding: '12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: color, display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Icono icono={Dices} size={18} /> Tu combinación</span>
                <span onClick={() => setMostrarSorpresa(false)} style={{ fontSize: '11px', color: 'var(--theme-text-subtle)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '10px', margin: '-10px' }}><Icono icono={X} size={12} /> Cerrar</span>
              </div>
              {sorpresaPlatos.map((plato: any) => {
                const esEstePlatoElDia = esProPublico && config?.plato_dia_activo && platoDiaVisible && platoDia && platoDia.id === plato.id
                const varianteLockedDelDia = esEstePlatoElDia && platoDia.varianteId && platoDia.variante ? platoDia.variante : null
                const platoTieneVariantes = plato.variantes && plato.variantes.length > 0
                return (
                <div key={plato.id} onClick={() => setPlatoDetalle({ id: plato.id, modo: 'normal' })} className="tap-card" style={{
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
                    background: tintPlaceholder(color),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    fontWeight: 500,
                    color: color,
                    overflow: 'hidden',
                  }}>
                    {mostrarFotos && plato.foto_url ? (
                      <img src={plato.foto_url} alt={plato.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : plato.nombre.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--theme-text)',
                    }}>
                      {plato.nombre}{varianteLockedDelDia ? ` · ${varianteLockedDelDia.nombre}` : ''}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: 'var(--theme-text-muted)',
                      overflowWrap: 'break-word',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 1,
                      WebkitBoxOrient: 'vertical' as any,
                    }}>
                      {plato.descripcion}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      {esEstePlatoElDia ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {varianteLockedDelDia ? (
                            <>
                              <span style={{ fontSize: '12px', color: 'var(--theme-text-subtle)', textDecoration: 'line-through' }}>${formatoPrecio(varianteLockedDelDia.precio)}</span>
                              <span style={{ fontSize: '13px', fontWeight: 500, color: color }}>${formatoPrecio(platoDia.precioEspecial)}</span>
                              <span style={{ fontSize: '10px', color: 'white', background: color, padding: '2px 6px', borderRadius: 'var(--theme-radius-chip)', fontWeight: 500 }}>Plato del día</span>
                            </>
                          ) : platoTieneVariantes ? (
                            <>
                              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--theme-text)' }}>desde ${formatoPrecio(plato.precio)}</span>
                              <span style={{ fontSize: '10px', color: 'white', background: color, padding: '2px 6px', borderRadius: 'var(--theme-radius-chip)', fontWeight: 500 }}>Plato del día</span>
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: '12px', color: 'var(--theme-text-subtle)', textDecoration: 'line-through' }}>${formatoPrecio(plato.precio)}</span>
                              <span style={{ fontSize: '13px', fontWeight: 500, color: color }}>${formatoPrecio(platoDia.precioEspecial)}</span>
                              <span style={{ fontSize: '10px', color: 'white', background: color, padding: '2px 6px', borderRadius: 'var(--theme-radius-chip)', fontWeight: 500 }}>Plato del día</span>
                            </>
                          )}
                        </div>
                      ) : (
                        <span style={{
                          fontSize: '13px',
                          fontWeight: 500,
                          color: 'var(--theme-text)',
                        }}>
                          {plato.variantes && plato.variantes.length > 0 ? 'desde ' : ''}${formatoPrecio(plato.precio)}
                        </span>
                      )}
                      {plato.variantes && plato.variantes.length > 0
                        ? null // Card click abre el modal; sin Qty inline para platos con variantes
                        : <QtyControl {...qtyProps(esEstePlatoElDia ? makeCartKey(plato.id, undefined, 'dia') : plato.id)} />}
                    </div>
                  </div>
                </div>
                )
              })}
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
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <Icono icono={Utensils} size={16} /> Combos
            </div>
            {combosVisibles.map((combo: any) => (
              <div key={combo.id} onClick={() => setComboDetalle(combo)} className="tap-card" style={{
                background: 'var(--theme-surface)',
                border: borderFuerte(color),
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
                    {combo.dias && combo.dias.length > 0 && formatDias(combo.dias, 'full')}
                    {combo.dias && combo.dias.length > 0 && combo.horario_inicio && combo.horario_fin && ' · '}
                    {combo.horario_inicio && combo.horario_fin && `${formato12h(combo.horario_inicio)}–${formato12h(combo.horario_fin)}`}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '15px', fontWeight: 500, color: color }}>${formatoPrecio(combo.precio)}</span>
                    <span style={{
                      fontSize: '12px',
                      color: 'var(--theme-text-subtle)',
                      textDecoration: 'line-through',
                    }}>
                      ${formatoPrecio(combo.precioIndividual)}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--color-green)', fontWeight: 500 }}>-${formatoPrecio(combo.precioIndividual - combo.precio)}</span>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <QtyControl {...qtyProps(combo.id)} />
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: color, marginTop: '6px', fontWeight: 500 }}>Ver detalles →</div>
              </div>
            ))}
          </div>
        )}
        {/* Modal detalle combo */}
        {comboDetalle && (
          <ComboDetalleModal
            combo={comboDetalle}
            categorias={categorias}
            color={color}
            esBasicoPublico={esBasicoPublico}
            themeClass={themeClass}
            onAgregar={agregarAlPedido}
            onClose={() => setComboDetalle(null)}
          />
        )}
        {/* Modal detalle promo — REMOVED in PIEZA 3b-ii-B. Los descuentos ahora se
            muestran en la tarjeta del plato + el modal de detalle (3b-i) y se aplican
            en el carrito vía agregarAlPedido (3b-ii-A). */}
        {/* Categorías y platos */}
        {categoriasListado.map((cat: any) => (
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
            {cat.platos.map((plato: any) => {
              const esEstePlatoElDia = esProPublico && config?.plato_dia_activo && platoDiaVisible && platoDia && platoDia.id === plato.id
              return (
                <PlatoCard
                  key={plato.id}
                  plato={plato}
                  esEstePlatoElDia={!!esEstePlatoElDia}
                  platoDia={platoDia}
                  color={color}
                  mostrarFotos={mostrarFotos}
                  calificacionesActivo={config?.calificaciones_activo}
                  discountInfoCard={discountInfoCard}
                  has2x1Card={has2x1Card}
                  effDiscount={effDiscount}
                  onOpenDetalle={() => setPlatoDetalle({ id: plato.id, modo: 'normal' })}
                  qtyProps={qtyProps}
                />
              )
            })}
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
                limpiarNoDisponibles((id) => platosVisiblesIds.has(id) || combosVisibles.some((c: any) => c.id === id))
              }} style={{ fontSize: '12px', color: 'var(--color-warning)', fontWeight: 500, cursor: 'pointer' }}>
                Limpiar platos no disponibles →
              </div>
            </div>
          </div>
        )}

        {/* Bandeja flotante */}
        {totalProductos > 0 && !mostrarPedido && !platoDetalle && (
          <BandejaFlotante
            totalProductos={totalProductos}
            itemsPedido={itemsPedido}
            totalPedido={totalPedido}
            onOpen={() => setMostrarPedido(true)}
          />
        )}

        {/* Modal ver pedido */}
        <PedidoModal
          isOpen={mostrarPedido}
          onClose={() => setMostrarPedido(false)}
          itemsPedido={itemsPedido}
          totalPedido={totalPedido}
          nota={nota}
          setNota={setNota}
          onAgregar={agregarAlPedido}
          onQuitar={quitarDelPedido}
          onPedir={pedirPorWhatsApp}
          esQR={esQR}
          qrMesa={qrMesa}
          color={color}
          themeClass={themeClass}
          whatsappActivo={config?.whatsapp_activo}
        />
        {/* Modal detalle plato (con calificar anidado, ver PlatoDetalleModal) */}
        {platoDetalle && (() => {
          const plato = todosLosPlatos.find((p: any) => p.id === platoDetalle.id)
          if (!plato) return null
          return (
            <PlatoDetalleModal
              plato={plato}
              modo={platoDetalle.modo}
              platoDia={platoDia}
              platoGanador={platoGanador}
              esProPublico={esProPublico}
              mostrarFotos={mostrarFotos}
              platoDiaActivo={config?.plato_dia_activo}
              calificacionesActivo={config?.calificaciones_activo}
              platoDiaVisible={!!platoDiaVisible}
              color={color}
              themeClass={themeClass}
              restauranteId={restaurante.id}
              restauranteNombre={restaurante.nombre}
              pedido={pedido}
              agregarAlPedido={agregarAlPedido}
              quitarDelPedido={quitarDelPedido}
              effDiscount={effDiscount}
              has2x1={has2x1}
              onClose={() => setPlatoDetalle(null)}
            />
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