'use client'

import { useEffect, useState } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  maxWidth?: number
  showClose?: boolean
  noPadding?: boolean
  /**
   * Clase de tema a aplicar al modal (ej: 'theme-claro', 'theme-oscuro').
   * Permite que el modal herede el sistema de variables de tema del menú público.
   * Si no se pasa, el modal usa los colores globales por defecto (útil para el admin).
   */
  themeClass?: string
  /**
   * Nivel de apilamiento del modal (modal stack). Por default 0 (z-index base 60/70).
   * Usa 1 para modales que deben aparecer encima de otro modal abierto.
   * Cada nivel suma 20 al z-index para mantener separación visual clara.
   */
  stackLevel?: number
}
export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 440,
  showClose = true,
  noPadding = false,
  themeClass,
  stackLevel = 0,
}: ModalProps) {
  // Inicialización perezosa: detecta la pantalla ANTES del primer render
  // Esto elimina el "flash" donde el modal aparece primero abajo y salta al centro
  const [esDesktop, setEsDesktop] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(min-width: 640px)').matches
  })

  // Escuchar cambios dinámicos de tamaño de pantalla
  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 640px)')
    const handler = (e: MediaQueryListEvent) => setEsDesktop(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  // Cerrar con tecla Escape
  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Bloquear scroll del body cuando el modal está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [isOpen])

  if (!isOpen) return null

  // Resuelve los colores de fondo, texto y bordes:
  // - Si hay themeClass: usa variables de tema (se adaptan al contenedor temático)
  // - Si no hay themeClass: usa variables globales (comportamiento legacy para admin)
  const usarTema = !!themeClass
  const backgroundModal = usarTema ? 'var(--theme-surface)' : 'var(--bg-secondary)'
  const colorTexto = usarTema ? 'var(--theme-text)' : 'var(--text-primary)'
  const colorTextoSubtle = usarTema ? 'var(--theme-text-subtle)' : 'var(--text-tertiary)'
  const colorBorder = usarTema ? 'var(--theme-border)' : 'var(--border-light)'
  const radioModal = usarTema ? 'var(--theme-radius-modal)' : '14px'
  const radioMobile = usarTema ? 'var(--theme-radius-modal) var(--theme-radius-modal) 0 0' : '16px 16px 0 0'

  // Z-index dinámicos: cada nivel suma 20 al base (60 backdrop, 70 contenedor)
  // Nivel 0: backdrop=60, contenedor=70 (default)
  // Nivel 1: backdrop=80, contenedor=90 (modal encima de otro modal)
  // Nivel 2: backdrop=100, contenedor=110 (modal triple-apilado, caso raro)
  const zIndexBackdrop = 60 + (stackLevel * 20)
  const zIndexContainer = 70 + (stackLevel * 20)

  return (
    <div className={themeClass}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: zIndexBackdrop,
          animation: 'fadeIn 0.2s ease',
        }}
      />

      {/* Contenedor del modal */}
      <div
        style={{
          position: 'fixed',
          zIndex: zIndexContainer,
          ...(esDesktop ? {
            // ===== DESKTOP: Centrado =====
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '90%',
            minWidth: '320px',
            maxWidth: `${maxWidth}px`,
            maxHeight: '85vh',
            background: backgroundModal,
            borderRadius: radioModal,
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25)',
            overflow: 'auto',
            animation: 'modalFadeScale 0.25s ease-out',
          } : {
            // ===== MOBILE: Bottom sheet =====
            bottom: 0,
            left: 0,
            right: 0,
            minWidth: '320px',
            maxWidth: '500px',
            margin: '0 auto',
            background: backgroundModal,
            borderRadius: radioMobile,
            maxHeight: '85vh',
            overflow: 'auto',
            animation: 'slideUp 0.3s ease',
          }),
        }}
      >
        {/* Header con título y botón de cerrar */}
        {(title || showClose) && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: esDesktop ? '20px 24px 16px' : '20px 20px 16px',
            borderBottom: title ? `1px solid ${colorBorder}` : 'none',
          }}>
            {title ? (
              <span style={{
                fontSize: esDesktop ? '16px' : '15px',
                fontWeight: usarTema ? ('var(--theme-title-weight)' as any) : 500,
                fontFamily: usarTema ? 'var(--theme-font-display)' : 'var(--font-body)',
                letterSpacing: usarTema ? 'var(--theme-title-letter-spacing)' : 'normal',
                textTransform: usarTema ? ('var(--theme-title-transform)' as any) : 'none',
                color: colorTexto,
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                paddingRight: '12px',
              }}>
                {title}
              </span>
            ) : <span style={{ flex: 1 }} />}
            {showClose && (
              <button
                onClick={onClose}
                aria-label="Cerrar"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '18px',
                  color: colorTextoSubtle,
                  padding: '4px 8px',
                  borderRadius: '6px',
                  lineHeight: 1,
                  fontFamily: 'var(--font-body)',
                }}
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Contenido */}
        <div style={{ padding: noPadding ? 0 : (esDesktop ? '16px 24px 24px' : '0 20px 20px') }}>
          {children}
        </div>
      </div>

      {/* Animaciones */}
      <style jsx global>{`
        @keyframes modalFadeScale {
          from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  )
}