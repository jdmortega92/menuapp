'use client'

import type { ComponentProps } from 'react'
import { Clock } from 'lucide-react'
import Icono from '@/components/ui/Icono'
import QtyControl from '@/components/menu-publico/QtyControl'
import { makeCartKey } from '@/lib/cart'
import { formatoPrecio } from '@/lib/precio'
import { formato12h } from '@/lib/time'
import { washHero, borderFuerte } from '@/lib/brandTints'

// Tarjeta destacada del Plato del Día. El gate de visibilidad (Pro + activo +
// platoDiaVisible + sin búsqueda) vive en la página. Las cart keys llevan
// source 'dia' (precio especial congelado al agregar — contrato en lib/cart).
export default function PlatoDiaHero({
  platoDia,
  todosLosPlatos,
  color,
  onOpenDetalle,
  qtyProps,
}: {
  platoDia: any
  todosLosPlatos: any[]
  color: string
  onOpenDetalle: () => void
  qtyProps: (cartKey: string) => ComponentProps<typeof QtyControl>
}) {
  // D4: si el plato del día tiene variantes, mostrarlo como un plato normal variantizado
  // ("desde $X", sin precio tachado ni "+" inline). El click de la tarjeta abre el modal.
  const platoDiaPlato = todosLosPlatos.find((p: any) => p.id === platoDia.id)
  const platoDiaTieneVariantes = (platoDiaPlato as any)?.variantes && (platoDiaPlato as any).variantes.length > 0
  // F8.7: variante locked → resolved variante card path
  const varianteLocked = platoDia.varianteId && platoDia.variante ? platoDia.variante : null
  const cartKeyDia = makeCartKey(platoDia.id, varianteLocked?.id, 'dia')
  return (
    <div style={{ padding: '0 16px 10px' }}>
      <div onClick={onOpenDetalle} className="tap-card" style={{
        background: washHero(color),
        border: borderFuerte(color),
        borderRadius: 'var(--theme-radius-card)',
        boxShadow: 'var(--theme-shadow-card)',
        padding: '12px',
        cursor: 'pointer',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 500, color: color, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Icono icono={Clock} size={12} /> PLATO DEL DÍA</span>
          {platoDia.horaInicio && platoDia.horaFin && (
            <span style={{ fontSize: '10px', color: 'var(--theme-text-subtle)' }}>
              {formato12h(platoDia.horaInicio)} — {formato12h(platoDia.horaFin)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
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
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical' as any,
            }}>
              {platoDia.descripcion}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
              {(!varianteLocked && platoDiaTieneVariantes) ? null : (
                <QtyControl {...qtyProps(cartKeyDia)} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
