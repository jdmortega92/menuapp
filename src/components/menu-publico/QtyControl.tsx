'use client'

import type { MouseEvent } from 'react'

// Control presentacional de cantidad (+/−) del menú público. El stopPropagation
// vive en los call sites (qtyProps de la página): las tarjetas que lo hospedan
// son clickeables.
export default function QtyControl({ count, onAdd, onRemove, color }: {
  count: number
  onAdd: (e: MouseEvent) => void
  onRemove: (e: MouseEvent) => void
  color: string
}) {
  return count > 0 ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div onClick={onRemove} style={{ width: '26px', height: '26px', borderRadius: '50%', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', cursor: 'pointer', color: 'var(--text-secondary)' }}>-</div>
      <span style={{ fontSize: '14px', fontWeight: 500, minWidth: '16px', textAlign: 'center' }}>{count}</span>
      <div onClick={onAdd} style={{ width: '26px', height: '26px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', cursor: 'pointer' }}>+</div>
    </div>
  ) : (
    <div onClick={onAdd} style={{ width: '26px', height: '26px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', cursor: 'pointer' }}>+</div>
  )
}
