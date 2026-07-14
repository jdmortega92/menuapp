'use client'

import { usePathname, useRouter } from 'next/navigation'

/**
 * Estructura de un item del nav inferior.
 */
interface NavItem {
  /** Ruta a la que navega */
  href: string
  /** Etiqueta visible debajo del icono */
  label: string
  /** SVG del icono en estado outline (inactivo) */
  iconOutline: React.ReactNode
  /** SVG del icono en estado filled (activo) */
  iconFilled: React.ReactNode
}

/**
 * Componente de navegación inferior estilo Instagram/Facebook.
 *
 * Características:
 * - Iconos SVG minimalistas tipo line-art (outline cuando inactivo, filled cuando activo)
 * - Detección automática de ruta activa con usePathname()
 * - Feedback táctil al tocar (escala 0.95)
 * - Animación suave al cambiar de tab
 * - Stroke uniforme de 1.75px para sensación pulida
 * - Reemplaza las 4 copias del nav que estaban duplicadas en cada página
 */
export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  const items: NavItem[] = [
    {
      href: '/dashboard',
      label: 'Inicio',
      iconOutline: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z" />
        </svg>
      ),
      iconFilled: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z" />
        </svg>
      ),
    },
    {
      href: '/menu',
      label: 'Menú',
      iconOutline: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      ),
      iconFilled: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      ),
    },
    {
      href: '/qr',
      label: 'QR',
      iconOutline: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <line x1="14" y1="14" x2="14" y2="17" />
          <line x1="14" y1="20" x2="14" y2="21" />
          <line x1="17" y1="14" x2="21" y2="14" />
          <line x1="17" y1="17" x2="17" y2="21" />
          <line x1="20" y1="17" x2="21" y2="17" />
          <line x1="20" y1="20" x2="21" y2="20" />
        </svg>
      ),
      iconFilled: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0.5">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="3" height="3" rx="0.5" />
          <rect x="18" y="14" width="3" height="3" rx="0.5" />
          <rect x="14" y="18" width="3" height="3" rx="0.5" />
          <rect x="18" y="18" width="3" height="3" rx="0.5" />
        </svg>
      ),
    },
    {
      href: '/config',
      label: 'Config',
      iconOutline: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
      iconFilled: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          <circle cx="12" cy="12" r="3" fill="white" />
        </svg>
      ),
    },
  ]

  function esActivo(href: string): boolean {
    if (!pathname) return false
    // Coincidencia exacta o si la ruta empieza con el href (para sub-rutas)
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <nav
      role="navigation"
      aria-label="Navegación principal"
      style={{
        display: 'flex',
        borderTop: '1px solid var(--border-light)',
        background: 'var(--bg-secondary)',
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        maxWidth: '500px',
        minWidth: '320px',
        margin: '0 auto',
        // Soporte para safe-area en iPhones con notch
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {items.map((item) => {
        const activo = esActivo(item.href)
        return (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            aria-label={item.label}
            aria-current={activo ? 'page' : undefined}
            style={{
              flex: 1,
              padding: '10px 4px 8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: activo ? 'var(--color-accent)' : 'var(--text-tertiary)',
              fontFamily: 'var(--font-body)',
              transition: 'transform 0.15s ease, color 0.2s ease',
              position: 'relative',
              WebkitTapHighlightColor: 'transparent',
            }}
            onTouchStart={(e) => {
              e.currentTarget.style.transform = 'scale(0.92)'
            }}
            onTouchEnd={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.92)'
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            {/* Icono: filled si activo, outline si inactivo */}
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'opacity 0.2s ease',
              }}
              aria-hidden="true"
            >
              {activo ? item.iconFilled : item.iconOutline}
            </span>

            {/* Label */}
            <span
              style={{
                fontSize: '10px',
                fontWeight: activo ? 600 : 400,
                letterSpacing: '0.02em',
                transition: 'font-weight 0.2s ease',
              }}
            >
              {item.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}