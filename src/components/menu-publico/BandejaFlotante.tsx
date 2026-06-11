'use client'

import { formatoPrecio } from '@/lib/precio'

// Bandeja flotante "Ver pedido" del menú público. Se renderiza incondicional:
// el gate de visibilidad (totalProductos > 0 && !mostrarPedido && !platoDetalle)
// vive en la página. Higiene flex de BL.39: izquierda flex:1+minWidth:0 (el
// resumen trunca), derecha flexShrink:0+nowrap (precio y botón siempre enteros).
export default function BandejaFlotante({ totalProductos, itemsPedido, totalPedido, onOpen }: {
  totalProductos: number
  itemsPedido: Array<{ plato: any; variante?: any; cantidad: number }>
  totalPedido: number
  onOpen: () => void
}) {
  return (
    <div onClick={onOpen} style={{
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
      gap: '12px',
    }}>
      <div style={{ color: 'var(--theme-bg)', flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 500 }}>{totalProductos} producto{totalProductos > 1 ? 's' : ''}</div>
        <div style={{
          fontSize: '10px',
          opacity: 0.6,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, whiteSpace: 'nowrap' }}>
        <span style={{ color: 'var(--theme-bg)', fontWeight: 500 }}>${formatoPrecio(totalPedido)}</span>
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
  )
}
