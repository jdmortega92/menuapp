'use client'

import type { CSSProperties } from 'react'
import { Plus, Minus } from 'lucide-react'
import Icono from '@/components/ui/Icono'
import Modal from '@/components/ui/Modal'
import { formatoPrecio } from '@/lib/precio'
import { textoSobre } from '@/lib/temaColor'

// Modal "Tu pedido" del menú público. El estado mostrarPedido vive en la página
// (llega como isOpen). CTA según contexto: QR → mostrar al mesero; web con
// WhatsApp activo → pedir por WhatsApp (onPedir NO cierra el modal, igual que
// siempre); web sin WhatsApp → mostrar en caja.
export default function PedidoModal({
  isOpen,
  onClose,
  itemsPedido,
  totalPedido,
  nota,
  setNota,
  onAgregar,
  onQuitar,
  onPedir,
  esQR,
  qrMesa,
  color,
  themeClass,
  themeStyle,
  whatsappActivo,
}: {
  isOpen: boolean
  onClose: () => void
  itemsPedido: Array<{ plato: any; variante?: any; cantidad: number; promo?: { precioUnitario: number; etiqueta: string }; cartKey: string }>
  totalPedido: number
  nota: string
  setNota: (v: string) => void
  onAgregar: (cartKey: string) => void
  onQuitar: (cartKey: string) => void
  onPedir: () => void
  esQR: boolean
  qrMesa: string | null
  color: string
  themeClass: string
  themeStyle: CSSProperties
  whatsappActivo: boolean | undefined
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tu pedido"
      maxWidth={500}
      noPadding
      themeClass={themeClass}
      themeStyle={themeStyle}
    >
      {esQR && (
        <div style={{ padding: '12px 20px', background: 'var(--tema-info-fondo)', fontSize: '12px', color: 'var(--tema-info)' }}>
          Mesa {qrMesa?.replace('mesa', '')} · Muéstrale este resumen al mesero
        </div>
      )}
      <div style={{ padding: '16px 20px' }}>
        {itemsPedido.map((item: any) => (
          <div key={item.cartKey} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 0',
            borderBottom: '1px solid var(--theme-border)',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--theme-text)',
                fontFamily: 'var(--theme-font-body)',
              }}>
                {item.plato.nombre}{item.variante ? ` · ${item.variante.nombre}` : ''}
              </div>
              <div style={{
                fontSize: '12px',
                color: 'var(--theme-text-muted)',
                fontFamily: 'var(--theme-font-body)',
              }}>
                {item.promo ? (
                  <><span style={{ textDecoration: 'line-through', marginRight: '4px' }}>${formatoPrecio(item.variante ? item.variante.precio : item.plato.precio)}</span><span style={{ color: color, fontWeight: 500 }}>${formatoPrecio(item.promo.precioUnitario)} c/u</span> <span style={{ fontSize: '10px', color: 'var(--tema-ok)' }}>({item.promo.etiqueta})</span></>
                ) : `$${formatoPrecio(item.variante ? item.variante.precio : item.plato.precio)} c/u`}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button type="button" onClick={() => onQuitar(item.cartKey)} aria-label="Quitar uno" className="tap-control tap-target-44" style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                border: '1px solid var(--theme-border)',
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--theme-text-muted)',
              }}><Icono icono={Minus} size={14} /></button>
              <span style={{
                fontSize: '14px',
                fontWeight: 500,
                minWidth: '16px',
                textAlign: 'center',
                color: 'var(--theme-text)',
                fontFamily: 'var(--theme-font-body)',
              }}>
                {item.cantidad}
              </span>
              <button type="button" onClick={() => onAgregar(item.cartKey)} aria-label="Agregar uno" className="tap-control tap-target-44" style={{ width: '26px', height: '26px', borderRadius: '50%', border: 'none', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: textoSobre(color), cursor: 'pointer' }}><Icono icono={Plus} size={14} /></button>
            </div>
            <div style={{
              fontSize: '13px',
              fontWeight: 500,
              minWidth: '70px',
              textAlign: 'right',
              color: 'var(--theme-text)',
              fontFamily: 'var(--theme-font-body)',
            }}>
              ${formatoPrecio((item.promo ? item.promo.precioUnitario : (item.variante ? item.variante.precio : item.plato.precio)) * item.cantidad)}
            </div>
          </div>
        ))}
        <div style={{ marginTop: '14px' }}>
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder={esQR ? 'Nota para el mesero (opcional)' : 'Nota para el restaurante (opcional)'}
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
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '16px',
          paddingTop: '14px',
          borderTop: '1px solid var(--theme-border)',
        }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--theme-text)', fontFamily: 'var(--theme-font-body)' }}>Total</span>
          <span style={{ fontSize: '20px', fontWeight: 500, color: 'var(--theme-text)', fontFamily: 'var(--theme-font-body)' }}>${formatoPrecio(totalPedido)}</span>
        </div>
        {esQR ? (
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <div style={{
              background: 'var(--theme-text)',
              color: 'var(--theme-bg)',
              borderRadius: 'var(--theme-radius-button)',
              padding: '16px',
              fontSize: '15px',
              fontWeight: 500,
              cursor: 'pointer',
            }}>
              Mostrar al mesero
            </div>
            <div style={{ fontSize: '11px', color: 'var(--theme-text-subtle)', marginTop: '8px' }}>El mesero tomará tu pedido desde esta pantalla</div>
          </div>
        ) : whatsappActivo ? (
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <div onClick={onPedir} className="tap-cta" style={{
              background: '#25D366',
              // Verde de WhatsApp intacto; texto oscuro (~8.8:1) en vez de blanco (1.98:1).
              color: textoSobre('#25D366'),
              borderRadius: 'var(--theme-radius-button)',
              padding: '16px',
              fontSize: '15px',
              fontWeight: 500,
              cursor: 'pointer',
            }}>
              Pedir por WhatsApp
            </div>
            <div style={{ fontSize: '11px', color: 'var(--theme-text-subtle)', marginTop: '8px' }}>Se abrirá WhatsApp con tu pedido listo</div>
          </div>
        ) : (
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <div style={{
              background: 'var(--theme-text)',
              color: 'var(--theme-bg)',
              borderRadius: 'var(--theme-radius-button)',
              padding: '16px',
              fontSize: '15px',
              fontWeight: 500,
            }}>
              Muestra este resumen en caja
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
