'use client'

import type { ReactNode } from 'react'
import Modal from '@/components/ui/Modal'
import Boton from '@/components/ui/Boton'

// ── ConfirmarEliminar — hoja de confirmacion de borrado compartida ──
// Extraida del modal inline de platos de /menu (CONFIRM-BEFORE-DELETE):
// platos, categorias, combos y promos pasan TODOS por aqui — no forkear
// una segunda hoja. Estructura fija: titulo + nombre del item + children
// opcionales (vinculaciones, avisos de destacado) + texto de peligro +
// footer peligro/secundario. El cierre ocurre ANTES de onConfirm (mismo
// orden que el patron original: limpiar estado puntero, luego borrar).
export default function ConfirmarEliminar({
  titulo,
  nombre,
  textoPeligro = 'Esta acción no se puede deshacer.',
  onConfirm,
  onClose,
  children,
}: {
  titulo: string
  nombre: string
  textoPeligro?: string
  onConfirm: () => void
  onClose: () => void
  children?: ReactNode
}) {
  return (
    <Modal isOpen onClose={onClose} title={titulo} maxWidth={460}>
      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '12px' }}>
        {nombre || '(sin nombre)'}
      </div>

      {children}

      <div style={{ fontSize: '12px', color: 'var(--color-danger)', marginBottom: '16px' }}>
        {textoPeligro}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <Boton
          variante="peligro"
          onClick={() => {
            onClose()
            onConfirm()
          }}
          style={{ flex: 1 }}
        >
          Sí, eliminar
        </Boton>
        <Boton variante="secundario" onClick={onClose} style={{ flex: 1 }}>
          Cancelar
        </Boton>
      </div>
    </Modal>
  )
}
