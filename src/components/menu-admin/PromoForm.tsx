'use client'

import { memo, useState } from 'react'
import { Check, Clock, TriangleAlert } from 'lucide-react'
import Icono from '@/components/ui/Icono'
import Boton from '@/components/ui/Boton'
import { createClient } from '@/lib/supabase-browser'
import Select from '@/components/ui/Select'
import { formato12h } from '@/lib/time'
import { formatoPrecio } from '@/lib/precio'
import { invalidateAll } from '@/lib/swr'
import { MAX_DESC } from './PlatoForm'
import type { Variante } from '@/types'

type PlatoLite = {
  id: string
  nombre: string
  precio: number
  variantes?: Variante[]
}

// Promo item shape for admin form state. Unlike ComboItem, the variante lock is
// OPTIONAL: variante_id === null means "todas las variantes" (no force-variante).
type PromoItem = {
  plato_id: string
  variante_id: string | null
}

// Dos promos entran en conflicto si comparten ≥1 plato Y ≥1 día Y ≥1 variante de ese plato.
// variante_id null (todas las variantes) cruza CUALQUIER variante específica y cruza otro null;
// dos variantes específicas cruzan solo si son iguales. El TIPO de promo no importa; solo
// cuentan las promos ACTIVAS. Devuelve el nombre de la primera promo en conflicto, o null.
// Devuelve un descriptor por cada (plato, variante) del NUEVO promo que choca con alguna
// promo activa existente. platoNombre + varianteNombre (null = todas las variantes) + el
// nombre de la promo en conflicto, para construir un mensaje específico. Array vacío = sin
// conflictos. Reglas: solo promos ACTIVAS, excluye excludeId (la promo en edición no choca
// consigo misma), requiere cruce de días, y cruce de variante (a==null || b==null || a===b).
// Sin early-return: recorre todos los platos. Fase 3: promos/excludeId/todosPlatos entran
// como parámetros explícitos (antes se leían del closure de la página).
export function detectarConflictoPromo(
  state: { dias: string[]; platoIds: PromoItem[] },
  promosExistentes: any[],
  excludeId: string | null,
  todosPlatos: PlatoLite[],
): { platoNombre: string; varianteNombre: string | null; promoNombre: string }[] {
  const variantesCruzan = (a: string | null, b: string | null) =>
    a == null || b == null || a === b
  const conflictos: { platoNombre: string; varianteNombre: string | null; promoNombre: string }[] = []
  const vistos = new Set<string>()
  for (const a of state.platoIds) {
    for (const p of promosExistentes) {
      // Excluir la promo en edición (no choca consigo misma) y las inactivas.
      if (p.id === excludeId || !p.activo) continue
      // Los días deben intersecar.
      if (!state.dias.some((d) => (p.dias || []).includes(d))) continue
      // ¿Algún promoPlato de p cruza este (plato, variante) del nuevo promo?
      const cruza = (p.promoPlatos || []).some((b: any) =>
        b.plato_id === a.plato_id && variantesCruzan(a.variante_id, b.variante_id ?? null)
      )
      if (!cruza) continue
      // Dedupe: un descriptor por (plato+variante del nuevo, promo en conflicto).
      const key = `${a.plato_id}|${a.variante_id ?? ''}|${p.id}`
      if (vistos.has(key)) continue
      vistos.add(key)
      // Resolver nombres con el lookup canónico del form (todosPlatos), igual que el
      // derive `promos` arma "Pizza (Grande)".
      const plato = todosPlatos.find((x) => x.id === a.plato_id)
      const platoNombre = plato?.nombre || 'Plato'
      const varianteNombre = a.variante_id
        ? (plato?.variantes?.find((v: any) => v.id === a.variante_id)?.nombre ?? null)
        : null
      conflictos.push({ platoNombre, varianteNombre, promoNombre: p.nombre || 'otra promo' })
    }
  }
  return conflictos
}

// Validador de promo — module-level y puro (promos/excludeId/todosPlatos como
// parámetros explícitos; antes los leía del closure de la página).
export function validarPromo(
  state: { nombre: string; descripcion: string; tipo: string; valor: string; dias: string[]; platoIds: PromoItem[] },
  promos: any[],
  excludeId: string | null,
  todosPlatos: PlatoLite[],
): Record<string, string> {
  const e: Record<string, string> = {}
  if (!state.nombre.trim()) e.nombre = 'El nombre es obligatorio'
  if (!state.tipo) e.tipo = 'Selecciona el tipo de promoción'
  if (state.dias.length === 0) e.dias = 'Selecciona al menos un día'
  if (state.platoIds.length === 0) {
    e.platos = 'Selecciona al menos un plato'
  }
  if (state.tipo === 'descuento') {
    const v = parseInt(state.valor)
    if (!state.valor || isNaN(v) || v < 1 || v > 100) e.valor = 'Ingresa un porcentaje entre 1 y 100'
  }
  // Conflicto: solo chequear cuando hay platos y días seleccionados (no en form vacío,
  // para que el error de conflicto no aparezca junto a "selecciona un plato/día").
  if (state.platoIds.length > 0 && state.dias.length > 0) {
    const conflictos = detectarConflictoPromo(state, promos, excludeId, todosPlatos)
    if (conflictos.length > 0) {
      if (conflictos.length === 1) {
        const c = conflictos[0]
        const nombre = `${c.platoNombre}${c.varianteNombre ? ` (${c.varianteNombre})` : ''}`
        e.conflicto = `${nombre} ya está en la promo activa "${c.promoNombre}" en días que se cruzan. Cambia el día, la variante, o quita ese plato.`
      } else {
        const lista = conflictos
          .map((c) => `${c.platoNombre}${c.varianteNombre ? ` (${c.varianteNombre})` : ''} → "${c.promoNombre}"`)
          .join('; ')
        e.conflicto = `Estos platos ya están en promos activas en días que se cruzan: ${lista}. Cambia el día, la variante, o quítalos.`
      }
    }
  }
  return e
}

// ── PromoForm — crear/editar promoción (Fase 3, espejo de ComboForm) ──
// Un solo form para ambos modos: la página monta {mostrarFormPromo &&
// <PromoForm key={editandoPromoId ?? 'new'} promoInicial={...}/>}. El chequeo
// de conflicto corre contra la PROP promos (viva: se refresca con SWR mientras
// el form está montado) y siempre excluye promoInicial?.id. El guardado de
// edición restaura el activo ORIGINAL (wasActive) leído de promoInicial.
// NOTA (riesgo del censo): la limpieza de promos vacías (limpiarPromosVacias)
// es SOLO de los handlers de borrado de la página — nunca llamarla desde aquí
// ni desde un efecto: la ventana de junction vacío transitorio de actualizar()
// (paso 2→3) se comería la promo en edición.
function PromoForm({
  restId,
  todosPlatos,
  horariosPorPlato,
  promos,
  promoInicial,
  onClose,
}: {
  restId: string | undefined
  todosPlatos: PlatoLite[]
  horariosPorPlato: Map<string, { hora_inicio: string; hora_fin: string }>
  promos: any[]
  promoInicial: any | null
  onClose: () => void
}) {
  const [promo, setPromo] = useState<{
    nombre: string; descripcion: string; tipo: string; valor: string; dias: string[]; platoIds: PromoItem[];
  }>(() =>
    promoInicial
      ? {
          nombre: promoInicial.nombre,
          descripcion: promoInicial.descripcion || '',
          tipo: promoInicial.tipo,
          valor: promoInicial.valor || '',
          dias: promoInicial.dias || [],
          // Rehydrate from the raw promoPlatos carry (with variante_id), not the
          // lossy platosIds — mirrors combo edit-pop reading combo.combo_platos.
          platoIds: (promoInicial.promoPlatos ?? []).map((pp: any) => ({
            plato_id: pp.plato_id,
            variante_id: pp.variante_id ?? null,
          })) as PromoItem[],
        }
      : { nombre: '', descripcion: '', tipo: '', valor: '', dias: [], platoIds: [] }
  )
  const [intento, setIntento] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [busquedaPlatos, setBusquedaPlatos] = useState('')

  function getHorarioPlato(platoId: string): { hora_inicio: string; hora_fin: string } | null {
    return horariosPorPlato.get(platoId) ?? null
  }

  async function agregar() {
    setIntento(true)
    setTouched({ nombre: true, tipo: true, valor: true, dias: true, platos: true })
    const errores = validarPromo(promo, promos, null, todosPlatos)
    if (Object.keys(errores).length > 0 || !restId) return
    setGuardando(true)
    const supabase = createClient()

    // Step 1: insert with activo: false so public menu can't see it yet
    const { data: promoData, error } = await supabase.from('promos').insert({
      restaurante_id: restId,
      nombre: promo.nombre,
      descripcion: promo.descripcion || null,
      tipo: promo.tipo,
      valor: promo.valor ? parseInt(promo.valor) : null,
      dias: promo.dias,
      activo: false,
    }).select().single()

    if (error || !promoData) { setGuardando(false); alert('Error al crear promo'); return }

    // Step 2: insert junction rows
    if (promo.platoIds.length > 0) {
      const { error: ppError } = await supabase.from('promo_platos').insert(
        promo.platoIds.map(item => ({ promo_id: promoData.id, plato_id: item.plato_id, variante_id: item.variante_id }))
      )
      if (ppError) {
        await supabase.from('promos').delete().eq('id', promoData.id)
        setGuardando(false)
        alert('Error al asociar platos a la promo')
        return
      }
    }

    // Step 3: activate the promo so the public menu picks it up complete
    const { error: actError } = await supabase.from('promos')
      .update({ activo: true })
      .eq('id', promoData.id)

    if (actError) {
      setGuardando(false)
      alert('Error al activar la promo')
      return
    }

    await invalidateAll('promos')
    setGuardando(false)
    setGuardado(true)
    setTimeout(() => onClose(), 1200)
  }

  async function actualizar() {
    if (!promoInicial) return
    setIntento(true)
    setTouched({ nombre: true, tipo: true, valor: true, dias: true, platos: true })
    const errores = validarPromo(promo, promos, promoInicial.id, todosPlatos)
    if (Object.keys(errores).length > 0) return
    setGuardando(true)
    const supabase = createClient()

    const wasActive = promoInicial.activo ?? true

    // Step 1: update fields and deactivate so public menu can't see partial state
    const { error } = await supabase.from('promos').update({
      nombre: promo.nombre,
      descripcion: promo.descripcion || null,
      tipo: promo.tipo,
      valor: promo.valor ? parseInt(promo.valor) : null,
      dias: promo.dias,
      activo: false,
    }).eq('id', promoInicial.id)

    if (error) { setGuardando(false); alert('Error al actualizar promo'); return }

    // Step 2: delete old junction rows
    await supabase.from('promo_platos').delete().eq('promo_id', promoInicial.id)

    // Step 3: insert new junction rows
    if (promo.platoIds.length > 0) {
      const { error: ppError } = await supabase.from('promo_platos').insert(
        promo.platoIds.map(item => ({ promo_id: promoInicial.id, plato_id: item.plato_id, variante_id: item.variante_id }))
      )
      if (ppError) {
        setGuardando(false)
        alert('Error al asociar platos a la promo. La promo quedó desactivada.')
        return
      }
    }

    // Step 4: restore original active state
    const { error: actError } = await supabase.from('promos')
      .update({ activo: wasActive })
      .eq('id', promoInicial.id)

    if (actError) {
      setGuardando(false)
      alert('Error al reactivar la promo. Puedes activarla manualmente desde la lista.')
      return
    }

    await invalidateAll('promos')
    setGuardando(false)
    setGuardado(true)
    setTimeout(() => onClose(), 1200)
  }

  const errores = validarPromo(promo, promos, promoInicial?.id ?? null, todosPlatos)
  const valido = Object.keys(errores).length === 0
  const totalPlatosPromo = todosPlatos.length
  const platosFiltradosPromo = busquedaPlatos.trim()
    ? todosPlatos.filter(p => p.nombre.toLowerCase().includes(busquedaPlatos.toLowerCase()))
    : todosPlatos
  return (
    <div className="card" style={{ padding: '14px', marginBottom: '14px' }}>
      <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>{promoInicial ? 'Editar promoción' : 'Nueva promoción'}</div>
      <input className="input" placeholder="Nombre (ej: Happy Hour)" value={promo.nombre} maxLength={50}
        onChange={(e) => setPromo({ ...promo, nombre: e.target.value })}
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
      <input className="input" placeholder="Descripción (ej: Bebidas al 2x1 los viernes)" value={promo.descripcion}
        onChange={(e) => {
          if (e.target.value.length <= MAX_DESC) setPromo({ ...promo, descripcion: e.target.value })
        }}
        style={{ marginBottom: '2px' }} />
      <div style={{
        textAlign: 'right',
        fontSize: '10px',
        color: promo.descripcion.length > MAX_DESC - 20
          ? 'var(--color-warning)'
          : 'var(--text-tertiary)',
        marginBottom: '8px',
      }}>
        {promo.descripcion.length}/{MAX_DESC}
      </div>

      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Tipo de promo:</div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {[
          { id: 'dos_por_uno', label: '2x1' },
          { id: 'descuento', label: '% Descuento' },
        ].map(t => (
          <div key={t.id} onClick={() => {
            setPromo({ ...promo, tipo: t.id, valor: '' })
            setTouched(prev => ({ ...prev, tipo: true, valor: false, platos: false }))
          }} className="tap-control" style={{
            padding: '7px 12px', borderRadius: 'var(--radius-sm)', fontSize: '12px', cursor: 'pointer',
            background: promo.tipo === t.id ? 'var(--text-primary)' : 'var(--bg-secondary)',
            color: promo.tipo === t.id ? 'white' : 'var(--text-secondary)',
            border: promo.tipo === t.id ? 'none' : '1px solid var(--border-light)',
          }}>{t.label}</div>
        ))}
      </div>
      {intento && touched.tipo && errores.tipo && (
        <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
          {errores.tipo}
        </div>
      )}
      {promo.tipo === 'descuento' && (
        <input className="input" type="number" placeholder="Porcentaje (ej: 20)" value={promo.valor}
          onChange={(e) => setPromo({ ...promo, valor: e.target.value })}
          onBlur={() => setTouched(prev => ({ ...prev, valor: true }))}
          style={{
            marginBottom: intento && touched.valor && errores.valor ? '4px' : '8px',
            borderColor: intento && touched.valor && errores.valor ? 'var(--color-danger)' : undefined,
          }} />
      )}
      {intento && touched.valor && errores.valor && promo.tipo === 'descuento' && (
        <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
          {errores.valor}
        </div>
      )}

      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Platos en esta promo:</div>
      {totalPlatosPromo >= 10 && (
        <input
          className="input"
          type="text"
          placeholder="Buscar plato..."
          value={busquedaPlatos}
          onChange={(e) => setBusquedaPlatos(e.target.value)}
          style={{ marginBottom: '6px', fontSize: '12px' }}
        />
      )}
      <div style={{ maxHeight: '160px', overflowY: 'auto', marginBottom: '10px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)' }}>
        {platosFiltradosPromo.map(p => {
          const currentItem = promo.platoIds.find((i: PromoItem) => i.plato_id === p.id)
          const isSelected = !!currentItem
          const tieneVariantes = !!p.variantes && p.variantes.length > 0
          // Display price reflects the locked variante if one is set; otherwise base price.
          const precioMostrar = (() => {
            if (currentItem?.variante_id) {
              const v = p.variantes?.find(x => x.id === currentItem.variante_id)
              if (v) return v.precio
            }
            return p.precio
          })()
          return (
          <div key={p.id} onClick={() => {
            const yaSeleccionado = promo.platoIds.some((i: PromoItem) => i.plato_id === p.id)
            // On select, default variante_id to null = "todas las variantes" (OPTIONAL lock,
            // unlike combos which auto-pick variantes[0]).
            const sel: PromoItem[] = yaSeleccionado
              ? promo.platoIds.filter((i: PromoItem) => i.plato_id !== p.id)
              : [...promo.platoIds, { plato_id: p.id, variante_id: null }]
            setPromo({ ...promo, platoIds: sel })
            setTouched(prev => ({ ...prev, platos: true }))
          }} style={{
            padding: '8px 10px',
            borderBottom: '1px solid var(--border-light)', cursor: 'pointer',
            background: isSelected ? 'var(--color-accent-light)' : 'transparent',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '12px' }}>{p.nombre}</span>
                {(() => { const h = getHorarioPlato(p.id); return h ? <span style={{ fontSize: '9px', color: 'var(--color-warning)', marginLeft: '4px' }}><Icono icono={Clock} size={10} style={{ verticalAlign: '-1px' }} /> {formato12h(h.hora_inicio)}–{formato12h(h.hora_fin)}</span> : null })()}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>${formatoPrecio(precioMostrar)}</span>
                {isSelected && <span style={{ color: 'var(--color-accent)', lineHeight: 0 }}><Icono icono={Check} size={12} /></span>}
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
                    // Empty string = "todas las variantes" → store as null.
                    const sel = promo.platoIds.map((item: PromoItem) =>
                      item.plato_id === p.id ? { ...item, variante_id: (v as string) || null } : item
                    )
                    setPromo({ ...promo, platoIds: sel })
                  }}
                  options={[
                    { value: '', label: <span>Todas las variantes</span>, searchText: 'todas las variantes' },
                    ...(p.variantes ?? []).map((v: any) => ({
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
                    })),
                  ]}
                  placeholder="Todas las variantes"
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

      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Días activos:</div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        {['L', 'M', 'Mi', 'J', 'V', 'S', 'D'].map((d, i) => {
          const dias = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
          const sel = promo.dias.includes(dias[i])
          return (
            <div key={d} onClick={() => {
              setPromo({ ...promo, dias: sel ? promo.dias.filter(x => x !== dias[i]) : [...promo.dias, dias[i]] })
              setTouched(prev => ({ ...prev, dias: true }))
            }} className="tap-control" style={{
              width: '32px', height: '32px', borderRadius: '50%', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: '11px', cursor: 'pointer',
              background: sel ? 'var(--text-primary)' : 'var(--bg-secondary)',
              color: sel ? 'white' : 'var(--text-secondary)',
              border: sel ? 'none' : '1px solid var(--border-light)',
            }}>{d}</div>
          )
        })}
      </div>
      {intento && touched.dias && errores.dias && (
        <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
          {errores.dias}
        </div>
      )}
      {(() => {
        const tipoSet = !!promo.tipo
        const valorSet = promo.tipo === 'dos_por_uno' || (promo.valor && parseInt(promo.valor) > 0)
        const hasPlatos = promo.platoIds.length > 0

        if (!tipoSet || !valorSet || !hasPlatos) return null

        const platosSeleccionados = promo.platoIds
          .map(item => {
            const plato = todosPlatos.find(p => p.id === item.plato_id)
            if (!plato) return null
            // Locked variante drives both the preview price and the name suffix.
            let precioBase = plato.precio
            let varianteNombre: string | null = null
            if (item.variante_id) {
              const v = plato.variantes?.find(x => x.id === item.variante_id)
              if (v) { precioBase = v.precio; varianteNombre = v.nombre }
            }
            return { plato, precioBase, varianteNombre }
          })
          .filter(Boolean) as { plato: PlatoLite; precioBase: number; varianteNombre: string | null }[]

        return (
          <div style={{
            background: 'var(--color-green-light)',
            padding: '12px',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '12px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-green)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Vista previa
            </div>
            {promo.tipo === 'dos_por_uno' ? (
              <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                Compra 2 lleva 1 gratis (ahorro 50% en el segundo)
              </div>
            ) : (
              platosSeleccionados.map(({ plato, precioBase, varianteNombre }) => {
                const original = precioBase
                let final = 0
                let detalle = ''

                if (promo.tipo === 'descuento') {
                  const valorNum = parseInt(promo.valor)
                  final = Math.round(original * (1 - valorNum / 100))
                  detalle = `-${valorNum}%`
                }

                return (
                  <div key={plato.id} style={{
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                    padding: '4px 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {plato.nombre}{varianteNombre ? ` (${varianteNombre})` : ''}:
                    </span>
                    <span style={{ flexShrink: 0 }}>
                      <span style={{ textDecoration: 'line-through', color: 'var(--text-tertiary)', fontSize: '11px' }}>
                        ${formatoPrecio(original)}
                      </span>
                      {' → '}
                      <span style={{ fontWeight: 500 }}>
                        ${formatoPrecio(final)}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--color-green)', marginLeft: '4px' }}>
                        ({detalle})
                      </span>
                    </span>
                  </div>
                )
              })
            )}
          </div>
        )
      })()}
      {promo.platoIds.length > 0 && (() => {
        const platosConHorario = promo.platoIds.map(item => ({ id: item.plato_id, horario: getHorarioPlato(item.plato_id) })).filter(p => p.horario)
        if (platosConHorario.length === 0) return null
        const horarios = platosConHorario.map(p => `${p.horario!.hora_inicio}–${p.horario!.hora_fin}`)
        return (
          <div style={{ fontSize: '11px', color: 'var(--color-warning)', background: 'var(--color-warning-light)', padding: '8px 10px', borderRadius: '6px', marginBottom: '8px' }}>
            <Icono icono={TriangleAlert} size={11} style={{ verticalAlign: '-1px' }} /> Esta promo incluye platos con horario restringido ({horarios.join(', ')}). La promo solo será visible cuando todos los platos estén activos.
          </div>
        )
      })()}
      {intento && !guardando && !guardado && errores.conflicto && (
        <div style={{ fontSize: '11px', color: 'var(--color-danger)', background: 'var(--color-danger-light)', padding: '8px 10px', borderRadius: '6px', marginBottom: '8px' }}>
          {errores.conflicto}
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px' }}>
        <Boton onClick={promoInicial ? actualizar : agregar} disabled={guardando || guardado}
          style={{ flex: 1, opacity: valido ? 1 : 0.5, cursor: valido ? 'pointer' : 'default' }}>
          {guardando ? 'Guardando...' : guardado ? <><Icono icono={Check} size={14} /> Guardado</> : promoInicial ? 'Guardar cambios' : 'Crear'}
        </Boton>
        <Boton variante="secundario" onClick={onClose} style={{ flex: 1 }}>Cancelar</Boton>
      </div>
    </div>
  )
}

export default memo(PromoForm)
