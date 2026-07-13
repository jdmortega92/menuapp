'use client'

import { memo, useState } from 'react'
import { Check } from 'lucide-react'
import Icono from '@/components/ui/Icono'
import Boton from '@/components/ui/Boton'
import { createClient } from '@/lib/supabase-browser'

// Validador de categoría — module-level y puro. Lo comparten este form (crear)
// y el form inline de renombrar que sigue viviendo en /menu.
export function validarCategoria(nombre: string): Record<string, string> {
  const e: Record<string, string> = {}
  if (!nombre.trim()) e.nombre = 'El nombre es obligatorio'
  return e
}

// ── CategoriaForm — "Nueva categoría" (Fase 3, form plantilla) ──
// Patrón fresh-mount (semántica CalificarModal de Fase 2): la página conserva
// SOLO el puntero mostrarFormCategoria y monta {mostrar && <CategoriaForm/>}.
// El borrador + el cuarteto intento/touched/guardando/guardado viven AQUÍ: cada
// apertura monta una instancia fresca (reemplaza los resets manuales que antes
// hacían los botones de abrir/cancelar y el timer post-guardado). El insert +
// mutate viven aquí; la página solo recibe onClose. Sin CampoTexto/flush: el
// input es crudo (el tecleo re-renderiza solo este componente, que es chico).
function CategoriaForm({
  restId,
  ordenSiguiente,
  mutateCategoriasYPlatos,
  onClose,
}: {
  restId: string | undefined
  ordenSiguiente: number
  mutateCategoriasYPlatos: () => Promise<unknown>
  onClose: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [intento, setIntento] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  async function guardar() {
    setIntento(true)
    setTouched({ nombre: true })
    const errores = validarCategoria(nombre)
    if (Object.keys(errores).length > 0 || !restId) return
    setGuardando(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('categorias')
      .insert({ restaurante_id: restId, nombre, orden: ordenSiguiente })
      .select()
      .single()

    if (data) {
      await mutateCategoriasYPlatos()
    }
    setGuardando(false)
    setGuardado(true)
    // El tick "✓ Guardado" queda visible 1.2s y luego onClose desmonta el form
    // (el desmontaje reemplaza los resets manuales del timer original).
    setTimeout(() => onClose(), 1200)
  }

  const errores = validarCategoria(nombre)
  const valido = Object.keys(errores).length === 0
  return (
    <div style={{ padding: '0 20px', marginBottom: '14px' }}>
      <div className="card" style={{ padding: '14px' }}>
        <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Nueva categoría</div>
        <input className="input" placeholder="Ej: Postres" value={nombre} maxLength={40}
          onChange={(e) => setNombre(e.target.value)} autoFocus
          onBlur={() => setTouched(prev => ({ ...prev, nombre: true }))}
          onKeyDown={(e) => e.key === 'Enter' && guardar()}
          style={{
            marginBottom: intento && touched.nombre && errores.nombre ? '4px' : '10px',
            borderColor: intento && touched.nombre && errores.nombre ? 'var(--color-danger)' : undefined,
          }} />
        {intento && touched.nombre && errores.nombre && (
          <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '10px' }}>
            {errores.nombre}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px' }}>
          <Boton onClick={guardar} disabled={guardando || guardado}
            style={{ flex: 1, opacity: valido ? 1 : 0.5, cursor: valido ? 'pointer' : 'default' }}>
            {guardando ? 'Guardando...' : guardado ? <><Icono icono={Check} size={14} /> Guardado</> : 'Crear'}
          </Boton>
          <Boton variante="secundario" onClick={onClose} style={{ flex: 1 }}>Cancelar</Boton>
        </div>
      </div>
    </div>
  )
}

export default memo(CategoriaForm)
