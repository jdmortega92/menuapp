'use client'

import { useState, useEffect, useRef } from 'react'
import type { CSSProperties, InputHTMLAttributes, ChangeEvent, FocusEvent, MutableRefObject } from 'react'

// ── CampoTexto — input de texto con borrador local (confirma al padre en blur) ──
// Mantiene su valor en estado LOCAL: cada tecla re-renderiza SÓLO este componente, no el
// árbol gigante de la página. Confirma hacia arriba con onCommit al perder el foco.
// Re-sincroniza desde `value` cuando cambia desde afuera (reset/seed/reorder) SIN pisar lo
// que se está tecleando. Soporta un contador de caracteres interno (showCounter + maxLength)
// que vive del estado local, así el contador queda en vivo sin re-renderizar al padre.
// Genérico: sin lógica de dominio — reutilizable en combos/promos/categorías.
export type CampoTextoProps = {
  value: string
  onCommit: (val: string) => void
  flushRegistry?: MutableRefObject<Set<() => void>>
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void
  showCounter?: boolean
  maxLength?: number
  warnAt?: number
  style?: CSSProperties
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'style' | 'maxLength'>

export default function CampoTexto({
  value, onCommit, flushRegistry, onBlur,
  showCounter = false, maxLength, warnAt, style, ...rest
}: CampoTextoProps) {
  const [local, setLocal] = useState(value ?? '')
  const focusedRef = useRef(false)
  // Snapshot vivo para el flush: lee siempre lo último sin re-registrar el listener.
  const latestRef = useRef({ local, value, onCommit })
  latestRef.current = { local, value, onCommit }

  // Re-sync desde el padre SÓLO si no estamos editando (no pisa el tecleo en curso).
  useEffect(() => {
    if (!focusedRef.current) setLocal(value ?? '')
  }, [value])

  // Registro de flush: confirma el borrador pendiente ante un guardado sin blur previo.
  useEffect(() => {
    if (!flushRegistry) return
    const set = flushRegistry.current
    const flush = () => {
      const cur = latestRef.current
      if (cur.local !== cur.value) cur.onCommit(cur.local)
    }
    set.add(flush)
    return () => { set.delete(flush) }
  }, [flushRegistry])

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    if (typeof maxLength === 'number' && v.length > maxLength) return
    setLocal(v)
  }
  function handleBlur(e: FocusEvent<HTMLInputElement>) {
    focusedRef.current = false
    if (local !== value) onCommit(local)
    onBlur?.(e)
  }

  return (
    <>
      <input
        {...rest}
        value={local}
        onChange={handleChange}
        onFocus={() => { focusedRef.current = true }}
        onBlur={handleBlur}
        style={style}
      />
      {showCounter && typeof maxLength === 'number' && (
        <span style={{
          position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
          fontSize: '10px',
          color: local.length > (warnAt ?? maxLength - 20) ? 'var(--color-warning)' : 'var(--text-tertiary)',
        }}>
          {local.length}/{maxLength}
        </span>
      )}
    </>
  )
}
