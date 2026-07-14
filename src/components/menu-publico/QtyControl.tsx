'use client'

import type { MouseEvent } from 'react'
import { Plus, Minus } from 'lucide-react'
import Icono from '@/components/ui/Icono'

// Control presentacional de cantidad (+/−) del menú público. El stopPropagation
// vive en los call sites (qtyProps de la página): las tarjetas que lo hospedan
// son clickeables. El círculo "+" conserva el acento del restaurante (`color`
// inline); solo el glifo interior es lucide (Fase B UI).
export default function QtyControl({ count, onAdd, onRemove, color }: {
  count: number
  onAdd: (e: MouseEvent) => void
  onRemove: (e: MouseEvent) => void
  color: string
}) {
  return count > 0 ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <button type="button" onClick={onRemove} aria-label="Quitar uno" className="tap-control tap-target-44" style={{ width: '26px', height: '26px', borderRadius: '50%', border: '1px solid var(--theme-border)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--theme-text-muted)' }}><Icono icono={Minus} size={14} /></button>
      <span style={{ fontSize: '14px', fontWeight: 500, minWidth: '16px', textAlign: 'center' }}>{count}</span>
      <button type="button" onClick={onAdd} aria-label="Agregar uno" className="tap-control tap-target-44" style={{ width: '26px', height: '26px', borderRadius: '50%', border: 'none', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer' }}><Icono icono={Plus} size={14} /></button>
    </div>
  ) : (
    <button type="button" onClick={onAdd} aria-label="Agregar uno" className="tap-control tap-target-44" style={{ width: '26px', height: '26px', borderRadius: '50%', border: 'none', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer' }}><Icono icono={Plus} size={14} /></button>
  )
}
