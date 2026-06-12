'use client'

import { memo } from 'react'
import { formatoPrecio } from '@/lib/precio'
import type { Variante } from '@/types'

type PlatoRow = {
  id: string
  nombre: string
  precio: number
  descripcion: string
  disponible: boolean
  foto_url: string | null
  variantes?: Variante[]
}

// ── PlatoCard — fila colapsada de plato en el admin (Fase 3, anti-lag BL.13) ──
// React.memo: con N platos esta fila es el ítem caliente de la lista. Todas las
// props son escalares, el objeto plato (identidad estable salvo cambio real de
// datos: el filtro de búsqueda re-crea arrays pero NO clona los platos) o
// callbacks estables (la página los delega vía ref). Un render de página por
// puntero/aviso/búsqueda NO re-renderiza las filas.
// El wrapper .card y el montaje del panel de edición viven en CategoriaSection
// (el panel es hermano de esta fila, no hijo).
function PlatoCard({
  plato,
  categoriaId,
  pIdx,
  totalPlatos,
  onToggleExpand,
  onMoverPlato,
  onToggleDisponible,
  onRequestDeletePlato,
}: {
  plato: PlatoRow
  categoriaId: string
  pIdx: number
  totalPlatos: number
  onToggleExpand: (platoId: string) => void
  onMoverPlato: (categoriaId: string, platoId: string, direccion: 'arriba' | 'abajo') => void
  onToggleDisponible: (categoriaId: string, platoId: string) => void
  onRequestDeletePlato: (categoriaId: string, platoId: string) => void
}) {
  return (
    <div
      onClick={() => onToggleExpand(plato.id)}
      style={{ padding: '12px', display: 'flex', gap: '12px', cursor: 'pointer' }}
    >
      <div style={{
        width: '52px', height: '52px', borderRadius: '8px', background: 'var(--bg-tertiary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '18px', fontWeight: 500, color: 'var(--text-tertiary)', flexShrink: 0,
        overflow: 'hidden',
      }}>
        {plato.foto_url ? (
          <img src={plato.foto_url} alt={plato.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : plato.nombre.charAt(0)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div style={{ fontSize: '13px', fontWeight: 500 }}>{plato.nombre}</div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {/* Flechas mover plato */}
            <span onClick={(e) => { e.stopPropagation(); onMoverPlato(categoriaId, plato.id, 'arriba') }}
              style={{ fontSize: '9px', cursor: pIdx > 0 ? 'pointer' : 'default', color: pIdx > 0 ? 'var(--text-secondary)' : 'var(--border-light)', padding: '2px' }}>▲</span>
            <span onClick={(e) => { e.stopPropagation(); onMoverPlato(categoriaId, plato.id, 'abajo') }}
              style={{ fontSize: '9px', cursor: pIdx < totalPlatos - 1 ? 'pointer' : 'default', color: pIdx < totalPlatos - 1 ? 'var(--text-secondary)' : 'var(--border-light)', padding: '2px' }}>▼</span>
            <span onClick={(e) => { e.stopPropagation(); onToggleDisponible(categoriaId, plato.id) }}
              style={{ fontSize: '11px', color: 'var(--color-info)', cursor: 'pointer', marginLeft: '4px' }}>
              {plato.disponible ? 'Agotar' : 'Activar'}
            </span>
            <span onClick={(e) => {
              e.stopPropagation()
              onRequestDeletePlato(categoriaId, plato.id)
            }}
              style={{ fontSize: '11px', color: 'var(--color-danger)', cursor: 'pointer' }}>✕</span>
          </div>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
          {plato.variantes && plato.variantes.length > 0 ? 'desde ' : ''}${formatoPrecio(plato.precio)}
          {plato.descripcion && <span style={{ marginLeft: '6px', color: 'var(--text-tertiary)' }}>· {plato.descripcion.length > 30 ? plato.descripcion.slice(0, 30) + '...' : plato.descripcion}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px' }}>
          <span className={`badge ${plato.disponible ? 'badge-success' : 'badge-danger'}`}>
            {plato.disponible ? 'Disponible' : 'Agotado'}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>toca para editar</span>
        </div>
      </div>
    </div>
  )
}

export default memo(PlatoCard)
