'use client'

import type { ComponentProps } from 'react'
import QtyControl from '@/components/menu-publico/QtyControl'
import { makeCartKey } from '@/lib/cart'
import { formatoPrecio } from '@/lib/precio'
import { tintPlaceholder } from '@/lib/brandTints'

// Tarjeta de plato del LISTADO regular (categorías). La tarjeta del resultado
// de Sorpréndeme es deliberadamente más simple (sin pills de promo, sin
// estrellas, sin Agotado, foto 48px con el mismo gate mostrarFotos) y queda
// inline en la página — no se fuerza la unificación.
// Día tiene precedencia sobre promos en la tarjeta; las keys de día llevan
// source 'dia' (precio congelado — contrato en lib/cart).
export default function PlatoCard({
  plato,
  esEstePlatoElDia,
  platoDia,
  color,
  mostrarFotos,
  calificacionesActivo,
  discountInfoCard,
  has2x1Card,
  effDiscount,
  onOpenDetalle,
  qtyProps,
}: {
  plato: any
  esEstePlatoElDia: boolean
  platoDia: any
  color: string
  /** Fotos de platos visibles (STRATEGIC.2, lib/fotosGate): pagos siempre;
   *  gratis solo cuentas nunca-pagas. Antes era esBasicoPublico. */
  mostrarFotos: boolean
  calificacionesActivo: boolean | undefined
  discountInfoCard: (plato: any) => { min: number; max: number; applies: boolean }
  has2x1Card: (plato: any) => boolean
  effDiscount: (platoId: string, varianteId: string | null) => number
  onOpenDetalle: () => void
  qtyProps: (cartKey: string) => ComponentProps<typeof QtyControl>
}) {
  const varianteLockedDelDia = esEstePlatoElDia && platoDia.varianteId && platoDia.variante ? platoDia.variante : null
  const platoTieneVariantes = plato.variantes && plato.variantes.length > 0
  return (
    <div className="tap-card" style={{
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
      <div onClick={() => plato.disponible && onOpenDetalle()} style={{
        width: '64px',
        height: '64px',
        borderRadius: 'var(--theme-radius-image)',
        flexShrink: 0,
        cursor: plato.disponible ? 'pointer' : 'default',
        background: tintPlaceholder(color),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '22px',
        fontWeight: 500,
        color: color,
        overflow: 'hidden',
      }}>
        {mostrarFotos && plato.foto_url ? (
          <img src={plato.foto_url} alt={plato.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : plato.nombre.charAt(0)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div onClick={() => plato.disponible && onOpenDetalle()} style={{ cursor: plato.disponible ? 'pointer' : 'default' }}>
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
            {esEstePlatoElDia ? (
              varianteLockedDelDia ? (
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
              )
            ) : (() => {
              // PIEZA 3b-i — descuento en tarjeta. Día tiene PRECEDENCIA: este
              // bloque solo corre en la rama `else` de esEstePlatoElDia, así que
              // día y promo nunca se apilan en la tarjeta.
              const info = discountInfoCard(plato)
              const hasDescuento = info.applies
              // PIEZA 3c-i — 2x1 en tarjeta (mismo bloque, día ya tiene precedencia).
              const has2x1Any = has2x1Card(plato)
              // MIXTO: distintas variantes con tipos distintos (3a permite Grande 2x1 +
              // Mediana 20%). Pill genérico "Ofertas", precio plano (no se puede tachar
              // de forma significativa cuando los tipos se mezclan).
              if (hasDescuento && has2x1Any) {
                return (
                  <>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--theme-text)' }}>
                      {platoTieneVariantes ? 'desde ' : ''}${formatoPrecio(plato.precio)}
                    </span>
                    <span style={{ fontSize: '10px', color: 'white', background: color, padding: '2px 6px', borderRadius: 'var(--theme-radius-chip)', fontWeight: 500 }}>Ofertas</span>
                  </>
                )
              }
              // SOLO 2x1 (sin descuento): precio normal SIN tachón + pill "2x1" + texto.
              if (has2x1Any) {
                return (
                  <>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--theme-text)' }}>
                      {platoTieneVariantes ? 'desde ' : ''}${formatoPrecio(plato.precio)}
                    </span>
                    <span style={{ fontSize: '10px', color: 'white', background: color, padding: '2px 6px', borderRadius: 'var(--theme-radius-chip)', fontWeight: 500 }}>2x1</span>
                    <span style={{ fontSize: '10px', color: color, fontWeight: 500 }}>Lleva 2, paga 1</span>
                  </>
                )
              }
              if (!hasDescuento) {
                // sin promo aplicable (o índice vacío / no-Pro) → exacto como hoy
                return (
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--theme-text)' }}>
                    {platoTieneVariantes ? 'desde ' : ''}${formatoPrecio(plato.precio)}
                  </span>
                )
              }
              const pillText = info.min === info.max ? `${info.max}% OFF` : `hasta ${info.max}% OFF`
              if (platoTieneVariantes) {
                // "desde $Y" con Y = min sobre variantes de precio*(1-eff/100). Sin tachón.
                const minDesc = Math.min(...plato.variantes.map((v: any) => v.precio * (1 - effDiscount(plato.id, v.id) / 100)))
                return (
                  <>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: color }}>desde ${formatoPrecio(Math.round(minDesc))}</span>
                    <span style={{ fontSize: '10px', color: 'white', background: color, padding: '2px 6px', borderRadius: 'var(--theme-radius-chip)', fontWeight: 500 }}>{pillText}</span>
                  </>
                )
              }
              // sin variantes: tachado original + precio con descuento + pill
              const disc = effDiscount(plato.id, null)
              const precioDesc = Math.round(plato.precio * (1 - disc / 100))
              return (
                <>
                  <span style={{ fontSize: '12px', color: 'var(--theme-text-subtle)', textDecoration: 'line-through' }}>${formatoPrecio(plato.precio)}</span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: color }}>${formatoPrecio(precioDesc)}</span>
                  <span style={{ fontSize: '10px', color: 'white', background: color, padding: '2px 6px', borderRadius: 'var(--theme-radius-chip)', fontWeight: 500 }}>{pillText}</span>
                </>
              )
            })()}
            {calificacionesActivo && plato.resenas > 0 && (
              <span style={{ fontSize: '10px', color: '#F2A623' }}>
                ★ {plato.estrellas} <span style={{ color: 'var(--theme-text-subtle)' }}>({plato.resenas})</span>
              </span>
            )}
          </div>
          {plato.disponible
            ? (plato.variantes && plato.variantes.length > 0
                ? null // Card click abre el modal; sin Qty inline para platos con variantes
                : <QtyControl {...qtyProps(esEstePlatoElDia ? makeCartKey(plato.id, undefined, 'dia') : plato.id)} />)
            : <span style={{ fontSize: '10px', color: 'var(--color-danger)', fontWeight: 500 }}>Agotado</span>}
        </div>
      </div>
    </div>
  )
}
