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
//
// CONFIRM-SUSCRIPCION: las etiquetas de los dos botones son PROPS OPCIONALES
// con el default de siempre, asi que ningun call site anterior cambia. Hicieron
// falta porque las acciones de suscripcion no son borrados: "Sí, eliminar" seria
// copy MENTIROSO al cancelar un plan (no se elimina nada, se agenda un cambio),
// y en esa hoja el neutro tiene que dejar de llamarse "Cancelar" — al lado de
// "cancelar la suscripción" las dos palabras significarian cosas opuestas.
export default function ConfirmarEliminar({
  titulo,
  nombre,
  textoPeligro = 'Esta acción no se puede deshacer.',
  textoConfirmar = 'Sí, eliminar',
  textoCancelar = 'Cancelar',
  onConfirm,
  onClose,
  children,
}: {
  titulo: string
  nombre: string
  textoPeligro?: string
  textoConfirmar?: string
  textoCancelar?: string
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
          {textoConfirmar}
        </Boton>
        <Boton variante="secundario" onClick={onClose} style={{ flex: 1 }}>
          {textoCancelar}
        </Boton>
      </div>
    </Modal>
  )
}
