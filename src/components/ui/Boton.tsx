'use client'

import { useState } from 'react'
import type { ButtonHTMLAttributes, CSSProperties } from 'react'

// ── Boton — jerarquia de botones: SOLO aqui ──
// primario   = accion principal (relleno naranja de marca --color-accent; hover --color-primario-hover)
// secundario = accion de apoyo (outline neutro; sucesor de .btn-outline)
// terciario  = accion de texto inline (links de accion; naranja de marca).
//              tono='neutro' (solo terciario): gris en reposo, naranja al hover —
//              para acciones repetidas por fila que no deben gritar. Nota
//              2026-07 (polish de /menu): Agotar y + Plato volvieron a tono
//              marca como excepcion consciente (accion de estado / de
//              crecimiento del menu); hoy no queda consumidor de neutro, el
//              mecanismo se conserva para futuras acciones por fila.
//              tono='tonal' (solo terciario): fondo naranja suave
//              (--color-accent-light, ningun hex nuevo) + texto naranja —
//              accion constructiva con presencia sin el peso de un primario
//              (+ Plato, sweep 2 2026-07). Hover: mismo fondo, brightness.
// peligro    = destructivo IRREVERSIBLE (relleno danger; "Si, eliminar")
// oscuro     = accion seria pero REVERSIBLE (relleno neutro oscuro; "Desactivar...")
// Tokens en globals.css (:root): --radio-boton, --altura-boton(-sm),
// --transicion-ui, --color-primario-hover. El `style` del call site se aplica
// de ULTIMO y es SOLO para layout (width/flex/margin) — la jerarquia visual
// no se sobreescribe en los consumidores.
// Estados: hover (shift de fondo via estado), active (scale 0.98 via pointer),
// disabled (opacity .5 + cursor), focus-visible (regla global en globals.css).

type Variante = 'primario' | 'secundario' | 'terciario' | 'peligro' | 'oscuro'
type Tamano = 'normal' | 'sm'
type Tono = 'marca' | 'neutro' | 'tonal'

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

// Borde SIEMPRE en propiedades separadas (borderWidth/Style/Color): mezclar el
// shorthand `border` con `borderColor` en el rerender de hover dispara el
// warning de React de estilos shorthand/longhand.
const porVariante: Record<Variante, { reposo: CSSProperties; hover: CSSProperties }> = {
  primario: {
    // Blanco sobre #E85D24 ~= 3.5:1 — cumple WCAG para componentes UI /
    // texto grande; decision de marca de Julian para labels de boton.
    reposo: { background: 'var(--color-accent)', color: 'white', borderWidth: '1px', borderStyle: 'solid', borderColor: 'transparent' },
    hover: { background: 'var(--color-primario-hover)' },
  },
  secundario: {
    reposo: { background: 'transparent', color: 'var(--text-primary)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-light)' },
    hover: { background: 'var(--bg-tertiary)', borderColor: 'var(--border-medium)' },
  },
  terciario: {
    reposo: { background: 'transparent', color: 'var(--color-accent)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'transparent' },
    hover: { background: 'var(--color-accent-light)' },
  },
  peligro: {
    // Sin variable danger-hover en la paleta: el shift de hover es por filter
    // (ningun hex nuevo).
    reposo: { background: 'var(--color-danger)', color: 'white', borderWidth: '1px', borderStyle: 'solid', borderColor: 'transparent' },
    hover: { filter: 'brightness(0.94)' },
  },
  oscuro: {
    // Reversible pero serio: relleno neutro oscuro. Hover por filter (aclara
    // el negro de casa sin token nuevo).
    reposo: { background: 'var(--text-primary)', color: 'var(--bg-secondary)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'transparent' },
    hover: { filter: 'brightness(1.6)' },
  },
}

export default function Boton({
  variante = 'primario',
  tamano = 'normal',
  tono = 'marca',
  disabled,
  style,
  children,
  ...rest
}: {
  variante?: Variante
  tamano?: Tamano
  tono?: Tono
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const [hover, setHover] = useState(false)
  const [presionado, setPresionado] = useState(false)
  const base_v = porVariante[variante]
  // tono='neutro'/'tonal' solo alteran terciario: neutro = gris en reposo,
  // naranja al hover; tonal = fondo naranja suave permanente + texto naranja
  // (hover oscurece el fondo por filter — cero hex nuevos).
  const esNeutro = variante === 'terciario' && tono === 'neutro'
  const esTonal = variante === 'terciario' && tono === 'tonal'
  const v = esNeutro
    ? {
        reposo: { ...base_v.reposo, color: 'var(--text-secondary)' },
        hover: { ...base_v.hover, color: 'var(--color-accent)' },
      }
    : esTonal
      ? {
          reposo: { ...base_v.reposo, background: 'var(--color-accent-light)' },
          hover: { background: 'var(--color-accent-light)', filter: 'brightness(0.96)' },
        }
      : base_v
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
