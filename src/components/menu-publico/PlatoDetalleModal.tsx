'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import CalificarModal from '@/components/menu-publico/CalificarModal'
import { createClient } from '@/lib/supabase-browser'
import { makeCartKey } from '@/lib/cart'
import { fechaColombia } from '@/lib/fechas'
import { formatoPrecio } from '@/lib/precio'
import { getSessionId } from '@/lib/analytics'
import { tintPlaceholder } from '@/lib/brandTints'

// Modal de detalle de plato del menú público. La página resuelve el plato y
// pasa modo (normal/ganador/platoDia); aquí vive la derivación
// esPlatoDelDiaPrecio → cartKeySource ('dia'/'ganador'/undefined): el source
// del cartKey DEBE coincidir con el precio aplicado (contrato en lib/cart).
// Posee: selección de variante, reseñas, y el modal de calificar (apilado,
// stackLevel 1). Se monta al abrir y desmonta al cerrar — los effects keyed
// por plato.id equivalen al [platoDetalle?.id] original.
export default function PlatoDetalleModal({
  plato,
  modo,
  platoDia,
  platoGanador,
  esProPublico,
  esBasicoPublico,
  platoDiaActivo,
  calificacionesActivo,
  platoDiaVisible,
  color,
  themeClass,
  restauranteId,
  restauranteNombre,
  pedido,
  agregarAlPedido,
  quitarDelPedido,
  effDiscount,
  has2x1,
  onClose,
}: {
  plato: any
  modo: 'normal' | 'ganador' | 'platoDia'
  platoDia: any
  platoGanador: any
  esProPublico: boolean
  esBasicoPublico: boolean
  platoDiaActivo: boolean | undefined
  calificacionesActivo: boolean | undefined
  platoDiaVisible: boolean
  color: string
  themeClass: string
  restauranteId: string
  restauranteNombre: string
  pedido: Record<string, number>
  agregarAlPedido: (cartKey: string) => void
  quitarDelPedido: (cartKey: string) => void
  effDiscount: (platoId: string, varianteId: string | null) => number
  has2x1: (platoId: string, varianteId: string | null) => boolean
  onClose: () => void
}) {
  const [varianteSeleccionadaId, setVarianteSeleccionadaId] = useState<string | null>(null)
  const [resenasReales, setResenasReales] = useState<any[]>([])
  const [mostrarTodasResenas, setMostrarTodasResenas] = useState(false)
  const [platoCalificar, setPlatoCalificar] = useState<string | null>(null)

  // Registrar vista del plato + cargar reseñas (antes vivía en la página,
  // keyed en platoDetalle: el mount-por-apertura preserva el una-vez-por-open).
  useEffect(() => {
    setResenasReales([])
    setMostrarTodasResenas(false) // Resetear al abrir otro plato
    // Registrar vista del plato
    const supabaseVista = createClient()
    supabaseVista.from('vistas_platos').insert({
      plato_id: plato.id,
      restaurante_id: restauranteId,
      fecha: fechaColombia(),
      session_id: getSessionId(),
    }).then(({ error }: any) => {

    })
    const supabase = createClient()
    supabase.from('calificaciones')
      .select('*')
      .eq('plato_id', plato.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }: any) => {
        if (data) setResenasReales(data)
        else setResenasReales([])
      })
  }, [plato.id, restauranteId])

  // F8.4 — al abrir el detalle, preseleccionar la primera variante (orden ASC) o limpiar
  useEffect(() => {
    const variantes = (plato as any)?.variantes
    if (variantes && variantes.length > 0) {
      // F8.7: si el modal abre en modo platoDia/ganador con variante lockeada,
      // pre-seleccionar esa variante en lugar de variantes[0].
      let preseleccion: string = variantes[0].id
      if (modo === 'platoDia' && platoDia?.varianteId) {
        if (variantes.some((v: any) => v.id === platoDia.varianteId)) {
          preseleccion = platoDia.varianteId
        }
      } else if (modo === 'ganador' && platoGanador?.varianteId) {
        if (variantes.some((v: any) => v.id === platoGanador.varianteId)) {
          preseleccion = platoGanador.varianteId
        }
      }
      setVarianteSeleccionadaId(preseleccion)
    } else {
      setVarianteSeleccionadaId(null)
    }
    // Solo re-ejecutar al abrir un PLATO distinto, no en cada render.
    // plato/platoDia/platoGanador se reconstruyen cada render (sin memo en la
    // página): incluirlos dispararía el efecto y sobrescribiría la selección
    // del usuario (BL.17).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plato.id])

  // F8.4 — variantes del plato (ya ordenadas por orden ASC en la proyección)
  const tieneVariantes = (plato as any).variantes && (plato as any).variantes.length > 0
  const varianteActual = tieneVariantes
    ? (plato as any).variantes.find((v: any) => v.id === varianteSeleccionadaId)
    : null
  // F8.7 — detección día/ganador hoisted (la usan el bloque de precio y el botón Agregar).
  // Debe vivir antes de cartKey para que el source del key coincida con el precio aplicado.
  const esPlatoDelDiaModal = !!(platoDia && platoDia.id === plato.id && esProPublico && platoDiaActivo && platoDiaVisible && modo !== 'ganador')
  const lockMatchModal = !!(esPlatoDelDiaModal && platoDia && platoDia.varianteId && platoDia.varianteId === varianteSeleccionadaId)
  const esPlatoDelDiaPrecio = !!(esPlatoDelDiaModal && platoDia && (!tieneVariantes || lockMatchModal))
  // cartKey según selección: composite si hay variante, plano si no; con source dia/ganador
  // para que día/ganador no colisionen con la tarjeta regular del mismo plato.
  const cartKeySource = esPlatoDelDiaPrecio ? 'dia' : (modo === 'ganador' ? 'ganador' : undefined)
  const cartKey = makeCartKey(plato.id, (tieneVariantes && varianteSeleccionadaId) ? varianteSeleccionadaId : undefined, cartKeySource)
  const cantidadActual = pedido[cartKey] || 0
  const cantidadMostrar = cantidadActual || 1

  return (
    <>
    <Modal
      isOpen={true}
      onClose={onClose}
      maxWidth={500}
      noPadding
      showClose={false}
      themeClass={themeClass}
    >
      {/* Foto grande */}
      <div style={{
        height: '200px',
        background: tintPlaceholder(color),
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
        <div onClick={onClose} className="tap-control" style={{
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
          {calificacionesActivo && plato.resenas > 0 && (
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
                  {(() => {
                    // PIEZA 3b-i — descuento por variante en el modal. Día tiene
                    // precedencia: si este plato se muestra como plato del día,
                    // no apilamos descuento de promo (effDiscount → 0).
                    const dVar = esPlatoDelDiaModal ? 0 : effDiscount(plato.id, v.id)
                    if (dVar > 0) {
                      const pd = Math.round(v.precio * (1 - dVar / 100))
                      return (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--theme-text-subtle)', textDecoration: 'line-through' }}>${formatoPrecio(v.precio)}</span>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: color }}>${formatoPrecio(pd)}</span>
                          <span style={{ fontSize: '10px', color: color, fontWeight: 500 }}>{dVar}% OFF</span>
                        </span>
                      )
                    }
                    // PIEZA 3c-i — 2x1 por variante (3a garantiza que no coexiste con
                    // descuento en la misma variante). Precio plano + badge "2x1".
                    const is2x1Var = esPlatoDelDiaModal ? false : has2x1(plato.id, v.id)
                    if (is2x1Var) {
                      return (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--theme-text)' }}>${formatoPrecio(v.precio)}</span>
                          <span style={{ fontSize: '10px', color: color, fontWeight: 500 }}>2x1</span>
                        </span>
                      )
                    }
                    return (
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--theme-text)' }}>
                        ${formatoPrecio(v.precio)}
                      </span>
                    )
                  })()}
                </label>
              ))}
            </div>
          </div>
        )}

        {(() => {
          // F8.7: si el plato del día tiene variante lockeada Y el usuario tiene esa variante
          // seleccionada en el modal, mostrar discount (variante.precio tachado + precioEspecial).
          if (tieneVariantes && lockMatchModal && varianteActual && platoDia) {
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
                  fontSize: '10px',
                  color: 'white',
                  background: color,
                  padding: '3px 8px',
                  borderRadius: 'var(--theme-radius-chip)',
                  fontWeight: 500,
                }}>
                  Plato del día
                </span>
              </div>
            )
          }
          // D4: con variantes (sin lock o variante no coincide), mostrar el precio de la variante seleccionada
          if (tieneVariantes) {
            // PIEZA 3b-i — reflejar el descuento de la variante SELECCIONADA.
            // Día tiene precedencia (effDiscount → 0 si el plato es plato del día).
            const base = varianteActual ? varianteActual.precio : plato.precio
            const dSel = esPlatoDelDiaModal ? 0 : effDiscount(plato.id, varianteSeleccionadaId)
            if (dSel > 0) {
              const pd = Math.round(base * (1 - dSel / 100))
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '16px', color: 'var(--theme-text-subtle)', textDecoration: 'line-through' }}>${formatoPrecio(base)}</span>
                  <span style={{ fontSize: '22px', fontWeight: 500, color: color }}>${formatoPrecio(pd)}</span>
                  <span style={{ fontSize: '10px', color: 'white', background: color, padding: '3px 8px', borderRadius: 'var(--theme-radius-chip)', fontWeight: 500 }}>{dSel}% OFF</span>
                </div>
              )
            }
            // PIEZA 3c-i — 2x1 de la variante seleccionada (3a: no coexiste con descuento).
            const sel2x1 = esPlatoDelDiaModal ? false : has2x1(plato.id, varianteSeleccionadaId)
            if (sel2x1) {
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 500, color: 'var(--theme-text)' }}>${formatoPrecio(base)}</span>
                  <span style={{ fontSize: '10px', color: 'white', background: color, padding: '3px 8px', borderRadius: 'var(--theme-radius-chip)', fontWeight: 500 }}>2x1</span>
                  <span style={{ fontSize: '11px', color: color, fontWeight: 500 }}>Lleva 2, paga 1</span>
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
                ${formatoPrecio(base)}
              </div>
            )
          }
          if (esPlatoDelDiaModal && platoDia) {
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
                  fontSize: '10px',
                  color: 'white',
                  background: color,
                  padding: '3px 8px',
                  borderRadius: 'var(--theme-radius-chip)',
                  fontWeight: 500,
                }}>
                  Plato del día
                </span>
              </div>
            )
          }
          // PIEZA 3b-i — plato SIN variantes y SIN día: reflejar descuento si aplica.
          // (Las ramas de día ya retornaron arriba, así que aquí esPlatoDelDiaModal es false.)
          {
            const dNo = effDiscount(plato.id, null)
            if (dNo > 0) {
              const pd = Math.round(plato.precio * (1 - dNo / 100))
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '16px', color: 'var(--theme-text-subtle)', textDecoration: 'line-through' }}>${formatoPrecio(plato.precio)}</span>
                  <span style={{ fontSize: '22px', fontWeight: 500, color: color }}>${formatoPrecio(pd)}</span>
                  <span style={{ fontSize: '10px', color: 'white', background: color, padding: '3px 8px', borderRadius: 'var(--theme-radius-chip)', fontWeight: 500 }}>{dNo}% OFF</span>
                </div>
              )
            }
            // PIEZA 3c-i — plato SIN variantes con 2x1: precio plano + badge "2x1".
            if (has2x1(plato.id, null)) {
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 500, color: 'var(--theme-text)' }}>${formatoPrecio(plato.precio)}</span>
                  <span style={{ fontSize: '10px', color: 'white', background: color, padding: '3px 8px', borderRadius: 'var(--theme-radius-chip)', fontWeight: 500 }}>2x1</span>
                  <span style={{ fontSize: '11px', color: color, fontWeight: 500 }}>Lleva 2, paga 1</span>
                </div>
              )
            }
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
        {calificacionesActivo && (
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
            <div onClick={() => setPlatoCalificar(plato.id)} className="tap-cta" style={{
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
            <div onClick={() => { if (cantidadActual > 0) quitarDelPedido(cartKey) }} className="tap-control" style={{
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
            <div onClick={() => agregarAlPedido(cartKey)} className="tap-control" style={{
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
            // PIEZA 3c (label promo-aware): la etiqueta REFLEJA lo que cobra
            // agregarAlPedido, con el MISMO orden y gates del carrito:
            // día (esPlatoDelDiaPrecio) → descuento → 2x1 → plano.
            const base = varianteActual ? varianteActual.precio : plato.precio
            const pct = effDiscount(plato.id, varianteSeleccionadaId ?? null)
            let label: string
            if (esPlatoDelDiaPrecio && platoDia) {
              label = `Agregar $${formatoPrecio(cantidadMostrar * platoDia.precioEspecial)}`
            } else if (pct > 0) {
              const precioDesc = Math.round(base * (1 - pct / 100))
              label = `Agregar $${formatoPrecio(cantidadMostrar * precioDesc)}`
            } else if (has2x1(plato.id, varianteSeleccionadaId ?? null)) {
              // 2x1: precio plano (lo que se paga por las 2 unidades que entran en
              // el primer add) + sufijo. NO multiplicar por cantidadMostrar (sobre-
              // estimaría si ya hay qty 2/4 en el carrito).
              label = `Agregar $${formatoPrecio(base)} · 2x1`
            } else {
              label = `Agregar $${formatoPrecio(cantidadMostrar * base)}`
            }
            return (
              <div onClick={() => {
                if (cantidadActual === 0) {
                  // agregarAlPedido registra el precio especial para keys con source 'dia'.
                  agregarAlPedido(cartKey)
                }
                onClose()
              }} className="tap-cta" style={{
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
                {label}
              </div>
            )
          })()}
        </div>
      </div>
    </Modal>

    {/* Modal calificar plato — apilado sobre el detalle (stackLevel 1). Montaje
        fresco por apertura = reset del formulario. */}
    {platoCalificar && (
      <CalificarModal
        plato={plato}
        restauranteId={restauranteId}
        restauranteNombre={restauranteNombre}
        color={color}
        themeClass={themeClass}
        onClose={() => setPlatoCalificar(null)}
        onResenaCreada={(resena) => setResenasReales(prev => [resena, ...prev].slice(0, 5))}
      />
    )}
    </>
  )
}
