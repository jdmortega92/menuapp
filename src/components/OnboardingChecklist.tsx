'use client'

import { useState } from 'react'
import { Target, ChevronDown, Check, ArrowRight } from 'lucide-react'
import Icono from '@/components/ui/Icono'
import { useRouter } from 'next/navigation'
import type { OnboardingStatus } from '@/hooks/useOnboardingStatus'

interface OnboardingChecklistProps {
  /** Estado del onboarding obtenido del hook useOnboardingStatus */
  status: OnboardingStatus
}

/**
 * Widget flotante de onboarding con checklist de pasos.
 *
 * Se muestra solo si hay pasos pendientes y el usuario no ha cerrado el widget.
 * Detecta automáticamente el progreso del usuario sin requerir acción manual.
 *
 * Layout responsive:
 * - Mobile: Bottom sheet (pegado al borde inferior, full-width con max)
 * - Desktop: Panel flotante esquina inferior derecha (ancho 360px)
 *
 * Estados:
 * - Colapsado: Pill compacto mostrando progreso
 * - Expandido: Lista completa de pasos con barra de progreso
 */
export default function OnboardingChecklist({ status }: OnboardingChecklistProps) {
  const router = useRouter()
  const [expandido, setExpandido] = useState(false)
  const [confirmandoCierre, setConfirmandoCierre] = useState(false)

 

  // No renderizamos nada si el widget no debe mostrarse
  if (!status.mostrar) {
    
    return null
  }
  

  function manejarClickPaso(href: string) {
    setExpandido(false)
    router.push(href)
  }

  async function manejarCierre() {
    if (!confirmandoCierre) {
      setConfirmandoCierre(true)
      return
    }
    await status.cerrarWidget()
  }

  return (
    <>
      {/* Backdrop sutil cuando está expandido (solo mobile) */}
      {expandido && (
        <div
          onClick={() => setExpandido(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.3)',
            zIndex: 45,
            animation: 'fadeIn 0.2s ease',
          }}
          aria-hidden="true"
        />
      )}

      {/* Widget */}
      <div
        role="region"
        aria-label="Lista de pasos para completar tu menú"
        style={{
          position: 'fixed',
          bottom: '76px', // Por encima del bottom nav
          right: '16px',
          left: '16px',
          maxWidth: '420px',
          margin: '0 auto',
          zIndex: 50,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.15)',
          overflow: 'hidden',
          animation: 'slideUp 0.3s ease',
        }}
      >
        {/* Header (siempre visible, click para expandir/colapsar) */}
        <button
          onClick={() => {
            setExpandido(!expandido)
            setConfirmandoCierre(false)
          }}
          aria-expanded={expandido}
          aria-controls="onboarding-pasos"
          style={{
            width: '100%',
            padding: '14px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            color: 'var(--text-primary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, textAlign: 'left' }}>
            <span style={{ display: 'inline-flex', color: 'var(--color-info)' }} aria-hidden="true">
              <Icono icono={Target} size={20} />
            </span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 500 }}>
                Completa tu menú
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '1px' }}>
                {status.totalCompletados} de {status.totalPasos} pasos · {status.porcentaje}%
              </div>
            </div>
          </div>
          <span
            style={{
              display: 'inline-flex',
              color: 'var(--text-tertiary)',
              transition: 'transform 0.2s',
              transform: expandido ? 'rotate(180deg)' : 'none',
            }}
            aria-hidden="true"
          >
            <Icono icono={ChevronDown} size={16} />
          </span>
        </button>

        {/* Barra de progreso (siempre visible) */}
        <div
          style={{
            height: '3px',
            background: 'var(--border-light)',
            position: 'relative',
            overflow: 'hidden',
          }}
          role="progressbar"
          aria-valuenow={status.porcentaje}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progreso: ${status.porcentaje}%`}
        >
          <div
            style={{
              height: '100%',
              width: `${status.porcentaje}%`,
              background: 'var(--color-info)',
              transition: 'width 0.4s ease',
            }}
          />
        </div>

        {/* Contenido expandido (lista de pasos) */}
        {expandido && (
          <div
            id="onboarding-pasos"
            style={{
              borderTop: '1px solid var(--border-light)',
              animation: 'fadeInUp 0.2s ease',
            }}
          >
            {/* Lista de pasos */}
            <div style={{ padding: '6px 0' }}>
              {status.pasos.map((paso) => (
                <button
                  key={paso.id}
                  onClick={() => manejarClickPaso(paso.href)}
                  disabled={paso.completado}
                  aria-label={`${paso.titulo}${paso.completado ? ' (completado)' : ''}`}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: 'transparent',
                    border: 'none',
                    cursor: paso.completado ? 'default' : 'pointer',
                    textAlign: 'left',
                    fontFamily: 'var(--font-body)',
                    transition: 'background 0.15s ease',
                    opacity: paso.completado ? 0.65 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!paso.completado) {
                      e.currentTarget.style.background = 'var(--bg-tertiary)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {/* Indicador (check o número) */}
                  <div
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: paso.completado ? 'var(--color-green)' : 'var(--bg-tertiary)',
                      border: paso.completado ? 'none' : '1px solid var(--border-medium)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: paso.completado ? 'white' : 'var(--text-tertiary)',
                      fontSize: paso.completado ? '11px' : '10px',
                      fontWeight: 600,
                    }}
                    aria-hidden="true"
                  >
                    {paso.completado ? <Icono icono={Check} size={12} strokeWidth={3} /> : null}
                  </div>

                  {/* Texto del paso */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        textDecoration: paso.completado ? 'line-through' : 'none',
                      }}
                    >
                      {paso.titulo}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-tertiary)',
                        marginTop: '2px',
                      }}
                    >
                      {paso.descripcion}
                    </div>
                  </div>

                  {/* Flecha (solo en pasos pendientes) */}
                  {!paso.completado && (
                    <span
                      style={{
                        display: 'inline-flex',
                        color: 'var(--color-info)',
                        flexShrink: 0,
                      }}
                      aria-hidden="true"
                    >
                      <Icono icono={ArrowRight} size={14} />
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Footer: mensaje motivacional o cierre */}
            <div
              style={{
                padding: '12px 16px',
                borderTop: '1px solid var(--border-light)',
                background: 'var(--bg-tertiary)',
              }}
            >
              {confirmandoCierre ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    ¿Cerrar este checklist? No volverá a aparecer.
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={manejarCierre}
                      style={{
                        flex: 1,
                        padding: '8px',
                        fontSize: '12px',
                        fontWeight: 500,
                        background: 'var(--color-danger)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      Sí, cerrar
                    </button>
                    <button
                      onClick={() => setConfirmandoCierre(false)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        fontSize: '12px',
                        fontWeight: 500,
                        background: 'transparent',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {status.totalCompletados === status.totalPasos
                      ? '🎉 ¡Tu menú está listo!'
                      : 'Completa los pasos para activar todo el potencial'}
                  </div>
                  <button
                    onClick={() => setConfirmandoCierre(true)}
                    aria-label="Cerrar checklist permanentemente"
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-tertiary)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}