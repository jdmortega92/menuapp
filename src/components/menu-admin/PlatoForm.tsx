'use client'

import { memo, useRef, useState } from 'react'
import { Camera, Check } from 'lucide-react'
import Icono from '@/components/ui/Icono'
import Boton from '@/components/ui/Boton'
import { createClient } from '@/lib/supabase-browser'
import CampoTexto from '@/components/ui/CampoTexto'
import VarianteEditor from './VarianteEditor'

// Límites compartidos por los validadores de /menu (plato, combo, plato del día)
// y los contadores de descripción. Viven aquí desde la Fase 3 (antes eran consts
// del componente página).
export const MAX_DESC = 150
export const MAX_PRECIO = 10_000_000

// Validador de plato — module-level y puro. Lo comparten este form (crear) y el
// panel de edición de plato (que importa desde aquí mientras siga en la página).
export function validarPlato(state: {
  nombre: string;
  precio: string;
  hasVariantes?: boolean;
  variantes?: { nombre: string; precio: string; _pendingDelete?: boolean }[];
}): Record<string, string> {
  const e: Record<string, string> = {}
  if (!state.nombre.trim()) e.nombre = 'El nombre es obligatorio'

  if (state.hasVariantes) {
    const variantes = state.variantes || []
    // Solo cuentan/validan las variantes que SOBREVIVEN (las marcadas para quitar
    // no bloquean el guardado por sus campos, y no cuentan para el mínimo de 2).
    const sobreviven = variantes.filter(v => !v._pendingDelete)
    if (sobreviven.length < 2) {
      e.variantes = 'Necesitas al menos 2 variantes'
    } else {
      // Validar por índice ORIGINAL (las filas marcadas siguen en el array, los
      // estilos de error están keyed por índice de render).
      variantes.forEach((v, i) => {
        if (v._pendingDelete) return
        if (!v.nombre.trim()) {
          e[`variante_${i}_nombre`] = 'Nombre obligatorio'
        }
        const p = parseInt(v.precio)
        if (!v.precio || isNaN(p) || p <= 0) {
          e[`variante_${i}_precio`] = 'Precio inválido'
        } else if (p > MAX_PRECIO) {
          e[`variante_${i}_precio`] = 'Precio máximo $10.000.000'
        }
      })
    }
  } else {
    const precioNum = parseInt(state.precio)
    if (!state.precio || isNaN(precioNum) || precioNum <= 0) {
      e.precio = 'El precio debe ser mayor a 0'
    } else if (precioNum > MAX_PRECIO) {
      e.precio = 'El precio no puede superar $10.000.000'
    }
  }

  return e
}

type PlatoDraft = {
  nombre: string
  precio: string
  descripcion: string
  hasVariantes: boolean
  variantes: { nombre: string; precio: string }[]
}

// ── PlatoForm — "Nuevo plato en {categoría}" (Fase 3, patrón CategoriaForm) ──
// Fresh-mount: la página conserva solo el puntero mostrarFormPlato (qué categoría
// tiene el form abierto) y monta {mostrarFormPlato === cat.id && <PlatoForm/>}.
// Este es el primer form que se lleva la maquinaria de flush COMPLETA: registro
// local + espejo en ref + commit fns + guardado viven los CUATRO en este
// componente — el invariante de lectura sincrónica (flush → leer ref → validar →
// insertar) nunca cruza un límite de componente. El registro de la página queda
// solo para el panel de edición (hasta su propia extracción).
function PlatoForm({
  restId,
  categoriaId,
  categoriaNombre,
  ordenSiguiente,
  mutateCategoriasYPlatos,
  onClose,
}: {
  restId: string | undefined
  categoriaId: string
  categoriaNombre: string
  ordenSiguiente: number
  mutateCategoriasYPlatos: () => Promise<unknown>
  onClose: () => void
}) {
  const [plato, setPlato] = useState<PlatoDraft>({
    nombre: '',
    precio: '',
    descripcion: '',
    hasVariantes: false,
    variantes: [],
  })
  const [intento, setIntento] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  // ── Infra de inputs con borrador local (CampoTexto) — anti-lag de tecleo ──
  // Registro de flush: cada CampoTexto montado registra una función que confirma su
  // borrador pendiente. guardar() llama flushCampos() antes de validar, para no perder
  // la última edición si el usuario teclea y da Guardar sin que dispare el blur.
  const camposFlushRef = useRef<Set<() => void>>(new Set())
  function flushCampos() { camposFlushRef.current.forEach(f => f()) }
  // Espejo en ref del borrador. Se sincroniza con el estado en cada render y se
  // actualiza SINCRÓNICAMENTE al confirmar (commit), para que el guardado lea el
  // valor recién tecleado aunque setState aún no se haya aplicado.
  const platoRef = useRef(plato)
  platoRef.current = plato
  function commitPlato(patch: Partial<PlatoDraft>) {
    const next = { ...platoRef.current, ...patch }
    platoRef.current = next
    setPlato(next)
  }
  function commitVariante(i: number, patch: Partial<{ nombre: string; precio: string }>) {
    const variantes = [...platoRef.current.variantes]
    variantes[i] = { ...variantes[i], ...patch }
    commitPlato({ variantes })
  }

  async function guardar() {
    // Confirmar borradores pendientes (tecleo sin blur) y leer el snapshot sincrónico.
    flushCampos()
    const draft = platoRef.current
    setIntento(true)
    setTouched({ nombre: true, precio: true })

    const errores = validarPlato(draft)
    if (Object.keys(errores).length > 0 || !restId) return

    setGuardando(true)
    const supabase = createClient()

    let precioParaInsert: number
    if (draft.hasVariantes) {
      const precios = draft.variantes.map(v => parseInt(v.precio))
      precioParaInsert = Math.min(...precios)
    } else {
      precioParaInsert = parseInt(draft.precio)
    }

    const { data: platoData, error: platoError } = await supabase
      .from('platos')
      .insert({
        restaurante_id: restId,
        categoria_id: categoriaId,
        nombre: draft.nombre.trim(),
        precio: precioParaInsert,
        descripcion: draft.descripcion.trim() || null,
        disponible: !draft.hasVariantes,
        orden: ordenSiguiente,
      })
      .select()
      .single()

    if (platoError || !platoData) {
      setGuardando(false)
      console.error('Error al crear plato:', platoError)
      return
    }

    if (draft.hasVariantes && draft.variantes.length > 0) {
      const variantesParaInsert = draft.variantes.map((v, i) => ({
        plato_id: platoData.id,
        nombre: v.nombre.trim(),
        precio: parseInt(v.precio),
        orden: i,
      }))

      const { error: variantesError } = await supabase
        .from('plato_variantes')
        .insert(variantesParaInsert)

      if (variantesError) {
        console.error('Error al insertar variantes, rollback plato:', variantesError)
        await supabase.from('platos').delete().eq('id', platoData.id)
        setGuardando(false)
        return
      }

      const { error: activateError } = await supabase
        .from('platos')
        .update({ disponible: true })
        .eq('id', platoData.id)

      if (activateError) {
        console.error('Error al activar plato:', activateError)
      }
    }

    await mutateCategoriasYPlatos()

    setGuardado(true)
    setGuardando(false)
    setTimeout(() => onClose(), 1200)
  }

  const errores = validarPlato(plato)
  const valido = Object.keys(errores).length === 0
  return (
    <div className="card" style={{ padding: '14px', marginBottom: '8px' }}>
      <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Nuevo plato en {categoriaNombre}</div>
      <CampoTexto className="input" placeholder="Nombre del plato" autoFocus
        value={plato.nombre}
        onCommit={(val) => commitPlato({ nombre: val })}
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
      {!plato.hasVariantes && (
        <>
          <CampoTexto className="input" type="number" inputMode="numeric" placeholder="Precio (ej: 18000)"
            value={plato.precio}
            onCommit={(val) => commitPlato({ precio: val })}
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
        <CampoTexto className="input" placeholder="Descripción (opcional)"
          value={plato.descripcion}
          onCommit={(val) => commitPlato({ descripcion: val })}
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
            checked={plato.hasVariantes}
            onChange={(e) => setPlato({ ...plato, hasVariantes: e.target.checked })}
          />
          <span>Este plato tiene variantes (ej: tamaños, sabores)</span>
        </label>
      </div>

      {/* Variantes editor — visible only when hasVariantes */}
      {plato.hasVariantes && (
        <VarianteEditor
          variantes={plato.variantes}
          intento={intento}
          errores={errores}
          onFieldCommit={commitVariante}
          onRowsChange={(variantes) => setPlato({ ...plato, variantes })}
          flushRegistry={camposFlushRef}
          allowPendingDelete={false}
        />
      )}

      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Icono icono={Camera} size={14} />
        Podrás agregar foto después de crear el plato
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <Boton onClick={guardar} disabled={guardando || guardado}
          style={{ flex: 1, opacity: valido ? 1 : 0.5, cursor: valido ? 'pointer' : 'default' }}>
          {guardando ? 'Guardando...' : guardado ? <><Icono icono={Check} size={14} /> Guardado</> : 'Agregar'}
        </Boton>
        <Boton variante="secundario" onClick={onClose} style={{ flex: 1 }}>Cancelar</Boton>
      </div>
    </div>
  )
}

export default memo(PlatoForm)
