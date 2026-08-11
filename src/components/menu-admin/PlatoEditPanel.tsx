'use client'

import { memo, useRef, useState } from 'react'
import { Camera, Check } from 'lucide-react'
import Icono from '@/components/ui/Icono'
import Boton from '@/components/ui/Boton'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { LIMITE_FOTOS_GRATIS } from '@/lib/fotosGate'
import CampoTexto from '@/components/ui/CampoTexto'
import Modal from '@/components/ui/Modal'
import VarianteEditor, { construirTextoVinculaciones } from './VarianteEditor'
import { validarPlato, MAX_DESC } from './PlatoForm'
import type { Variante } from '@/types'

type PlatoRow = {
  id: string
  nombre: string
  precio: number
  descripcion: string
  disponible: boolean
  foto_url: string | null
  variantes?: Variante[]
}

type EditDraft = {
  nombre: string
  precio: string
  descripcion: string
  hasVariantes: boolean
  // _pendingDelete: variante persistida marcada para quitar al guardar (sigue visible,
  // tachada, con Undo). Solo aplica a variantes con id; las frescas se quitan directo.
  variantes: { id?: string; nombre: string; precio: string; _pendingDelete?: boolean }[]
}

// ── PlatoEditPanel — panel expandido de edición de plato (Fase 3) ──
// Fresh-mount: la página conserva solo el puntero platoExpandido y monta
// {platoExpandido === plato.id && <PlatoEditPanel/>}; el borrador y el snapshot
// originalVariantes se siembran UNA vez por montaje desde la prop `plato` (lo que
// antes hacía el click de expandir). Lleva su propia maquinaria de flush completa
// (registro + espejo en ref + commits + guardado en el mismo componente).
// cascadeWarning vive AQUÍ: se setea en guardar() y su onConfirm reanuda doSave()
// — la continuación nunca cruza el límite del componente. Nota: Modal no usa
// portal (position: fixed in situ) y este panel entra con animation fadeInUp
// (transform); es seguro porque el modal solo puede abrirse tras un click en
// Guardar, mucho después de que el transform de los 0.2s de animación terminó
// (un ancestro con transform re-anclaría el fixed).
// El pipeline de foto sigue siendo de la página (hasta la extracción de
// CropModal): aquí solo se renderiza la UI y la selección sube por onSelectFoto.
function PlatoEditPanel({
  plato,
  categoriaId,
  combos,
  promos,
  diaVarianteId,
  ganadorVarianteId,
  esBasico,
  fuePago,
  fotosUsadas,
  puedeSubirFoto,
  subiendoFoto,
  onSelectFoto,
  mutateCategoriasYPlatos,
  onCascadeCleanup,
  onClose,
}: {
  plato: PlatoRow
  categoriaId: string
  combos: any[]
  promos: any[]
  diaVarianteId: string | null
  ganadorVarianteId: string | null
  esBasico: boolean
  fuePago: boolean
  fotosUsadas: number
  puedeSubirFoto: boolean
  subiendoFoto: boolean
  onSelectFoto: (platoId: string, categoriaId: string, file: File) => void
  mutateCategoriasYPlatos: () => Promise<unknown>
  onCascadeCleanup: () => Promise<void>
  onClose: () => void
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<EditDraft>(() => {
    const variantesSorted = (plato.variantes || []).slice().sort((a, b) => a.orden - b.orden)
    return {
      nombre: plato.nombre,
      precio: plato.precio.toString(),
      descripcion: plato.descripcion || '',
      hasVariantes: variantesSorted.length > 0,
      variantes: variantesSorted.map(v => ({
        id: v.id,
        nombre: v.nombre,
        precio: v.precio.toString(),
      })),
    }
  })
  // Snapshot de las variantes persistidas al abrir — la base contra la que el
  // guardado deriva inserts/updates/deletes. Se siembra una vez por montaje.
  const [originalVariantes] = useState<{ id: string; nombre: string; precio: number; orden: number }[]>(() =>
    (plato.variantes || []).slice().sort((a, b) => a.orden - b.orden).map(v => ({
      id: v.id,
      nombre: v.nombre,
      precio: v.precio,
      orden: v.orden,
    }))
  )
  const [intento, setIntento] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [cascadeWarning, setCascadeWarning] = useState<{
    rowsToDelete: { id: string; nombre: string }[];
    combosCount: number;
    destacadosCount: number;
    promosCount: number;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null)

  // ── Infra de inputs con borrador local (CampoTexto) — anti-lag de tecleo ──
  // Registro de flush + espejo en ref + commits: ver nota en PlatoForm. guardar()
  // llama flushCampos() y lee el espejo SINCRÓNICAMENTE antes de validar.
  const camposFlushRef = useRef<Set<() => void>>(new Set())
  function flushCampos() { camposFlushRef.current.forEach(f => f()) }
  const draftRef = useRef(draft)
  draftRef.current = draft
  function commitDraft(patch: Partial<EditDraft>) {
    const next = { ...draftRef.current, ...patch }
    draftRef.current = next
    setDraft(next)
  }
  function commitVariante(i: number, patch: Partial<{ nombre: string; precio: string }>) {
    const variantes = [...draftRef.current.variantes]
    variantes[i] = { ...variantes[i], ...patch }
    commitDraft({ variantes })
  }

  async function guardar() {
    // Confirmar borradores pendientes (tecleo sin blur) y leer el snapshot sincrónico.
    flushCampos()
    const editPlato = draftRef.current
    setIntento(true)
    setTouched({ nombre: true, precio: true })

    const errores = validarPlato(editPlato)
    if (Object.keys(errores).length > 0) return

    let precioParaUpdate: number
    if (editPlato.hasVariantes) {
      // El "desde $X" del plato = min sobre las variantes que SOBREVIVEN (no marcadas).
      const precios = editPlato.variantes.filter(v => !v._pendingDelete).map(v => parseInt(v.precio))
      precioParaUpdate = Math.min(...precios)
    } else {
      precioParaUpdate = parseInt(editPlato.precio)
    }

    let rowsToInsert: { id?: string; nombre: string; precio: string; _idx: number }[] = []
    let rowsToUpdate: { id?: string; nombre: string; precio: string; _idx: number }[] = []
    let rowsToDelete: { id: string; nombre: string; precio: number; orden: number }[] = []

    if (editPlato.hasVariantes) {
      // Variantes que sobreviven al guardado (no marcadas para quitar), en orden de
      // render. El _idx (→ orden) se asigna sobre ESTA lista filtrada para que el orden
      // quede contiguo, sin huecos dejados por las filas marcadas (que siguen en el array
      // de edición pero no se persisten).
      const sobrevivientes = editPlato.variantes
        .filter(v => !v._pendingDelete)
        .map((v, idx) => ({ ...v, _idx: idx }))

      // formIds = ids que SE CONSERVAN. Excluye las marcadas → caen en rowsToDelete abajo.
      const formIds = new Set(sobrevivientes.filter(v => v.id).map(v => v.id!))

      rowsToInsert = sobrevivientes.filter(v => !v.id)

      // Persistida que ya no está en el form (incluye las marcadas _pendingDelete, pues
      // quedaron fuera de formIds) → borrar. Una sola derivación, sin doble conteo.
      rowsToDelete = originalVariantes.filter(o => !formIds.has(o.id))

      rowsToUpdate = sobrevivientes.filter(v => {
        if (!v.id) return false
        const orig = originalVariantes.find(o => o.id === v.id)
        if (!orig) return false
        const precioInt = parseInt(v.precio)
        return (
          v.nombre.trim() !== orig.nombre ||
          precioInt !== orig.precio ||
          v._idx !== orig.orden
        )
      })
    } else {
      // Toggle OFF — delete ALL original variantes regardless of in-memory state
      rowsToInsert = []
      rowsToUpdate = []
      rowsToDelete = [...originalVariantes]
    }

    if (rowsToDelete.length > 0) {
      const idsToDelete = rowsToDelete.map(r => r.id)
      const supabase = createClient()
      const [combosQ, dia, ganador, promosQ] = await Promise.all([
        supabase.from('combo_platos').select('*', { count: 'exact', head: true }).in('variante_id', idsToDelete),
        supabase.from('plato_del_dia').select('*', { count: 'exact', head: true }).in('variante_id', idsToDelete),
        supabase.from('plato_ganador').select('*', { count: 'exact', head: true }).in('variante_id', idsToDelete),
        supabase.from('promo_platos').select('*', { count: 'exact', head: true }).in('variante_id', idsToDelete),
      ])
      const combosCount = combosQ.count || 0
      const destacadosCount = (dia.count || 0) + (ganador.count || 0)
      const promosCount = promosQ.count || 0
      const refCount = combosCount + destacadosCount + promosCount
      if (refCount > 0) {
        setCascadeWarning({
          rowsToDelete: rowsToDelete.map(r => ({ id: r.id, nombre: r.nombre })),
          combosCount,
          destacadosCount,
          promosCount,
          onConfirm: () => {
            doSave(precioParaUpdate, rowsToInsert, rowsToUpdate, rowsToDelete)
          },
          onCancel: () => {},
        })
        return
      }
    }

    await doSave(precioParaUpdate, rowsToInsert, rowsToUpdate, rowsToDelete)
  }

  async function doSave(
    precioParaUpdate: number,
    rowsToInsert: { nombre: string; precio: string; _idx: number }[],
    rowsToUpdate: { id?: string; nombre: string; precio: string; _idx: number }[],
    rowsToDelete: { id: string; nombre: string; precio: number; orden: number }[],
  ) {
    // Snapshot sincrónico: nombre/descripcion/hasVariantes vienen del borrador confirmado
    // (guardar ya llamó flushCampos antes de invocar esta función).
    const editPlato = draftRef.current
    setGuardando(true)
    const supabase = createClient()

    const originalDisponible = plato.disponible ?? true

    if (editPlato.hasVariantes) {
      await supabase.from('platos').update({ disponible: false }).eq('id', plato.id)
    }

    const { error: platoErr } = await supabase
      .from('platos')
      .update({
        nombre: editPlato.nombre.trim(),
        precio: precioParaUpdate,
        descripcion: editPlato.descripcion.trim() || null,
      })
      .eq('id', plato.id)

    if (platoErr) {
      console.error('Error updating plato:', platoErr)
      setGuardando(false)
      if (editPlato.hasVariantes && originalDisponible) {
        await supabase.from('platos').update({ disponible: true }).eq('id', plato.id)
      }
      return
    }

    if (rowsToDelete.length > 0) {
      const { error } = await supabase
        .from('plato_variantes')
        .delete()
        .in('id', rowsToDelete.map(r => r.id))
      if (error) console.error('Error deleting variantes:', error)
    }

    for (const v of rowsToUpdate) {
      const { error } = await supabase
        .from('plato_variantes')
        .update({
          nombre: v.nombre.trim(),
          precio: parseInt(v.precio),
          orden: v._idx,
        })
        .eq('id', v.id!)
      if (error) console.error('Error updating variante:', error)
    }

    if (rowsToInsert.length > 0) {
      const inserts = rowsToInsert.map(v => ({
        plato_id: plato.id,
        nombre: v.nombre.trim(),
        precio: parseInt(v.precio),
        orden: v._idx,
      }))
      const { error } = await supabase
        .from('plato_variantes')
        .insert(inserts)
      if (error) console.error('Error inserting variantes:', error)
    }

    if (editPlato.hasVariantes && originalDisponible) {
      await supabase.from('platos').update({ disponible: true }).eq('id', plato.id)
    }

    await mutateCategoriasYPlatos()
    // Si se borraron variantes, su cascada en promo_platos/combo_platos pudo dejar promos
    // sin platos o combos incompletos — la limpieza (y su aviso) es de la página.
    if (rowsToDelete.length > 0) {
      await onCascadeCleanup()
    }

    setGuardando(false)
    setGuardado(true)
    setTimeout(() => onClose(), 1200)
  }

  const errores = validarPlato(draft)
  const valido = Object.keys(errores).length === 0
  return (
    <div style={{
      padding: '0 12px 14px', borderTop: '1px solid var(--border-light)',
      paddingTop: '14px', animation: 'fadeInUp 0.2s ease',
    }}>
      <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '10px' }}>Editar plato</div>
      <CampoTexto className="input" placeholder="Nombre"
        value={draft.nombre}
        onCommit={(val) => commitDraft({ nombre: val })}
        flushRegistry={camposFlushRef}
        maxLength={60}
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
      {!draft.hasVariantes && (
        <>
          <CampoTexto className="input" type="number" inputMode="numeric" placeholder="Precio"
            value={draft.precio}
            onCommit={(val) => commitDraft({ precio: val })}
            flushRegistry={camposFlushRef}
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
        </>
      )}
      <div style={{ position: 'relative', marginBottom: '10px' }}>
        <CampoTexto className="input" placeholder="Descripción"
          value={draft.descripcion}
          onCommit={(val) => commitDraft({ descripcion: val })}
          flushRegistry={camposFlushRef}
          showCounter maxLength={MAX_DESC}
          style={{ paddingRight: '50px' }} />
      </div>

      {/* Toggle hasVariantes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', marginBottom: '8px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
          <input
            type="checkbox"
            className="casilla"
            checked={draft.hasVariantes}
            onChange={(e) => {
              const turningOff = !e.target.checked && draft.hasVariantes
              if (turningOff && draft.variantes.length > 0) {
                const precios = draft.variantes
                  .map(v => parseInt(v.precio))
                  .filter(p => !isNaN(p))
                const minPrecio = precios.length > 0 ? Math.min(...precios).toString() : ''
                setDraft({
                  ...draft,
                  hasVariantes: false,
                  precio: minPrecio,
                })
              } else {
                setDraft({ ...draft, hasVariantes: e.target.checked })
              }
            }}
          />
          <span>Este plato tiene variantes (ej: tamaños, sabores)</span>
        </label>
      </div>

      {/* Variantes editor — visible only when hasVariantes */}
      {draft.hasVariantes && (
        <VarianteEditor
          variantes={draft.variantes}
          intento={intento}
          errores={errores}
          onFieldCommit={commitVariante}
          onRowsChange={(variantes) => setDraft({ ...draft, variantes })}
          flushRegistry={camposFlushRef}
          allowPendingDelete
          pendingMeta={{
            combos,
            promos,
            diaVarianteId,
            ganadorVarianteId,
          }}
        />
      )}

      {/* Foto (STRATEGIC.2): ya no es exclusiva de Básico. Tres estados en gratis:
          (1) nunca-pago con cupo (o reemplazando la existente: upsert, no consume) →
          control activo + contador; (2) nunca-pago en el límite y ESTE plato sin
          foto → control deshabilitado + upsell; (3) fue_pago (downgrade) → sin
          control; el preview sigue visible (la foto es data del dueño) con el aviso
          de que en el público está oculta. En Básico/Pro: idéntico a antes. */}
      {(() => {
        const bloqueadoPorLimite = !esBasico && !fuePago && !puedeSubirFoto && plato.foto_url == null
        const inhabilitado = subiendoFoto || bloqueadoPorLimite
        const sinControl = !esBasico && fuePago
        return (
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Foto del plato</div>
            {plato.foto_url && (
              <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginBottom: '8px' }}>
                <img src={plato.foto_url} alt={plato.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
            {sinControl ? (
              <div onClick={() => router.push('/suscripcion')} className="tap-card" style={{
                background: 'var(--color-warning-light)', borderRadius: 'var(--radius-sm)',
                padding: '10px 12px', fontSize: '11px', color: 'var(--color-warning)',
                lineHeight: 1.4, cursor: 'pointer',
              }}>
                Tus fotos están ocultas en el plan gratis. <span style={{ fontWeight: 500 }}>Vuelve a Básico para mostrarlas →</span>
              </div>
            ) : (
              <>
                <label className="tap-cta" style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontSize: '12px',
                  border: '1px solid var(--border-light)', cursor: inhabilitado ? 'not-allowed' : 'pointer',
                  color: inhabilitado ? 'var(--text-tertiary)' : 'var(--color-accent)',
                  opacity: inhabilitado ? 0.6 : 1,
                }}>
                  {subiendoFoto ? 'Subiendo...' : plato.foto_url ? 'Cambiar foto' : <><Icono icono={Camera} size={14} /> Subir foto</>}
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    disabled={inhabilitado}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) onSelectFoto(plato.id, categoriaId, file)
                    }} />
                </label>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}>JPG o PNG · Máximo 10MB · Se redimensiona a 800px</div>
                {!esBasico && (
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                    Fotos: {fotosUsadas} de {LIMITE_FOTOS_GRATIS} (plan gratis)
                  </div>
                )}
                {bloqueadoPorLimite && (
                  <div onClick={() => router.push('/suscripcion')} className="tap-card" style={{
                    background: 'var(--color-warning-light)', borderRadius: 'var(--radius-sm)',
                    padding: '10px 12px', fontSize: '11px', color: 'var(--color-warning)',
                    lineHeight: 1.4, cursor: 'pointer', marginTop: '6px',
                  }}>
                    Alcanzaste las {LIMITE_FOTOS_GRATIS} fotos del plan gratis. <span style={{ fontWeight: 500 }}>Actualiza a Básico para fotos ilimitadas →</span>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })()}
      <div style={{ display: 'flex', gap: '8px' }}>
        <Boton onClick={guardar} disabled={guardando || guardado}
          style={{ flex: 1, opacity: valido ? 1 : 0.5, cursor: valido ? 'pointer' : 'default' }}>
          {guardando ? 'Guardando...' : guardado ? <><Icono icono={Check} size={14} /> Guardado</> : 'Guardar'}
        </Boton>
        <Boton variante="secundario" onClick={onClose} style={{ flex: 1 }}>Cancelar</Boton>
      </div>

      {/* Modal aviso cascade (al eliminar variantes vinculadas) */}
      {cascadeWarning && (
        <Modal
          isOpen={!!cascadeWarning}
          onClose={() => {
            cascadeWarning.onCancel()
            setCascadeWarning(null)
          }}
          title="Vas a quitar variantes vinculadas"
          maxWidth={460}
        >
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            {cascadeWarning.rowsToDelete.length === 1
              ? 'Esta variante tiene referencias activas:'
              : `Estas ${cascadeWarning.rowsToDelete.length} variantes tienen referencias activas:`}
          </div>

          <ul style={{ margin: 0, marginBottom: '14px', paddingLeft: '20px', fontSize: '13px', color: 'var(--text-primary)' }}>
            {cascadeWarning.rowsToDelete.map(r => (
              <li key={r.id} style={{ marginBottom: '4px' }}>{r.nombre || '(sin nombre)'}</li>
            ))}
          </ul>

          {(() => {
            // Frase dinámica (helper compartido): solo cláusulas con count > 0.
            const texto = construirTextoVinculaciones([
              { n: cascadeWarning.combosCount, sing: 'combo', plur: 'combos' },
              { n: cascadeWarning.destacadosCount, sing: 'destacado', plur: 'destacados' },
              { n: cascadeWarning.promosCount, sing: 'promo', plur: 'promos' },
            ])
            if (texto === null) return null
            return (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                Vinculadas a {texto}.
              </div>
            )
          })()}

          <div style={{ fontSize: '12px', color: 'var(--color-danger)', marginBottom: '16px' }}>
            Si continuás, esas vinculaciones se eliminarán automáticamente.
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Boton
              variante="peligro"
              onClick={() => {
                const cb = cascadeWarning.onConfirm
                setCascadeWarning(null)
                cb()
              }}
              style={{ flex: 1 }}
            >
              Sí, continuar
            </Boton>
            <Boton
              variante="secundario"
              onClick={() => {
                const cb = cascadeWarning.onCancel
                setCascadeWarning(null)
                cb()
              }}
              style={{ flex: 1 }}
            >
              Cancelar
            </Boton>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default memo(PlatoEditPanel)
