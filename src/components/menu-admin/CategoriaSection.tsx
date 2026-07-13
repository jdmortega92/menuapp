'use client'

import { memo, useState } from 'react'
import { ChevronUp, ChevronDown, MoreHorizontal, X, Check } from 'lucide-react'
import Icono, { estiloBotonIcono } from '@/components/ui/Icono'
import Boton from '@/components/ui/Boton'
import { createClient } from '@/lib/supabase-browser'
import { formato12h } from '@/lib/time'
import { validarCategoria } from './CategoriaForm'
import PlatoForm from './PlatoForm'
import PlatoEditPanel from './PlatoEditPanel'
import PlatoCard from './PlatoCard'
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

type CategoriaRow = {
  id: string
  nombre: string
  orden: number
  platos: PlatoRow[]
  hora_inicio?: string | null
  hora_fin?: string | null
}

// Form inline de renombrar categoría (privado de la sección). Fresh-mount por
// apertura: la página conserva el puntero editandoCategoria; nombre + cuarteto
// viven aquí (siembra desde nombreInicial). Update + mutate + tick → onClose.
function CategoriaRenameForm({
  catId,
  nombreInicial,
  mutateCategoriasYPlatos,
  onClose,
}: {
  catId: string
  nombreInicial: string
  mutateCategoriasYPlatos: () => Promise<unknown>
  onClose: () => void
}) {
  const [nombre, setNombre] = useState(nombreInicial)
  const [intento, setIntento] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  async function guardar() {
    setIntento(true)
    setTouched({ nombre: true })
    const errores = validarCategoria(nombre)
    if (Object.keys(errores).length > 0) return
    setGuardando(true)
    const supabase = createClient()
    await supabase.from('categorias').update({ nombre }).eq('id', catId)
    await mutateCategoriasYPlatos()
    setGuardando(false)
    setGuardado(true)
    setTimeout(() => onClose(), 1200)
  }

  const errores = validarCategoria(nombre)
  const valido = Object.keys(errores).length === 0
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input className="input" value={nombre} maxLength={40} onChange={(e) => setNombre(e.target.value)}
          autoFocus
          onBlur={() => setTouched(prev => ({ ...prev, nombre: true }))}
          onKeyDown={(e) => e.key === 'Enter' && guardar()}
          style={{
            flex: 1,
            borderColor: intento && touched.nombre && errores.nombre ? 'var(--color-danger)' : undefined,
          }} />
        <Boton tamano="sm" onClick={guardar} disabled={guardando || guardado}
          style={{ opacity: valido ? 1 : 0.5, cursor: valido ? 'pointer' : 'default' }}>
          {guardando ? 'Guardando...' : guardado ? <><Icono icono={Check} size={14} /> Guardado</> : 'OK'}
        </Boton>
        <Boton variante="secundario" tamano="sm" onClick={onClose} aria-label="Cerrar">
          <Icono icono={X} size={14} />
        </Boton>
      </div>
      {intento && touched.nombre && errores.nombre && (
        <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: '4px' }}>
          {errores.nombre}
        </div>
      )}
    </div>
  )
}

// ── CategoriaSection — sección de una categoría en la tab Platos (Fase 3) ──
// React.memo: un render de página (puntero/aviso/SWR ajeno) salta la sección
// entera mientras sus props no cambien. Contrato de props: escalares (punteros
// convertidos a boolean/scalar POR sección), objetos de useMemo (cat estable
// salvo búsqueda activa, que re-crea el array filtrado — y entonces SÍ debe
// re-renderizar), y callbacks estables (la página delega vía ref a la versión
// del último render, sin closures viejos). Las filas internas son PlatoCard
// (memo, segunda capa): un re-render de sección no re-renderiza filas intactas.
function CategoriaSection({
  cat,
  catIdx,
  totalCategorias,
  renombrando,
  menuAbierto,
  formPlatoAbierto,
  ordenSiguientePlato,
  platoExpandido,
  restId,
  combos,
  promos,
  diaVarianteId,
  ganadorVarianteId,
  esBasico,
  fuePago,
  fotosUsadas,
  puedeSubirFoto,
  subiendoFoto,
  mutateCategoriasYPlatos,
  onMoverCategoria,
  onToggleMenuCategoria,
  onCerrarMenuCategoria,
  onAbrirRename,
  onCerrarRename,
  onAbrirHorario,
  onRequestDeleteCategoria,
  onToggleFormPlato,
  onCerrarFormPlato,
  onToggleExpand,
  onMoverPlato,
  onToggleDisponible,
  onRequestDeletePlato,
  onSelectFoto,
  onCascadeCleanup,
  onCerrarEditPlato,
}: {
  cat: CategoriaRow
  catIdx: number
  totalCategorias: number
  renombrando: boolean
  menuAbierto: boolean
  formPlatoAbierto: boolean
  ordenSiguientePlato: number
  platoExpandido: string | null
  restId: string | undefined
  combos: any[]
  promos: any[]
  diaVarianteId: string | null
  ganadorVarianteId: string | null
  esBasico: boolean
  fuePago: boolean
  fotosUsadas: number
  puedeSubirFoto: boolean
  subiendoFoto: boolean
  mutateCategoriasYPlatos: () => Promise<unknown>
  onMoverCategoria: (catId: string, direccion: 'arriba' | 'abajo') => void
  onToggleMenuCategoria: (catId: string) => void
  onCerrarMenuCategoria: () => void
  onAbrirRename: (catId: string) => void
  onCerrarRename: () => void
  onAbrirHorario: (catId: string) => void
  onRequestDeleteCategoria: (catId: string) => void
  onToggleFormPlato: (catId: string) => void
  onCerrarFormPlato: () => void
  onToggleExpand: (platoId: string) => void
  onMoverPlato: (categoriaId: string, platoId: string, direccion: 'arriba' | 'abajo') => void
  onToggleDisponible: (categoriaId: string, platoId: string) => void
  onRequestDeletePlato: (categoriaId: string, platoId: string) => void
  onSelectFoto: (platoId: string, categoriaId: string, file: File) => void
  onCascadeCleanup: () => Promise<void>
  onCerrarEditPlato: () => void
}) {
  return (
    <div style={{ padding: '0 20px', marginBottom: '14px', position: 'relative' }}>

      {/* Header categoría */}
      {renombrando ? (
        <CategoriaRenameForm
          catId={cat.id}
          nombreInicial={cat.nombre}
          mutateCategoriasYPlatos={mutateCategoriasYPlatos}
          onClose={onCerrarRename}
        />
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Flechas mover categoría — par horizontal (44px efectivos apilados
                se solaparían verticalmente; espeja el patrón de PlatoCard) */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button type="button" aria-label="Subir categoría" className="tap-target-44"
                onClick={() => onMoverCategoria(cat.id, 'arriba')}
                style={{ ...estiloBotonIcono, cursor: catIdx > 0 ? 'pointer' : 'default', color: catIdx > 0 ? 'var(--text-secondary)' : 'var(--border-light)' }}>
                <Icono icono={ChevronUp} size={16} />
              </button>
              <button type="button" aria-label="Bajar categoría" className="tap-target-44"
                onClick={() => onMoverCategoria(cat.id, 'abajo')}
                style={{ ...estiloBotonIcono, cursor: catIdx < totalCategorias - 1 ? 'pointer' : 'default', color: catIdx < totalCategorias - 1 ? 'var(--text-secondary)' : 'var(--border-light)' }}>
                <Icono icono={ChevronDown} size={16} />
              </button>
            </div>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>{cat.nombre}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>{cat.platos.length}</span>
            {cat.hora_inicio && cat.hora_fin && (
              <span style={{ fontSize: '10px', color: 'var(--color-info)', background: 'var(--color-info-light)', padding: '2px 6px', borderRadius: '4px' }}>
                {formato12h(cat.hora_inicio)}–{formato12h(cat.hora_fin)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <span onClick={() => onToggleFormPlato(cat.id)} className="tap-cta"
              style={{ fontSize: '12px', color: 'var(--color-info)', cursor: 'pointer' }}>+ Plato</span>
            <button type="button" aria-label="Opciones de categoría" className="tap-control tap-target-44"
              onClick={() => onToggleMenuCategoria(cat.id)}
              style={{ ...estiloBotonIcono, color: 'var(--text-tertiary)', cursor: 'pointer' }}>
              <Icono icono={MoreHorizontal} size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Menú ⋯ categoría */}
      {menuAbierto && (
        <>
          <div onClick={onCerrarMenuCategoria} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
          <div style={{
            position: 'absolute', right: '20px', top: '30px', zIndex: 70,
            background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-sm)', overflow: 'hidden', width: '180px',
            boxShadow: 'var(--shadow-lg)', animation: 'scaleIn 0.15s ease',
          }}>
            <div onClick={() => onAbrirRename(cat.id)} className="tap-row"
              style={{ padding: '10px 14px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid var(--border-light)' }}>Renombrar</div>
            <div onClick={() => onAbrirHorario(cat.id)} className="tap-row"
              style={{ padding: '10px 14px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid var(--border-light)' }}>Horario de visibilidad</div>
            <div onClick={() => onRequestDeleteCategoria(cat.id)} className="tap-row-danger"
              style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--color-danger)', cursor: 'pointer' }}>Eliminar categoría</div>
          </div>
        </>
      )}

      {/* Form nuevo plato */}
      {formPlatoAbierto && (
        <PlatoForm
          restId={restId}
          categoriaId={cat.id}
          categoriaNombre={cat.nombre}
          ordenSiguiente={ordenSiguientePlato}
          mutateCategoriasYPlatos={mutateCategoriasYPlatos}
          onClose={onCerrarFormPlato}
        />
      )}

      {/* Platos */}
      {cat.platos.map((plato, pIdx) => (
        <div key={plato.id} className="card" style={{ marginBottom: '8px', opacity: plato.disponible ? 1 : 0.5, overflow: 'hidden' }}>
          <PlatoCard
            plato={plato}
            categoriaId={cat.id}
            pIdx={pIdx}
            totalPlatos={cat.platos.length}
            onToggleExpand={onToggleExpand}
            onMoverPlato={onMoverPlato}
            onToggleDisponible={onToggleDisponible}
            onRequestDeletePlato={onRequestDeletePlato}
          />

          {/* Panel edición expandido */}
          {platoExpandido === plato.id && (
            <PlatoEditPanel
              plato={plato}
              categoriaId={cat.id}
              combos={combos}
              promos={promos}
              diaVarianteId={diaVarianteId}
              ganadorVarianteId={ganadorVarianteId}
              esBasico={esBasico}
              fuePago={fuePago}
              fotosUsadas={fotosUsadas}
              puedeSubirFoto={puedeSubirFoto}
              subiendoFoto={subiendoFoto}
              onSelectFoto={onSelectFoto}
              mutateCategoriasYPlatos={mutateCategoriasYPlatos}
              onCascadeCleanup={onCascadeCleanup}
              onClose={onCerrarEditPlato}
            />
          )}
        </div>
      ))}
    </div>
  )
}

export default memo(CategoriaSection)
