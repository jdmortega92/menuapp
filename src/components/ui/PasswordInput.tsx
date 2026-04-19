'use client'

import { useState } from 'react'
import { validatePassword } from '@/lib/passwordValidation'

interface PasswordInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  showValidation?: boolean
  autoFocus?: boolean
  disabled?: boolean
}

export default function PasswordInput({
  value,
  onChange,
  placeholder = 'Contraseña',
  showValidation = false,
  autoFocus,
  disabled,
}: PasswordInputProps) {
  const [mostrar, setMostrar] = useState(false)

  const validation = validatePassword(value)

  return (
    <div style={{ width: '100%' }}>
      {/* Input con botón de visibilidad */}
      <div style={{ position: 'relative', width: '100%' }}>
        <input
          className="input"
          type={mostrar ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          autoComplete={showValidation ? 'new-password' : 'current-password'}
          style={{ paddingRight: '78px', width: '100%' }}
        />
        <button
          type="button"
          onClick={() => setMostrar(!mostrar)}
          tabIndex={-1}
          style={{
            position: 'absolute',
            right: '6px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'var(--bg-tertiary)',
            border: 'none',
            cursor: 'pointer',
            padding: '6px 10px',
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--color-info)',
            fontFamily: 'var(--font-body)',
            userSelect: 'none',
            borderRadius: '6px',
            zIndex: 2,
          }}
        >
          {mostrar ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>

      {/* Barra de fortaleza + checklist (solo si showValidation=true) */}
      {showValidation && value.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          {/* Barra de fortaleza */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '10px',
          }}>
            <div style={{
              flex: 1,
              height: '4px',
              background: 'var(--border-light)',
              borderRadius: '2px',
              overflow: 'hidden',
              display: 'flex',
              gap: '2px',
            }}>
              {[0, 1, 2].map(i => {
                const activos = validation.strength === 'debil' ? 1
                  : validation.strength === 'media' ? 2
                  : validation.strength === 'fuerte' ? 3
                  : 0
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      background: i < activos ? validation.strengthColor : 'var(--border-light)',
                      borderRadius: '2px',
                      transition: 'background 0.2s',
                    }}
                  />
                )
              })}
            </div>
            <span style={{
              fontSize: '11px',
              fontWeight: 500,
              color: validation.strengthColor,
              minWidth: '48px',
              textAlign: 'right',
            }}>
              {validation.strengthLabel}
            </span>
          </div>

          {/* Checklist de requisitos */}
          <div style={{
            background: 'var(--bg-tertiary)',
            borderRadius: '8px',
            padding: '10px 12px',
          }}>
            {validation.requirements.map(req => (
              <div
                key={req.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '11px',
                  lineHeight: 1.6,
                  color: req.cumple ? '#2E7D32' : 'var(--text-secondary)',
                  transition: 'color 0.2s',
                }}
              >
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  background: req.cumple ? '#2E7D32' : 'var(--border-light)',
                  color: 'white',
                  fontSize: '9px',
                  fontWeight: 700,
                  flexShrink: 0,
                  transition: 'background 0.2s',
                }}>
                  {req.cumple ? '✓' : ''}
                </span>
                {req.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}