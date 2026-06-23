'use client'

import Modal from '@/components/ui/Modal'
import { formatoPrecio } from '@/lib/precio'
import { tintPlaceholder } from '@/lib/brandTints'

// Modal de detalle de combo del menú público. Recibe el combo YA enriquecido
// (comboPlatosEnriquecidos vía enriquecerComboPlatos). `categorias` solo
// alimenta el fallback defensivo de Task 7. Agregar escribe al carrito vía
// onAgregar(combo.id) y luego cierra.
export default function ComboDetalleModal({
  combo,
  categorias,
  color,
  esBasicoPublico,
  themeClass,
  onAgregar,
  onClose,
}: {
  combo: any
  categorias: any[]
  color: string
  esBasicoPublico: boolean
  themeClass: string
  onAgregar: (cartKey: string) => void
  onClose: () => void
}) {
  // F8.5a — preferir los platos enriquecidos (con variante + precio efectivo).
  const enriquecidos = combo.comboPlatosEnriquecidos
  const tieneEnriquecidos = Array.isArray(enriquecidos) && enriquecidos.length > 0

  // Fallback defensivo (Task 7): si por algún motivo no hay datos
  // enriquecidos, reconstruir desde categorías y usar el precio
  // individual almacenado — preserva el comportamiento previo.
  const platosDelCombo = tieneEnriquecidos
    ? enriquecidos
    : categorias
        .flatMap((c: any) => c.platos)
        .filter((p: any) => combo.platosIds?.includes(p.id))

  // Strategy B: recomputar precio individual desde los platos del combo.
  const precioIndividual = tieneEnriquecidos
    ? enriquecidos.reduce((sum: number, p: any) => sum + (p.precioEfectivo || 0), 0)
    : combo.precioIndividual

  const ahorro = precioIndividual - combo.precio
  const porcentajeAhorro = precioIndividual > 0
    ? Math.round((ahorro / precioIndividual) * 100)
    : 0

  return (
    <Modal
      isOpen={!!combo}
      onClose={onClose}
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
          }}>🍱 {combo.nombre}</span>
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
        <span onClick={onClose} className="tap-control" style={{
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
        {combo.descripcion && (
          <div style={{
            fontSize: '13px',
            color: 'var(--theme-text-muted)',
            marginBottom: '16px',
            lineHeight: 1.5,
            overflowWrap: 'break-word',
          }}>
            {combo.descripcion}
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
              background: tintPlaceholder(color),
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
                Precio individual: ${formatoPrecio(plato.precioEfectivo ?? plato.precio)}
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
            <span style={{ textDecoration: 'line-through' }}>${formatoPrecio(precioIndividual)}</span>
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
            <span style={{ color: color }}>${formatoPrecio(combo.precio)}</span>
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
            <span>${formatoPrecio(ahorro)}</span>
          </div>
        </div>

        {/* Botón agregar al pedido */}
        <div onClick={() => {
          onAgregar(combo.id)
          onClose()
        }} className="tap-cta" style={{
          background: color,
          color: 'white',
          borderRadius: 'var(--theme-radius-button)',
          padding: '16px',
          textAlign: 'center',
          fontSize: '15px',
          fontWeight: 500,
          cursor: 'pointer',
        }}>
          Agregar combo al pedido · ${formatoPrecio(combo.precio)}
        </div>
      </div>
    </Modal>
  )
}
