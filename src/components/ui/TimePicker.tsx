'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

interface TimePickerProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}

// Constantes del dropdown
const DROPDOWN_WIDTH = 180
const DROPDOWN_HEIGHT = 244
const MARGIN = 8

// useLayoutEffect en SSR falla; este wrapper lo evita
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export default function TimePicker({ value, onChange, disabled, placeholder }: TimePickerProps) {
  const [abierto, setAbierto] = useState(false)
  const [montado, setMontado] = useState(false)
  const [posicion, setPosicion] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Evitar SSR mismatch: solo renderizar portal en cliente
  useEffect(() => {
    setMontado(true)
  }, [])

  // Calcular posición del dropdown
  function calcularPosicion() {
    if (!triggerRef.current) return null

    const rect = triggerRef.current.getBoundingClientRect()
    const viewportH = window.innerHeight
    const viewportW = window.innerWidth

    // Decisión vertical
    const espacioAbajo = viewportH - rect.bottom
    const espacioArriba = rect.top
    let top: number

    if (espacioAbajo >= DROPDOWN_HEIGHT + MARGIN) {
      top = rect.bottom + 4
    } else if (espacioArriba >= DROPDOWN_HEIGHT + MARGIN) {
      top = rect.top - DROPDOWN_HEIGHT - 4
    } else {
      // No cabe bien ni arriba ni abajo: escoger el lado con más espacio
      if (espacioAbajo >= espacioArriba) {
        top = Math.max(MARGIN, viewportH - DROPDOWN_HEIGHT - MARGIN)
      } else {
        top = MARGIN
      }
    }

    // Decisión horizontal
    let left = rect.left
    if (left + DROPDOWN_WIDTH > viewportW - MARGIN) {
      left = viewportW - DROPDOWN_WIDTH - MARGIN
    }
    if (left < MARGIN) left = MARGIN

    return { top, left }
  }

  // Calcular posición ANTES de pintar (evita flash)
  useIsomorphicLayoutEffect(() => {
    if (abierto) {
      const nueva = calcularPosicion()
      if (nueva) setPosicion(nueva)
    } else {
      setPosicion(null)
    }
  }, [abierto])

  // Manejar clicks fuera y scroll — cerrar el dropdown
  useEffect(() => {
    if (!abierto) return

    function handleClickFuera(e: MouseEvent) {
      const target = e.target as Node
      // No cerrar si el click fue dentro del trigger o dentro del dropdown
      if (triggerRef.current?.contains(target)) return
      if (dropdownRef.current?.contains(target)) return
      setAbierto(false)
    }

    function handleScroll(e: Event) {
      // Si el scroll es dentro del dropdown (la columna de horas hace scroll), ignorar
      if (dropdownRef.current?.contains(e.target as Node)) return
      // Scroll externo = cerrar
      setAbierto(false)
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false)
    }

    function handleResize() {
      setAbierto(false)
    }

    // IMPORTANTE: usamos setTimeout para que el click que abrió el dropdown
    // termine de propagarse antes de registrar el listener.
    // Sin esto, el mismo click que abre también cierra (race condition).
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickFuera)
      document.addEventListener('keydown', handleEscape)
      window.addEventListener('scroll', handleScroll, true)
      window.addEventListener('resize', handleResize)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickFuera)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [abierto])

  // Parsear valor (tolera "HH:MM" y "HH:MM:SS")
  const partes = value ? value.split(':') : []
  const hh = partes[0] || '12'
  const mm = partes[1] || '00'
  const horaNum = parseInt(hh) || 0
  const esPM = horaNum >= 12
  const hora12 = horaNum === 0 ? 12 : horaNum > 12 ? horaNum - 12 : horaNum

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

  const estiloColumna = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  }

  const estiloSeparador = {
    width: '1px',
    background: 'var(--border-light)',
    margin: '4px 0',
  }

  function estiloOpcion(activo: boolean) {
    return {
      padding: '7px 10px',
      fontSize: '13px',
      borderRadius: '6px',
      cursor: 'pointer',
      textAlign: 'center' as const,
      background: activo ? 'var(--color-info)' : 'transparent',
      color: activo ? 'white' : 'var(--text-primary)',
      fontWeight: activo ? 600 : 400,
      transition: 'background 0.12s',
      userSelect: 'none' as const,
    }
  }

  // Dropdown que se renderizará en el portal
  const dropdown = abierto && !disabled && posicion && (
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: `${posicion.top}px`,
        left: `${posicion.left}px`,
        width: `${DROPDOWN_WIDTH}px`,
        zIndex: 9999,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-light)',
        borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        padding: '8px',
        display: 'flex',
        gap: '4px',
      }}
    >
      {/* Horas */}
      <div style={{ ...estiloColumna, maxHeight: '220px', overflowY: 'auto' }}>
        {horas.map(h => {
          const activo = hora12 === h
          return (
            <div
              key={h}
              onClick={() => actualizar(h, mm, esPM)}
              style={estiloOpcion(activo)}
              onMouseEnter={(e) => { if (!activo) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
              onMouseLeave={(e) => { if (!activo) e.currentTarget.style.background = 'transparent' }}
            >
              {h}
            </div>
          )
        })}
      </div>

      <div style={estiloSeparador} />

      {/* Minutos */}
      <div style={estiloColumna}>
        {minutos.map(m => {
          const activo = mm === m
          return (
            <div
              key={m}
              onClick={() => actualizar(hora12, m, esPM)}
              style={estiloOpcion(activo)}
              onMouseEnter={(e) => { if (!activo) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
              onMouseLeave={(e) => { if (!activo) e.currentTarget.style.background = 'transparent' }}
            >
              {m}
            </div>
          )
        })}
      </div>

      <div style={estiloSeparador} />

      {/* AM/PM */}
      <div style={estiloColumna}>
        {[
          { label: 'AM', esPM: false },
          { label: 'PM', esPM: true },
        ].map(opcion => {
          const activo = opcion.esPM === esPM
          return (
            <div
              key={opcion.label}
              onClick={() => actualizar(hora12, mm, opcion.esPM)}
              style={estiloOpcion(activo)}
              onMouseEnter={(e) => { if (!activo) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
              onMouseLeave={(e) => { if (!activo) e.currentTarget.style.background = 'transparent' }}
            >
              {opcion.label}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <>
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
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {textoVisible}
      </div>

      {/* Portal: renderizar dropdown directamente en body para escapar overflow/stacking */}
      {montado && dropdown && createPortal(dropdown, document.body)}
    </>
  )
}