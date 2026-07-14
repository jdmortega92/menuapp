'use client'

import { memo, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import Icono from '@/components/ui/Icono'
import Boton from '@/components/ui/Boton'
import { createClient } from '@/lib/supabase-browser'
import Select from '@/components/ui/Select'
import TimePicker from '@/components/ui/TimePicker'
import TimeRangeHelper from '@/components/ui/TimeRangeHelper'
import DiasSelector from '@/components/ui/DiasSelector'
import { formato12h } from '@/lib/time'
import { formatoPrecio } from '@/lib/precio'
import { invalidateAll } from '@/lib/swr'
import { MAX_DESC, MAX_PRECIO } from './PlatoForm'
import type { DiaSemana, Variante } from '@/types'

type PlatoLite = {
  id: string
  nombre: string
  precio: number
  variantes?: Variante[]
}

// F8.5b — Combo item shape for admin form state
type ComboItem = {
  plato_id: string
  variante_id: string | null
}

// Validador de combo — module-level y puro (todosPlatos entra como parámetro;
// antes lo leía del closure de la página).
export function validarCombo(
  state: { nombre: string; precio: string; platoIds: ComboItem[] },
  todosPlatos: PlatoLite[],
): Record<string, string> {
  const e: Record<string, string> = {}
  if (!state.nombre.trim()) e.nombre = 'El nombre es obligatorio'
  const precioNum = parseInt(state.precio)
  if (!state.precio || isNaN(precioNum) || precioNum <= 0) e.precio = 'El precio debe ser mayor a 0'
  else if (precioNum > MAX_PRECIO) e.precio = 'El precio no puede superar $10.000.000'
  if (state.platoIds.length < 2) {
    e.platos = 'Selecciona al menos 2 platos'
  } else {
    // F8.5b — force-variante: every plato with variantes must have one picked
    const faltan = state.platoIds.some(item => {
      const plato = todosPlatos.find(p => p.id === item.plato_id)
      return plato?.variantes?.length && !item.variante_id
    })
    if (faltan) e.platos = 'Selecciona una variante para cada plato con opciones'
  }
  return e
}

// ── ComboForm — crear/editar combo (Fase 3, patrón CategoriaForm) ──
// Un solo form para ambos modos: la página monta {mostrarFormCombo &&
// <ComboForm key={editandoComboId ?? 'new'} comboInicial={...}/>} — la key
// remonta al cambiar de combo en edición o al pasar de editar a crear; el
// borrador se siembra UNA vez por montaje desde comboInicial (reemplaza el
// seeding del botón de editar). El guardado de edición restaura el activo
// ORIGINAL del combo (wasActive) leído de comboInicial.
function ComboForm({
  restId,
  todosPlatos,
  horariosPorPlato,
  comboInicial,
  onClose,
}: {
  restId: string | undefined
  todosPlatos: PlatoLite[]
  horariosPorPlato: Map<string, { hora_inicio: string; hora_fin: string }>
  comboInicial: any | null
  onClose: () => void
}) {
  const [combo, setCombo] = useState<{
    nombre: string; descripcion: string; platoIds: ComboItem[]; precio: string;
    dias: DiaSemana[]; horaInicio: string; horaFin: string;
  }>(() =>
    comboInicial
      ? {
          nombre: comboInicial.nombre,
          descripcion: comboInicial.descripcion || '',
          platoIds: (comboInicial.combo_platos ?? []).map((cp: any) => ({
            plato_id: cp.plato_id,
            variante_id: cp.variante_id ?? null,
          })) as ComboItem[],
          precio: comboInicial.precio.toString(),
          dias: comboInicial.dias || [],
          horaInicio: comboInicial.horario_inicio || '',
          horaFin: comboInicial.horario_fin || '',
        }
      : { nombre: '', descripcion: '', platoIds: [], precio: '', dias: [], horaInicio: '', horaFin: '' }
  )
  const [intento, setIntento] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [busquedaPlatos, setBusquedaPlatos] = useState('')

  function getHorarioPlato(platoId: string): { hora_inicio: string; hora_fin: string } | null {
    return horariosPorPlato.get(platoId) ?? null
  }

  const precioIndividual = useMemo(() => {
    return combo.platoIds.reduce((sum: number, item: ComboItem) => {
      const plato = todosPlatos.find(p => p.id === item.plato_id)
      if (!plato) return sum
      if (item.variante_id) {
        const v = plato.variantes?.find(x => x.id === item.variante_id)
        if (v) return sum + v.precio
      }
      return sum + (plato.precio || 0)
    }, 0)
  }, [combo.platoIds, todosPlatos])

  async function agregar() {
    setIntento(true)
    setTouched({ nombre: true, precio: true, platos: true })
    const errores = validarCombo(combo, todosPlatos)
    if (Object.keys(errores).length > 0 || !restId) return
    setGuardando(true)
    const supabase = createClient()

    // Step 1: insert with activo: false so public menu can't see it yet
    const { data: comboData, error } = await supabase.from('combos').insert({
      restaurante_id: restId,
      nombre: combo.nombre,
      descripcion: combo.descripcion || null,
      precio: parseInt(combo.precio),
      precio_individual: precioIndividual,
      activo: false,
      dias: combo.dias.length > 0 ? combo.dias : null,
      horario_inicio: combo.horaInicio || null,
      horario_fin: combo.horaFin || null,
    }).select().single()

    if (error || !comboData) { setGuardando(false); alert('Error al crear combo'); return }

    // Step 2: insert junction rows
    if (combo.platoIds.length > 0) {
      const { error: cpError } = await supabase.from('combo_platos').insert(
        combo.platoIds.map((item: ComboItem) => ({
          combo_id: comboData.id,
          plato_id: item.plato_id,
          variante_id: item.variante_id,
        }))
      )
      if (cpError) {
        await supabase.from('combos').delete().eq('id', comboData.id)
        setGuardando(false)
        alert('Error al asociar platos al combo')
        return
      }
    }

    // Step 3: activate the combo so the public menu picks it up complete
    const { error: actError } = await supabase.from('combos')
      .update({ activo: true })
      .eq('id', comboData.id)

    if (actError) {
      setGuardando(false)
      alert('Error al activar el combo')
      return
    }

    await invalidateAll('combos')
    setGuardando(false)
    setGuardado(true)
    setTimeout(() => onClose(), 1200)
  }

  async function actualizar() {
    if (!comboInicial) return
    setIntento(true)
    setTouched({ nombre: true, precio: true, platos: true })
    const errores = validarCombo(combo, todosPlatos)
    if (Object.keys(errores).length > 0) return
    setGuardando(true)
    const supabase = createClient()

    const wasActive = comboInicial.activo ?? true

    // Step 1: update fields and deactivate so public menu can't see partial state
    const { error } = await supabase.from('combos').update({
      nombre: combo.nombre,
      descripcion: combo.descripcion || null,
      precio: parseInt(combo.precio),
      precio_individual: precioIndividual,
      dias: combo.dias.length > 0 ? combo.dias : null,
      horario_inicio: combo.horaInicio || null,
      horario_fin: combo.horaFin || null,
      activo: false,
    }).eq('id', comboInicial.id)

    if (error) { setGuardando(false); alert('Error al actualizar combo'); return }

    // Step 2: delete old junction rows
    await supabase.from('combo_platos').delete().eq('combo_id', comboInicial.id)

    // Step 3: insert new junction rows
    if (combo.platoIds.length > 0) {
      const { error: cpError } = await supabase.from('combo_platos').insert(
        combo.platoIds.map((item: ComboItem) => ({
          combo_id: comboInicial.id,
          plato_id: item.plato_id,
          variante_id: item.variante_id,
        }))
      )
      if (cpError) {
        setGuardando(false)
        alert('Error al asociar platos al combo. El combo quedó desactivado.')
        return
      }
    }

    // Step 4: restore original active state
    const { error: actError } = await supabase.from('combos')
      .update({ activo: wasActive })
      .eq('id', comboInicial.id)

    if (actError) {
      setGuardando(false)
      alert('Error al reactivar el combo. Puedes activarlo manualmente desde la lista.')
      return
    }

    await invalidateAll('combos')
    setGuardando(false)
    setGuardado(true)
    setTimeout(() => onClose(), 1200)
  }

  const errores = validarCombo(combo, todosPlatos)
  const valido = Object.keys(errores).length === 0
  const totalPlatosCombo = todosPlatos.length
  const platosFiltradosCombo = busquedaPlatos.trim()
    ? todosPlatos.filter(p => p.nombre.toLowerCase().includes(busquedaPlatos.toLowerCase()))
    : todosPlatos
  return (
    <div className="card" style={{ padding: '14px', marginBottom: '14px' }}>
      <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>{comboInicial ? 'Editar combo' : 'Nuevo combo'}</div>
      <input className="input" placeholder="Nombre del combo (ej: Combo paisa)" value={combo.nombre} maxLength={50}
        onChange={(e) => setCombo({ ...combo, nombre: e.target.value })}
        onBlur={() => setTouched(prev => ({ ...prev, nombre: true }))}
        style={{
          marginBottom: intento && touched.nombre && errores.nombre ? '4px' : '8px',
          borderColor: intento && touched.nombre && errores.nombre ? 'var(--color-danger)' : undefined,
        }} />
      {intento && touched.nombre && errores.nombre && (
        <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
          {errores.nombre}
        </div>
      )}
      <input className="input" placeholder="Descripción (opcional)" value={combo.descripcion || ''}
        onChange={(e) => {
          if (e.target.value.length <= MAX_DESC) setCombo({ ...combo, descripcion: e.target.value })
        }}
        style={{ marginBottom: '2px' }} />
      <div style={{
        textAlign: 'right',
        fontSize: '10px',
        color: (combo.descripcion || '').length > MAX_DESC - 20
          ? 'var(--color-warning)'
          : 'var(--text-tertiary)',
        marginBottom: '8px',
      }}>
        {(combo.descripcion || '').length}/{MAX_DESC}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Selecciona los platos:</div>
      {totalPlatosCombo >= 10 && (
        <input
          className="input"
          type="text"
          placeholder="Buscar plato..."
          value={busquedaPlatos}
          onChange={(e) => setBusquedaPlatos(e.target.value)}
          style={{ marginBottom: '6px', fontSize: '12px' }}
        />
      )}
      <div style={{ maxHeight: '160px', overflowY: 'auto', marginBottom: '8px' }}>
        {platosFiltradosCombo.map(p => {
          const currentItem = combo.platoIds.find((i: ComboItem) => i.plato_id === p.id)
          const isSelected = !!currentItem
          const tieneVariantes = !!p.variantes && p.variantes.length > 0
          const precioMostrar = (() => {
            if (currentItem?.variante_id) {
              const v = p.variantes?.find(x => x.id === currentItem.variante_id)
              if (v) return v.precio
            }
            return p.precio
          })()
          return (
            <div key={p.id} onClick={() => {
              const yaSeleccionado = combo.platoIds.some((i: ComboItem) => i.plato_id === p.id)
              const sel: ComboItem[] = yaSeleccionado
                ? combo.platoIds.filter((i: ComboItem) => i.plato_id !== p.id)
                : [...combo.platoIds, {
                    plato_id: p.id,
                    variante_id: p.variantes?.[0]?.id ?? null,
                  }]
              setCombo({ ...combo, platoIds: sel })
              setTouched(prev => ({ ...prev, platos: true }))
            }} style={{
              padding: '8px 10px',
              borderBottom: '1px solid var(--border-light)', cursor: 'pointer',
              background: isSelected ? 'var(--color-accent-light)' : 'transparent',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '12px' }}>{p.nombre}</span>
                  {(() => { const h = getHorarioPlato(p.id); return h ? <span style={{ fontSize: '9px', color: 'var(--color-warning)', marginLeft: '4px' }}>⏰ {formato12h(h.hora_inicio)}–{formato12h(h.hora_fin)}</span> : null })()}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>${formatoPrecio(precioMostrar)}</span>
                  {isSelected && <span style={{ color: 'var(--color-accent)', fontSize: '12px' }}>✓</span>}
                </div>
              </div>
              {isSelected && tieneVariantes && (
                <div onClick={(e) => e.stopPropagation()} style={{ marginTop: '6px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>
                    Variante:
                  </div>
                  <Select
                    value={currentItem?.variante_id ?? ''}
                    onChange={(v) => {
                      const sel = combo.platoIds.map((item: ComboItem) =>
                        item.plato_id === p.id ? { ...item, variante_id: v as string } : item
                      )
                      setCombo({ ...combo, platoIds: sel })
                    }}
                    options={(p.variantes ?? []).map((v: any) => ({
                      value: v.id,
                      label: (
                        <span>
                          {v.nombre}
                          <span style={{ color: 'var(--text-tertiary)' }}>
                            {' '}— ${formatoPrecio(v.precio)}
                          </span>
                        </span>
                      ),
                      searchText: v.nombre,
                    }))}
                    placeholder="Selecciona variante"
                    error={intento && !!errores.platos && !currentItem?.variante_id}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
      {intento && touched.platos && errores.platos && (
        <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
          {errores.platos}
        </div>
      )}
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', marginTop: '4px' }}>
        Días activos (opcional):
      </div>
      <DiasSelector
        value={combo.dias}
        onChange={(dias) => setCombo({ ...combo, dias })}
      />
      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px', marginBottom: '10px' }}>
        Sin selección = visible todos los días
      </div>

      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
        Horario (opcional):
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <TimePicker
          value={combo.horaInicio}
          onChange={(v) => setCombo({ ...combo, horaInicio: v })}
        />
        <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>—</span>
        <TimePicker
          value={combo.horaFin}
          onChange={(v) => setCombo({ ...combo, horaFin: v })}
        />
      </div>
      <TimeRangeHelper
        start={combo.horaInicio || null}
        end={combo.horaFin || null}
        verb="Combo disponible"
      />
      <div style={{ marginBottom: '10px' }} />
      <input className="input" type="number" placeholder="Precio del combo" value={combo.precio}
        onChange={(e) => setCombo({ ...combo, precio: e.target.value })}
        onBlur={() => setTouched(prev => ({ ...prev, precio: true }))}
        style={{
          marginBottom: intento && touched.precio && errores.precio ? '4px' : '8px',
          borderColor: intento && touched.precio && errores.precio ? 'var(--color-danger)' : undefined,
        }} />
      {intento && touched.precio && errores.precio && (
        <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
          {errores.precio}
        </div>
      )}
      {combo.platoIds.length > 0 && combo.precio && (
        <div style={{ fontSize: '12px', color: 'var(--color-green)', marginBottom: '8px' }}>
          Ahorro: ${formatoPrecio(precioIndividual - parseInt(combo.precio || '0'))} ({Math.round(((precioIndividual - parseInt(combo.precio || '0')) / precioIndividual) * 100)}% descuento)
        </div>
      )}
      {combo.platoIds.length > 0 && (() => {
        const platosConHorario = combo.platoIds.map((item: ComboItem) => ({ id: item.plato_id, horario: getHorarioPlato(item.plato_id) })).filter(p => p.horario)
        if (platosConHorario.length === 0) return null
        const horarios = platosConHorario.map(p => `${p.horario!.hora_inicio}–${p.horario!.hora_fin}`)
        return (
          <div style={{ fontSize: '11px', color: 'var(--color-warning)', background: 'var(--color-warning-light)', padding: '8px 10px', borderRadius: '6px', marginBottom: '8px' }}>
            ⚠ Este combo incluye platos con horario restringido ({horarios.join(', ')}). El combo solo será visible cuando todos los platos estén activos.
          </div>
        )
      })()}
      <div style={{ display: 'flex', gap: '8px' }}>
        <Boton onClick={comboInicial ? actualizar : agregar} disabled={guardando || guardado}
          style={{ flex: 1, opacity: valido ? 1 : 0.5, cursor: valido ? 'pointer' : 'default' }}>
          {guardando ? 'Guardando...' : guardado ? <><Icono icono={Check} size={14} /> Guardado</> : comboInicial ? 'Guardar cambios' : 'Crear'}
        </Boton>
        <Boton variante="secundario" onClick={onClose} style={{ flex: 1 }}>Cancelar</Boton>
      </div>
    </div>
  )
}

export default memo(ComboForm)
