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
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 440,
  showClose = true,
  noPadding = false,
}: ModalProps) {
  const [esDesktop, setEsDesktop] = useState(false)

  // Detectar tamaño de pantalla
  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 640px)')
    setEsDesktop(mediaQuery.matches)

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

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 60,
          animation: 'fadeIn 0.2s ease',
        }}
      />

      {/* Contenedor del modal */}
      <div
        style={{
          position: 'fixed',
          zIndex: 70,
          ...(esDesktop ? {
            // ===== DESKTOP: Centrado =====
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '90%',
            minWidth: '320px',
            maxWidth: `${maxWidth}px`,
            maxHeight: '85vh',
            background: 'var(--bg-secondary)',
            borderRadius: '14px',
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
            background: 'var(--bg-secondary)',
            borderRadius: '16px 16px 0 0',
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
            borderBottom: title ? '1px solid var(--border-light)' : 'none',
          }}>
            {title ? (
              <span style={{
                fontSize: esDesktop ? '16px' : '15px',
                fontWeight: 500,
                color: 'var(--text-primary)',
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
                  color: 'var(--text-tertiary)',
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
    </>
  )
}