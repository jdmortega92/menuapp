'use client'

import { useState } from 'react'
import type { ButtonHTMLAttributes, CSSProperties } from 'react'

// ── Boton — jerarquia de botones: SOLO aqui ──
// primario   = accion principal (relleno negro de casa; hover --color-primario-hover)
// secundario = accion de apoyo (outline neutro; sucesor de .btn-outline)
// terciario  = accion de texto inline (+ Plato, links de accion; hover lavado info)
// peligro    = destructivo (relleno danger; "Si, eliminar", "Desactivar...")
// Tokens en globals.css (:root): --radio-boton, --altura-boton(-sm),
// --transicion-ui, --color-primario-hover. El `style` del call site se aplica
// de ULTIMO y es SOLO para layout (width/flex/margin) — la jerarquia visual
// no se sobreescribe en los consumidores.
// Estados: hover (shift de fondo via estado), active (scale 0.98 via pointer),
// disabled (opacity .5 + cursor), focus-visible (regla global en globals.css).

type Variante = 'primario' | 'secundario' | 'terciario' | 'peligro'
type Tamano = 'normal' | 'sm'

const base: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  borderRadius: 'var(--radio-boton)',
  fontFamily: 'var(--font-body)',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  transition:
    'background var(--transicion-ui), border-color var(--transicion-ui), color var(--transicion-ui), transform var(--transicion-ui), opacity var(--transicion-ui), filter var(--transicion-ui)',
}

const porTamano: Record<Tamano, CSSProperties> = {
  normal: { height: 'var(--altura-boton)', padding: '0 20px', fontSize: '14px' },
  sm: { height: 'var(--altura-boton-sm)', padding: '0 14px', fontSize: '13px' },
}

const porVariante: Record<Variante, { reposo: CSSProperties; hover: CSSProperties }> = {
  primario: {
    reposo: { background: 'var(--text-primary)', color: 'var(--bg-secondary)', border: '1px solid transparent' },
    hover: { background: 'var(--color-primario-hover)' },
  },
  secundario: {
    reposo: { background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-light)' },
    hover: { background: 'var(--bg-tertiary)', borderColor: 'var(--border-medium)' },
  },
  terciario: {
    reposo: { background: 'transparent', color: 'var(--color-info)', border: '1px solid transparent' },
    hover: { background: 'var(--color-info-light)' },
  },
  peligro: {
    // Sin variable danger-hover en la paleta: el shift de hover es por filter
    // (ningun hex nuevo).
    reposo: { background: 'var(--color-danger)', color: 'white', border: '1px solid transparent' },
    hover: { filter: 'brightness(0.94)' },
  },
}

export default function Boton({
  variante = 'primario',
  tamano = 'normal',
  disabled,
  style,
  children,
  ...rest
}: {
  variante?: Variante
  tamano?: Tamano
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const [hover, setHover] = useState(false)
  const [presionado, setPresionado] = useState(false)
  const v = porVariante[variante]
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled}
      onMouseEnter={(e) => { setHover(true); rest.onMouseEnter?.(e) }}
      onMouseLeave={(e) => { setHover(false); setPresionado(false); rest.onMouseLeave?.(e) }}
      onPointerDown={(e) => { setPresionado(true); rest.onPointerDown?.(e) }}
      onPointerUp={(e) => { setPresionado(false); rest.onPointerUp?.(e) }}
      onPointerCancel={(e) => { setPresionado(false); rest.onPointerCancel?.(e) }}
      style={{
        ...base,
        ...porTamano[tamano],
        ...v.reposo,
        ...(hover && !disabled ? v.hover : null),
        transform: presionado && !disabled ? 'scale(0.98)' : 'none',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  )
}
