'use client'

import { memo, useState } from 'react'
import { Check } from 'lucide-react'
import Icono from '@/components/ui/Icono'
import Boton from '@/components/ui/Boton'
import { createClient } from '@/lib/supabase-browser'
import Select from '@/components/ui/Select'
import TimePicker from '@/components/ui/TimePicker'
import TimeRangeHelper from '@/components/ui/TimeRangeHelper'
import { formato12h } from '@/lib/time'
import { fechaColombia, diaCodigoColombia } from '@/lib/fechas'
import { formatoPrecio } from '@/lib/precio'
import { invalidateAll } from '@/lib/swr'
import { MAX_PRECIO } from './PlatoForm'
import type { Variante } from '@/types'

type PlatoLite = {
  id: string
  nombre: string
  precio: number
  variantes?: Variante[]
}

// Validador del plato del día — module-level y puro. El cross-check día↔ganador
// corre contra el plato ganador GUARDADO (semántica Fase 3): un borrador sin
// guardar en el form de ganador no bloquea.
export function validarPlatoDia(
  state: { platoId: string; varianteId: string; precioEspecial: string },
  otherActive?: { activo: boolean; platoId: string },
  variantes?: { id: string }[]
): Record<string, string> {
  const e: Record<string, string> = {}
  if (!state.platoId) e.platoId = 'Selecciona un plato'
  const v = parseInt(state.precioEspecial)
  if (!state.precioEspecial || isNaN(v) || v <= 0) e.precioEspecial = 'El precio especial debe ser mayor a 0'
  else if (v > MAX_PRECIO) e.precioEspecial = 'El precio especial no puede superar $10.000.000'

  if (state.platoId && otherActive?.activo && otherActive.platoId === state.platoId) {
    e.platoId = 'Este plato ya está configurado como plato ganador. Selecciona otro o desactiva el plato ganador primero.'
  }

  if (state.varianteId && variantes && !variantes.some(x => x.id === state.varianteId)) {
    e.varianteId = 'Variante seleccionada inválida'
  }

  return e
}

// ── PlatoDelDiaForm — sub-tab "Plato del día" (Fase 3) ──
// Fresh-mount KEYED: la página monta <PlatoDelDiaForm key={platoDiaSwr?.id ?? 'new'}/>
// gateado en platoDiaSwr !== undefined. El borrador se siembra UNA vez por montaje
// desde `initial` (reemplaza el efecto de seeding de la página — las revalidaciones
// de fondo del MISMO registro ya no pisan una edición en curso).
// SECUENCIA DEL GUARDADO (delete+insert → id NUEVO → la key remonta): el tick
// "✓ Guardado" se muestra ANTES de invalidar y el invalidateAll corre dentro del
// timeout de 1.2s — si se esperara la revalidación primero, el remount keyed
// mataría el tick en el acto. El remount post-tick resiembra desde lo guardado
// (mismos valores) y resetea intento/touched, igual que una carga fresca.
function PlatoDelDiaForm({
  restId,
  todosPlatos,
  horariosPorPlato,
  platoDiaOptions,
  promos,
  initial,
  ganadorActivo,
  ganadorPlatoId,
}: {
  restId: string | undefined
  todosPlatos: PlatoLite[]
  horariosPorPlato: Map<string, { hora_inicio: string; hora_fin: string }>
  platoDiaOptions: any[]
  promos: any[]
  initial: any
  ganadorActivo: boolean
  ganadorPlatoId: string
}) {
  const activo = !!initial?.activo
  const [config, setConfig] = useState(() =>
    initial?.activo
      ? {
          platoId: initial.plato_id || '',
          varianteId: initial.variante_id ?? '',
          precioEspecial: initial.precio_especial?.toString() || '',
          horaInicio: initial.horario_inicio || '11:00',
          horaFin: initial.horario_fin || '15:00',
        }
      : { platoId: '', varianteId: '', precioEspecial: '', horaInicio: '11:00', horaFin: '15:00' }
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
    setTouched({ platoId: true, precioEspecial: true })
    const variantesActuales = todosPlatos.find(p => p.id === config.platoId)?.variantes ?? []
    const errores = validarPlatoDia(config, {
      activo: ganadorActivo,
      platoId: ganadorPlatoId,
    }, variantesActuales)
    if (Object.keys(errores).length > 0 || !restId) return
    setGuardando(true)
    const supabase = createClient()

    // Borrar cualquier plato del día anterior (activo o no) para garantizar
    // exactamente 0 o 1 fila por restaurante — maybeSingle() en el hook
    // lanza error con múltiples filas y SWR devolvería null silenciosamente.
    await supabase.from('plato_del_dia').delete().eq('restaurante_id', restId)

    // Insertar nuevo
    await supabase.from('plato_del_dia').insert({
      restaurante_id: restId,
      plato_id: config.platoId,
      variante_id: config.varianteId || null,
      precio_especial: parseInt(config.precioEspecial),
      horario_inicio: config.horaInicio,
      horario_fin: config.horaFin,
      activo: true,
      fecha: fechaColombia(),
    })

    setGuardando(false)
    setGuardado(true)
    // Invalidar DESPUÉS del tick (ver nota de secuencia arriba).
    setTimeout(() => {
      setGuardado(false)
      invalidateAll('plato-del-dia')
    }, 1200)
  }

  async function desactivar() {
    if (!restId) return
    const supabase = createClient()
    await supabase.from('plato_del_dia').delete().eq('restaurante_id', restId)
    // La revalidación deja platoDiaSwr en null → la key pasa a 'new' y el form
    // remonta con los defaults (reemplaza el reset manual del config).
    await invalidateAll('plato-del-dia')
  }

  const variantesActualesDia = todosPlatos.find(p => p.id === config.platoId)?.variantes ?? []
  const errores = validarPlatoDia(config, {
    activo: ganadorActivo,
    platoId: ganadorPlatoId,
  }, variantesActualesDia)
  const valido = Object.keys(errores).length === 0
  // Nota contextual (informativa, NO bloquea guardado): el plato del día es
  // de un solo día (hoy), así que el cruce con promos solo puede ocurrir hoy.
  // Mapear "hoy" (offset Colombia, igual que guardar) a código de día
  // y comprobar si el plato tiene alguna promo descuento ACTIVA ese día.
  const codigoHoy = diaCodigoColombia()
  const platoDiaTienePromoHoy = !!config.platoId && promos.some(p =>
    p.activo && (p.tipo === 'descuento' || p.tipo === 'dos_por_uno') &&
    (p.dias || []).includes(codigoHoy) &&
    (p.promoPlatos || []).some((pp: any) => pp.plato_id === config.platoId))
  return (
    <div style={{ padding: '14px 20px' }}>
      <div className="card" style={{ padding: '14px', marginBottom: '14px' }}>
        <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Configurar plato del día</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Selecciona un plato:</div>
        {(() => {
          const platoDiaErrorVisible = !!(
            (intento && touched.platoId && errores.platoId) ||
            (config.platoId && ganadorActivo && ganadorPlatoId === config.platoId)
          )
          return (
            <>
              <div style={{ marginBottom: platoDiaErrorVisible ? '4px' : '8px' }}>
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
                  options={platoDiaOptions}
                  placeholder="Seleccionar plato"
                  required
                  error={platoDiaErrorVisible}
                  ariaDescribedBy={platoDiaErrorVisible ? 'plato-dia-error' : undefined}
                />
              </div>
              {platoDiaErrorVisible && (
                <div id="plato-dia-error" style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
                  {errores.platoId}
                </div>
              )}
            </>
          )
        })()}
        {config.platoId && (() => {
          const h = getHorarioPlato(config.platoId)
          if (!h) return null
          return (
            <div style={{ fontSize: '11px', color: 'var(--color-warning)', background: 'var(--color-warning-light)', padding: '8px 10px', borderRadius: '6px', marginBottom: '8px' }}>
              ⚠ Este plato pertenece a una categoría visible solo de {formato12h(h.hora_inicio)} a {formato12h(h.hora_fin)}. El plato del día solo se mostrará en ese horario.
            </div>
          )
        })()}
        {platoDiaTienePromoHoy && (
          <div style={{ fontSize: '11px', color: 'var(--color-warning)', background: 'var(--color-warning-light)', padding: '8px 10px', borderRadius: '6px', marginBottom: '8px' }}>
            ⚠ Este plato tiene promociones activas hoy. El precio del Plato del día tendrá prioridad mientras esté activo.
          </div>
        )}
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
              <div style={{ marginBottom: '8px' }}>
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
        <input className="input" type="number" placeholder="Precio especial" value={config.precioEspecial}
          onChange={(e) => setConfig({ ...config, precioEspecial: e.target.value })}
          onBlur={() => setTouched(prev => ({ ...prev, precioEspecial: true }))}
          style={{
            marginBottom: intento && touched.precioEspecial && errores.precioEspecial ? '4px' : '8px',
            borderColor: intento && touched.precioEspecial && errores.precioEspecial ? 'var(--color-danger)' : undefined,
          }} />
        {intento && touched.precioEspecial && errores.precioEspecial && (
          <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
            {errores.precioEspecial}
          </div>
        )}
        {(() => {
          const platoSeleccionado = todosPlatos.find(p => p.id === config.platoId)

          if (!platoSeleccionado) return null

          const precioEspNum = parseInt(config.precioEspecial || '0')
          if (precioEspNum <= 0) return null

          const varianteLocked = config.varianteId
            ? platoSeleccionado.variantes?.find(v => v.id === config.varianteId)
            : null
          const precioReferencia = varianteLocked ? varianteLocked.precio : platoSeleccionado.precio

          if (precioEspNum >= precioReferencia) {
            return (
              <div style={{
                background: 'var(--color-warning-light)',
                border: '1px solid var(--color-warning)',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                color: 'var(--color-warning)',
                marginTop: '6px',
                marginBottom: '8px',
              }}>
                ⚠️ El precio especial es igual o mayor al precio original (${formatoPrecio(precioReferencia)}). ¿Es correcto?
              </div>
            )
          }
          return null
        })()}
        <div style={{ marginBottom: '12px' }}>
          <label className="label">Horario del plato del día</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
            <TimePicker
              value={config.horaInicio}
              onChange={(v) => setConfig({ ...config, horaInicio: v })}
            />
            <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>—</span>
            <TimePicker
              value={config.horaFin}
              onChange={(v) => setConfig({ ...config, horaFin: v })}
            />
          </div>
          <TimeRangeHelper
            start={config.horaInicio}
            end={config.horaFin}
            verb="Disponible"
          />
        </div>

        {config.platoId && config.precioEspecial && (() => {
          const platoPreview = todosPlatos.find(p => p.id === config.platoId)
          if (!platoPreview) return null
          const varianteLockedPreview = config.varianteId
            ? platoPreview.variantes?.find(v => v.id === config.varianteId)
            : null
          const tieneVariantesPreview = !!(platoPreview.variantes && platoPreview.variantes.length > 0)
          return (
            <div style={{
              background: 'var(--color-accent-light)', borderRadius: 'var(--radius-sm)', padding: '12px', marginBottom: '10px',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-accent)', marginBottom: '4px' }}>Vista previa</div>
              <div style={{ fontSize: '14px', fontWeight: 500 }}>
                {platoPreview.nombre}{varianteLockedPreview ? ` · ${varianteLockedPreview.nombre}` : ''}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                {varianteLockedPreview ? (
                  <>
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'line-through' }}>
                      ${formatoPrecio(varianteLockedPreview.precio)}
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-accent)' }}>
                      ${formatoPrecio(parseInt(config.precioEspecial))}
                    </span>
                  </>
                ) : tieneVariantesPreview ? (
                  <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-accent)' }}>
                    desde ${formatoPrecio(platoPreview.precio)}
                  </span>
                ) : (
                  <>
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'line-through' }}>
                      ${formatoPrecio(platoPreview.precio)}
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-accent)' }}>
                      ${formatoPrecio(parseInt(config.precioEspecial))}
                    </span>
                  </>
                )}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {formato12h(config.horaInicio)} — {formato12h(config.horaFin)}
              </div>
            </div>
          )
        })()}

        <Boton onClick={guardar} disabled={guardando || guardado}
          style={{ width: '100%', opacity: valido ? 1 : 0.5, cursor: valido ? 'pointer' : 'default' }}>
          {guardando ? 'Guardando...' : guardado ? <><Icono icono={Check} size={14} /> Guardado</> : activo ? 'Actualizar plato del día' : 'Guardar plato del día'}
        </Boton>
        {activo && (
          <Boton variante="oscuro" onClick={desactivar} style={{ width: '100%', marginTop: '8px' }}>
            Desactivar plato del día
          </Boton>
        )}
      </div>
    </div>
  )
}

export default memo(PlatoDelDiaForm)
