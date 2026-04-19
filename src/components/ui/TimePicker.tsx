'use client'

import { useState, useRef, useEffect } from 'react'

interface TimePickerProps {
  value: string  // Formato "HH:MM" o "HH:MM:SS" en 24h
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}

export default function TimePicker({ value, onChange, disabled, placeholder }: TimePickerProps) {
  const [abierto, setAbierto] = useState(false)
  const [dropdownArriba, setDropdownArriba] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false)
    }
    if (abierto) {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleEscape)
    }
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [abierto])

  // Detectar si hay espacio abajo o hay que abrir hacia arriba
  useEffect(() => {
    if (abierto && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const espacioAbajo = window.innerHeight - rect.bottom
      setDropdownArriba(espacioAbajo < 280)
    }
  }, [abierto])

  // Parsear valor actual (tolera HH:MM y HH:MM:SS)
  const partes = value ? value.split(':') : []
  const hh = partes[0] || '12'
  const mm = partes[1] || '00'
  const horaNum = parseInt(hh) || 0
  const esPM = horaNum >= 12
  const hora12 = horaNum === 0 ? 12 : horaNum > 12 ? horaNum - 12 : horaNum

  // Texto visible en el trigger
  const textoVisible = value
    ? `${hora12}:${mm.padStart(2, '0')} ${esPM ? 'p.m.' : 'a.m.'}`
    : (placeholder || 'Seleccionar')

  function actualizar(h12: number, minutos: string, pm: boolean) {
    let h24 = h12
    if (pm && h12 !== 12) h24 += 12
    if (!pm && h12 === 12) h24 = 0
    const valor = `${String(h24).padStart(2, '0')}:${minutos}`
    onChange(valor)
  }

  const horas = Array.from({ length: 12 }, (_, i) => i + 1)
  const minutos = ['00', '15', '30', '45']

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger: caja que muestra la hora actual */}
      <div
        ref={triggerRef}
        onClick={() => !disabled && setAbierto(!abierto)}
        style={{
          padding: '7px 12px',
          fontSize: '12px',
          border: `1px solid ${abierto ? 'var(--color-info)' : 'var(--border-light)'}`,
          borderRadius: '8px',
          background: disabled ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
          color: value ? 'var(--text-primary)' : 'var(--text-tertiary)',
          cursor: disabled ? 'default' : 'pointer',
          minWidth: '92px',
          textAlign: 'center',
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
          userSelect: 'none',
          transition: 'border-color 0.15s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
        }}
      >
        <span>{textoVisible}</span>
      </div>

      {/* Dropdown con las 3 columnas */}
      {abierto && !disabled && (
        <div style={{
          position: 'absolute',
          [dropdownArriba ? 'bottom' : 'top']: 'calc(100% + 4px)',
          left: 0,
          zIndex: 100,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-light)',
          borderRadius: '10px',
          boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
          padding: '8px',
          display: 'flex',
          gap: '4px',
        }}>
          {/* Columna: horas */}
          <div style={{
            maxHeight: '200px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            scrollbarWidth: 'thin',
          }}>
            {horas.map(h => {
              const activo = hora12 === h
              return (
                <div
                  key={h}
                  onClick={() => actualizar(h, mm, esPM)}
                  style={{
                    padding: '7px 14px',
                    fontSize: '13px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    minWidth: '38px',
                    background: activo ? 'var(--color-info)' : 'transparent',
                    color: activo ? 'white' : 'var(--text-primary)',
                    fontWeight: activo ? 600 : 400,
                    transition: 'background 0.12s',
                    userSelect: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!activo) e.currentTarget.style.background = 'var(--bg-tertiary)'
                  }}
                  onMouseLeave={(e) => {
                    if (!activo) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {h}
                </div>
              )
            })}
          </div>

          {/* Separador visual */}
          <div style={{
            width: '1px',
            background: 'var(--border-light)',
            margin: '4px 0',
          }} />

          {/* Columna: minutos */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}>
            {minutos.map(m => {
              const activo = mm === m
              return (
                <div
                  key={m}
                  onClick={() => actualizar(hora12, m, esPM)}
                  style={{
                    padding: '7px 14px',
                    fontSize: '13px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    minWidth: '38px',
                    background: activo ? 'var(--color-info)' : 'transparent',
                    color: activo ? 'white' : 'var(--text-primary)',
                    fontWeight: activo ? 600 : 400,
                    transition: 'background 0.12s',
                    userSelect: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!activo) e.currentTarget.style.background = 'var(--bg-tertiary)'
                  }}
                  onMouseLeave={(e) => {
                    if (!activo) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {m}
                </div>
              )
            })}
          </div>

          {/* Separador visual */}
          <div style={{
            width: '1px',
            background: 'var(--border-light)',
            margin: '4px 0',
          }} />

          {/* Columna: AM/PM */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}>
            {[
              { label: 'AM', esPM: false },
              { label: 'PM', esPM: true },
            ].map(opcion => {
              const activo = opcion.esPM === esPM
              return (
                <div
                  key={opcion.label}
                  onClick={() => actualizar(hora12, mm, opcion.esPM)}
                  style={{
                    padding: '7px 14px',
                    fontSize: '13px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    minWidth: '38px',
                    background: activo ? 'var(--color-info)' : 'transparent',
                    color: activo ? 'white' : 'var(--text-primary)',
                    fontWeight: activo ? 600 : 400,
                    transition: 'background 0.12s',
                    userSelect: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!activo) e.currentTarget.style.background = 'var(--bg-tertiary)'
                  }}
                  onMouseLeave={(e) => {
                    if (!activo) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {opcion.label}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}