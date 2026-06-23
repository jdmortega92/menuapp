'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import Modal from '@/components/ui/Modal'
import TimePicker from '@/components/ui/TimePicker'
import TimeRangeHelper from '@/components/ui/TimeRangeHelper'
import { formato12h } from '@/lib/time'

// ── HorarioCategoriaModal — horario de visibilidad de una categoría (Fase 3) ──
// Fresh-mount por apertura: la página conserva solo el puntero horarioCategoria
// y siembra inicio/fin desde la categoría vía props. `afectados` llega YA
// COMPUTADO por la página (detectarAfectados lee categorias/combos/promos/
// día/sorpréndeme — no depende de las horas elegidas, solo se MUESTRA cuando
// ambas están puestas, igual que antes). Sin memo: modal condicional de vida
// corta. El guardado (update + mutate + tick) vive aquí; onClose desmonta.
function HorarioCategoriaModal({
  catId,
  catNombre,
  inicioInicial,
  finInicial,
  afectados,
  mutateCategoriasYPlatos,
  onClose,
}: {
  catId: string
  catNombre: string
  inicioInicial: string
  finInicial: string
  afectados: string[]
  mutateCategoriasYPlatos: () => Promise<unknown>
  onClose: () => void
}) {
  const [inicio, setInicio] = useState(inicioInicial)
  const [fin, setFin] = useState(finInicial)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  async function guardar() {
    setGuardando(true)
    const supabase = createClient()
    await supabase.from('categorias').update({
      hora_inicio: inicio || null,
      hora_fin: fin || null,
    }).eq('id', catId)
    await mutateCategoriasYPlatos()
    setGuardando(false)
    setGuardado(true)
    setTimeout(() => onClose(), 1200)
  }

  const avisoHorario = inicio && fin ? afectados : []
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Horario de "${catNombre}"`}
      maxWidth={500}
    >
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
        Define en qué horario esta categoría es visible en el menú. Déjalo vacío para que se muestre siempre.
      </div>

      <div style={{ marginBottom: '14px' }}>
        <label className="label">Horario de visibilidad</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
          <TimePicker
            value={inicio}
            onChange={(v) => setInicio(v)}
          />
          <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>—</span>
          <TimePicker
            value={fin}
            onChange={(v) => setFin(v)}
          />
        </div>
        <TimeRangeHelper
          start={inicio}
          end={fin}
          verb={`"${catNombre}" visible`}
        />
      </div>

      {avisoHorario.length > 0 && (
        <div style={{ marginBottom: '14px', background: 'var(--color-warning-light)', border: '1px solid var(--color-warning)', borderRadius: 'var(--radius-sm)', padding: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-warning)', marginBottom: '8px' }}>
            Esto afectará otras funciones
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
            Al asignar horario a "{catNombre}", lo siguiente solo será visible de {formato12h(inicio)} a {formato12h(fin)}:
          </div>
          {avisoHorario.map((a, i) => (
            <div key={i} style={{ fontSize: '12px', color: 'var(--text-primary)', padding: '6px 0', borderBottom: i < avisoHorario.length - 1 ? '1px solid var(--border-light)' : 'none', display: 'flex', gap: '6px', alignItems: 'start' }}>
              <span style={{ color: 'var(--color-warning)' }}>⚠</span>
              <span>{a}</span>
            </div>
          ))}
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '10px' }}>
            Puedes revisar combos, promos y sorpréndeme después si necesitas ajustarlos.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={guardar}
          disabled={guardando}
          className="btn-primary"
          style={{ flex: 1, padding: '12px', fontSize: '13px' }}
        >
          {guardando ? 'Guardando...' : guardado ? '✓ Guardado' : 'Guardar'}
        </button>
        <button
          onClick={() => { setInicio(''); setFin('') }}
          className="btn-outline"
          style={{ padding: '12px 16px', fontSize: '13px' }}
        >
          Limpiar
        </button>
      </div>
    </Modal>
  )
}

export default HorarioCategoriaModal
