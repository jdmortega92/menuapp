'use client'

import { formato12h } from '@/lib/time'

interface TimeRangeHelperProps {
  start: string | null | undefined
  end: string | null | undefined
  verb?: string
}

export default function TimeRangeHelper({ start, end, verb = 'Visible' }: TimeRangeHelperProps) {
  if (!start || !end) return null

  const s = start.slice(0, 5)
  const e = end.slice(0, 5)

  const baseStyle = {
    fontSize: '12px',
    marginTop: '6px',
    lineHeight: 1.4,
  }

  if (s === e) {
    return (
      <div style={{ ...baseStyle, color: 'var(--color-warning)' }}>
        ⚠️ La hora de inicio y fin son iguales — esta franja no será visible
      </div>
    )
  }

  const overnight = e < s
  const texto = overnight
    ? `${verb} de ${formato12h(s)} hasta las ${formato12h(e)} del día siguiente`
    : `${verb} de ${formato12h(s)} a ${formato12h(e)}`

  return (
    <div style={{ ...baseStyle, color: 'var(--text-secondary)' }}>
      {texto}
    </div>
  )
}
