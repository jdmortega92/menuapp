'use client'

import { useRef } from 'react'
import type { DiaSemana } from '@/types'

const DIAS: DiaSemana[] = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
const LABELS = ['L', 'M', 'Mi', 'J', 'V', 'S', 'D']

interface DiasSelectorProps {
  value: DiaSemana[]
  onChange: (dias: DiaSemana[]) => void
  onBlur?: () => void
  disabled?: boolean
}

export default function DiasSelector({ value, onChange, onBlur, disabled = false }: DiasSelectorProps) {
  const blurFiredRef = useRef(false)

  const handleClick = (dia: DiaSemana) => {
    if (disabled) return
    if (!blurFiredRef.current) {
      blurFiredRef.current = true
      onBlur?.()
    }
    const sel = value.includes(dia)
    onChange(sel ? value.filter((x) => x !== dia) : [...value, dia])
  }

  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      {DIAS.map((dia, i) => {
        const sel = value.includes(dia)
        return (
          <div
            key={dia}
            onClick={() => handleClick(dia)}
            className="tap-control"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              cursor: disabled ? 'default' : 'pointer',
              opacity: disabled ? 0.5 : 1,
              background: sel ? 'var(--text-primary)' : 'var(--bg-secondary)',
              color: sel ? 'white' : 'var(--text-secondary)',
              border: sel ? 'none' : '1px solid var(--border-light)',
            }}
          >
            {LABELS[i]}
          </div>
        )
      })}
    </div>
  )
}
