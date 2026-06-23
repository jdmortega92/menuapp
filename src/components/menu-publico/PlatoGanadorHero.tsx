'use client'

import type { ComponentProps } from 'react'
import QtyControl from '@/components/menu-publico/QtyControl'
import { makeCartKey } from '@/lib/cart'
import { formatoPrecio } from '@/lib/precio'

// Tarjeta destacada del Plato Ganador. El gate de visibilidad (Pro + activo +
// platoGanadorVisible + sin búsqueda) vive en la página. Las cart keys llevan
// source 'ganador' (precio congelado al agregar — contrato en lib/cart).
// Paleta fija dorada (no usa el color del restaurante).
export default function PlatoGanadorHero({
  platoGanador,
  todosLosPlatos,
  esBasicoPublico,
  onOpenDetalle,
  qtyProps,
}: {
  platoGanador: any
  todosLosPlatos: any[]
  esBasicoPublico: boolean
  onOpenDetalle: () => void
  qtyProps: (cartKey: string) => ComponentProps<typeof QtyControl>
}) {
  return (
    <div style={{ padding: '0 16px 10px' }}>
      <div onClick={onOpenDetalle} className="tap-card" style={{
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
              <div style={{
                fontSize: '11px',
                color: '#6B6A65',
                marginTop: '2px',
                fontStyle: 'italic',
                overflowWrap: 'break-word',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical' as any,
              }}>"{platoGanador.descripcionEspecial}"</div>
            )}
            {(() => {
              // D4: si el ganador tiene variantes pero sin lock, mostrar "desde $X" y sin Qty inline
              // F8.7: si hay variante lockeada, mostrar variante.precio + Qty con composite cartKey
              const ganadorPlato = todosLosPlatos.find((p: any) => p.id === platoGanador.id)
              const ganadorTieneVariantes = (ganadorPlato as any)?.variantes && (ganadorPlato as any).variantes.length > 0
              const varianteLocked = platoGanador.varianteId && platoGanador.variante ? platoGanador.variante : null
              if (varianteLocked) {
                const cartKeyGanador = makeCartKey(platoGanador.id, varianteLocked.id, 'ganador')
                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: '#B8860B' }}>${formatoPrecio(varianteLocked.precio)}</span>
                    <QtyControl {...qtyProps(cartKeyGanador)} />
                  </div>
                )
              }
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: '#B8860B' }}>{ganadorTieneVariantes ? 'desde ' : ''}${formatoPrecio(platoGanador.precio)}</span>
                  {ganadorTieneVariantes ? null : <QtyControl {...qtyProps(makeCartKey(platoGanador.id, undefined, 'ganador'))} />}
                </div>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
