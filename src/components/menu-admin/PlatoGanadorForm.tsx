'use client'

import { memo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import Select from '@/components/ui/Select'
import { formato12h } from '@/lib/time'
import { formatoPrecio } from '@/lib/precio'
import { invalidateAll } from '@/lib/swr'
import type { Variante } from '@/types'

type PlatoLite = {
  id: string
  nombre: string
  precio: number
  variantes?: Variante[]
}

// Validador del plato ganador — module-level y puro. El cross-check ganador↔día
// corre contra el plato del día GUARDADO (semántica Fase 3): un borrador sin
// guardar en el form del día no bloquea.
export function validarPlatoGanador(
  state: { platoId: string },
  otherActive?: { activo: boolean; platoId: string }
): Record<string, string> {
  const e: Record<string, string> = {}
  if (!state.platoId) e.platoId = 'Selecciona un plato'

  if (state.platoId && otherActive?.activo && otherActive.platoId === state.platoId) {
    e.platoId = 'Este plato ya está configurado como plato del día. Selecciona otro o desactiva el plato del día primero.'
  }

  return e
}

// ── PlatoGanadorForm — sub-tab "Ganador" (Fase 3, espejo de PlatoDelDiaForm) ──
// Fresh-mount KEYED en platoGanadorSwr?.id ?? 'new', gateado en SWR resuelto;
// siembra por initializer desde `initial` (el efecto de seeding murió con este
// form). MISMA SECUENCIA DE GUARDADO que el día: el guardado es delete+insert
// (id nuevo → remount keyed), así que el tick "✓ Guardado" se muestra ANTES y
// el invalidateAll corre dentro del timeout de 1.2s.
function PlatoGanadorForm({
  restId,
  todosPlatos,
  horariosPorPlato,
  platoGanadorOptions,
  initial,
  diaActivo,
  diaPlatoId,
}: {
  restId: string | undefined
  todosPlatos: PlatoLite[]
  horariosPorPlato: Map<string, { hora_inicio: string; hora_fin: string }>
  platoGanadorOptions: any[]
  initial: any
  diaActivo: boolean
  diaPlatoId: string
}) {
  const activo = !!initial?.activo
  const [config, setConfig] = useState(() =>
    initial?.activo
      ? {
          platoId: initial.plato_id || '',
          varianteId: initial.variante_id ?? '',
          titulo: initial.titulo || 'Recomendado del chef',
          descripcion: initial.descripcion || '',
        }
      : { platoId: '', varianteId: '', titulo: 'Recomendado del chef', descripcion: '' }
  )
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [intento, setIntento] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  function getHorarioPlato(platoId: string): { hora_inicio: string; hora_fin: string } | null {
    return horariosPorPlato.get(platoId) ?? null
  }

  async function guardar() {
    setIntento(true)
    setTouched({ platoId: true, titulo: true })
    const errores = validarPlatoGanador(config, {
      activo: diaActivo,
      platoId: diaPlatoId,
    })
    if (Object.keys(errores).length > 0 || !restId) return
    setGuardando(true)
    const supabase = createClient()

    // Borrar cualquier plato ganador anterior para garantizar exactamente
    // 0 o 1 fila por restaurante (ver nota en PlatoDelDiaForm).
    await supabase.from('plato_ganador').delete().eq('restaurante_id', restId)

    await supabase.from('plato_ganador').insert({
      restaurante_id: restId,
      plato_id: config.platoId,
      variante_id: config.varianteId || null,
      titulo: config.titulo,
      descripcion: config.descripcion || null,
      activo: true,
    })

    setGuardando(false)
    setGuardado(true)
    // Invalidar DESPUÉS del tick (ver nota de secuencia arriba).
    setTimeout(() => {
      setGuardado(false)
      invalidateAll('plato-ganador')
    }, 1200)
  }

  async function desactivar() {
    if (!restId) return
    const supabase = createClient()
    await supabase.from('plato_ganador').delete().eq('restaurante_id', restId)
    // La revalidación deja platoGanadorSwr en null → la key pasa a 'new' y el
    // form remonta con los defaults (reemplaza el reset manual del config).
    await invalidateAll('plato-ganador')
  }

  const errores = validarPlatoGanador(config, {
    activo: diaActivo,
    platoId: diaPlatoId,
  })
  const valido = Object.keys(errores).length === 0
  const tituloOptions = [
    { value: 'Recomendado del chef', label: 'Recomendado del chef' },
    { value: 'Favorito de los clientes', label: 'Favorito de los clientes' },
    { value: 'Plato estrella', label: 'Plato estrella' },
    { value: 'Especialidad de la casa', label: 'Especialidad de la casa' },
    { value: 'El más pedido', label: 'El más pedido' },
  ]
  const platoGanadorErrorVisible = !!(
    (intento && touched.platoId && errores.platoId) ||
    (config.platoId && diaActivo && diaPlatoId === config.platoId)
  )
  return (
    <div style={{ padding: '14px 20px' }}>
      <div className="card" style={{ padding: '14px', marginBottom: '14px' }}>
        <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Plato ganador</div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
          Destaca un plato especial de tu restaurante. Aparecerá con un badge dorado en el menú.
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Título del reconocimiento:</div>
        <div style={{ marginBottom: '10px' }}>
          <Select
            className="input"
            value={config.titulo}
            onChange={(v) => {
              setConfig({ ...config, titulo: v })
              setTouched(prev => ({ ...prev, titulo: true }))
            }}
            options={tituloOptions}
            placeholder="Recomendado del chef"
          />
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Selecciona el plato:</div>
        <div style={{ marginBottom: platoGanadorErrorVisible ? '4px' : '10px' }}>
          <Select
            className="input"
            value={config.platoId}
            onChange={(v) => {
              const platoNuevo = todosPlatos.find(p => p.id === v)
              const nuevaVariante = (platoNuevo?.variantes && platoNuevo.variantes.length > 0)
                ? platoNuevo.variantes[0].id
                : ''
              setConfig({ ...config, platoId: v, varianteId: nuevaVariante })
              setTouched(prev => ({ ...prev, platoId: true }))
            }}
            options={platoGanadorOptions}
            placeholder="Seleccionar plato"
            required
            error={platoGanadorErrorVisible}
            ariaDescribedBy={platoGanadorErrorVisible ? 'plato-ganador-error' : undefined}
          />
        </div>
        {platoGanadorErrorVisible && (
          <div id="plato-ganador-error" style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '10px' }}>
            {errores.platoId}
          </div>
        )}
        {config.platoId && (() => {
          const h = getHorarioPlato(config.platoId)
          if (!h) return null
          return (
            <div style={{ fontSize: '11px', color: 'var(--color-warning)', background: 'var(--color-warning-light)', padding: '8px 10px', borderRadius: '6px', marginBottom: '10px' }}>
              ⚠ Este plato pertenece a una categoría visible solo de {formato12h(h.hora_inicio)} a {formato12h(h.hora_fin)}. El plato ganador solo se mostrará en ese horario.
            </div>
          )
        })()}
        {(() => {
          const platoSel = todosPlatos.find(p => p.id === config.platoId)
          const variantes = platoSel?.variantes ?? []
          if (variantes.length === 0) return null
          const opciones = [
            { value: '', label: <span style={{ color: 'var(--text-tertiary)' }}>Sin variante específica</span> },
            ...variantes.map(v => ({
              value: v.id,
              label: <span>{v.nombre} <span style={{ color: 'var(--text-tertiary)' }}>— ${formatoPrecio(v.precio)}</span></span>,
              searchText: `${v.nombre} ${v.precio}`.toLowerCase(),
            })),
          ]
          return (
            <>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Variante:</div>
              <div style={{ marginBottom: '10px' }}>
                <Select
                  className="input"
                  value={config.varianteId}
                  onChange={(v) => setConfig({ ...config, varianteId: v })}
                  options={opciones}
                  placeholder="Sin variante específica"
                />
              </div>
            </>
          )
        })()}

        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Descripción especial (opcional):</div>
        <div style={{ position: 'relative', marginBottom: '10px' }}>
          <input className="input" placeholder="Ej: Nuestro plato insignia desde 2020"
            value={config.descripcion}
            onChange={(e) => { if (e.target.value.length <= 100) setConfig({ ...config, descripcion: e.target.value }) }}
            style={{ paddingRight: '50px' }} />
          <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: config.descripcion.length > 80 ? 'var(--color-warning)' : 'var(--text-tertiary)' }}>
            {config.descripcion.length}/100
          </span>
        </div>

        {config.platoId && (() => {
          const platoPreview = todosPlatos.find(p => p.id === config.platoId)
          if (!platoPreview) return null
          const varianteLockedPreview = config.varianteId
            ? platoPreview.variantes?.find(v => v.id === config.varianteId)
            : null
          const tieneVariantesPreview = !!(platoPreview.variantes && platoPreview.variantes.length > 0)
          return (
            <div style={{ background: 'var(--color-warning-light)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-warning)', marginBottom: '6px' }}>Vista previa</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '14px' }}>⭐</span>
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-warning)' }}>{config.titulo.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 500 }}>
                {platoPreview.nombre}{varianteLockedPreview ? ` · ${varianteLockedPreview.nombre}` : ''}
              </div>
              {config.descripcion && (
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', fontStyle: 'italic' }}>
                  "{config.descripcion}"
                </div>
              )}
              <div style={{ fontSize: '13px', fontWeight: 500, marginTop: '4px' }}>
                {varianteLockedPreview
                  ? `$${formatoPrecio(varianteLockedPreview.precio)}`
                  : tieneVariantesPreview
                    ? `desde $${formatoPrecio(platoPreview.precio)}`
                    : `$${formatoPrecio(platoPreview.precio)}`}
              </div>
            </div>
          )
        })()}

        <button onClick={guardar} disabled={guardando || guardado} className="btn-primary"
          style={{
            width: '100%', padding: '12px', fontSize: '13px',
            opacity: valido ? 1 : 0.5,
            cursor: valido ? 'pointer' : 'default',
            ...(valido ? {} : { transform: 'none', boxShadow: 'none' }),
          }}>
          {guardando ? 'Guardando...' : guardado ? '✓ Guardado' : activo ? 'Actualizar plato ganador' : 'Guardar plato ganador'}
        </button>
        {activo && (
          <button onClick={desactivar} className="btn-outline" style={{ width: '100%', padding: '12px', fontSize: '13px', marginTop: '8px', color: 'var(--color-danger)' }}>
            Desactivar plato ganador
          </button>
        )}
      </div>
    </div>
  )
}

export default memo(PlatoGanadorForm)
