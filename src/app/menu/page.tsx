'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks'
import { useCategoriasYPlatos } from '@/hooks/data/useCategoriasYPlatos'
import { usePlatoDelDia } from '@/hooks/data/usePlatoDelDia'
import { useCombos } from '@/hooks/data/useCombos'
import { usePromos } from '@/hooks/data/usePromos'
import { useConfigRestaurante } from '@/hooks/data/useConfigRestaurante'
import { usePlatoGanador } from '@/hooks/data/usePlatoGanador'
import { createClient } from '@/lib/supabase-browser'
import Cropper from 'react-easy-crop'
import TimePicker from '@/components/ui/TimePicker'
import Modal from '@/components/ui/Modal'
import BottomNav from '@/components/BottomNav'
import VarianteEditor, { construirTextoVinculaciones } from '@/components/menu-admin/VarianteEditor'
import CategoriaForm, { validarCategoria } from '@/components/menu-admin/CategoriaForm'
import PlatoForm, { MAX_DESC, MAX_PRECIO } from '@/components/menu-admin/PlatoForm'
import PlatoEditPanel from '@/components/menu-admin/PlatoEditPanel'
import PlatoDelDiaForm from '@/components/menu-admin/PlatoDelDiaForm'
import PlatoGanadorForm from '@/components/menu-admin/PlatoGanadorForm'
import { invalidateAll } from '@/lib/swr'
import TimeRangeHelper from '@/components/ui/TimeRangeHelper'
import Select from '@/components/ui/Select'
import DiasSelector from '@/components/ui/DiasSelector'
import { formato12h } from '@/lib/time'
import { formatoPrecio } from '@/lib/precio'
import { formatDias } from '@/lib/dias'
import type { DiaSemana, Variante } from '@/types'

// construirTextoVinculaciones se movió a components/menu-admin/VarianteEditor
// (lo comparten los modales de borrado de aquí y las notas de fila marcada del editor).

interface Plato {
  id: string; nombre: string; precio: number; descripcion: string; disponible: boolean; foto_url: string | null
  variantes?: Variante[]
}
interface Categoria {
  id: string; nombre: string; orden: number; platos: Plato[]; hora_inicio?: string | null; hora_fin?: string | null
}

// F8.5b — Combo item shape for admin form state
type ComboItem = {
  plato_id: string
  variante_id: string | null
}

// Promo item shape for admin form state. Unlike ComboItem, the variante lock is
// OPTIONAL: variante_id === null means "todas las variantes" (no force-variante).
type PromoItem = {
  plato_id: string
  variante_id: string | null
}

export default function MiMenuPage() {
  const router = useRouter()
  const { usuario, restaurante: rest, cargando: cargandoAuth } = useAuth()
  const plan = (rest?.plan || 'gratis') as string
  const esPro = plan === 'pro'
  const esBasico = plan === 'basico' || plan === 'pro'

  // ── SWR data hooks ──
  const { data: catsAndPlatos, mutate: mutateCategoriasYPlatos } = useCategoriasYPlatos(rest?.id)
  const { data: platoDiaSwr } = usePlatoDelDia(rest?.id, { includeInactive: true })
  const { data: combosSwr, mutate: mutateCombos } = useCombos(rest?.id, { includeInactive: true })
  const { data: promosSwr, mutate: mutatePromos } = usePromos(rest?.id, { includeInactive: true })
  const { data: configSwr, mutate: mutateConfig } = useConfigRestaurante(rest?.id)
  const { data: platoGanadorSwr } = usePlatoGanador(rest?.id, { includeInactive: true })

  const cargandoMenu = !catsAndPlatos || !configSwr
  const [tabActiva, setTabActiva] = useState<'platos' | 'combos' | 'sorprendeme'>('platos')
  const [busqueda, setBusqueda] = useState('')
  // Puntero del form "Nueva categoría" — el borrador y su cuarteto viven en
  // CategoriaForm (fresh-mount por apertura). onClose estable para React.memo.
  const [mostrarFormCategoria, setMostrarFormCategoria] = useState(false)
  const cerrarFormCategoria = useCallback(() => setMostrarFormCategoria(false), [])
  // Puntero del form "Nuevo plato" (qué categoría lo tiene abierto) — el borrador,
  // su cuarteto y su maquinaria de flush viven en PlatoForm (fresh-mount).
  const [mostrarFormPlato, setMostrarFormPlato] = useState<string | null>(null)
  const cerrarFormPlato = useCallback(() => setMostrarFormPlato(null), [])
  const [menuCategoria, setMenuCategoria] = useState<string | null>(null)
  const [editandoCategoria, setEditandoCategoria] = useState<string | null>(null)
  const [nombreEditCategoria, setNombreEditCategoria] = useState('')
  const [intentoRename, setIntentoRename] = useState(false)
  const [touchedRename, setTouchedRename] = useState<Record<string, boolean>>({})
  const [guardandoRename, setGuardandoRename] = useState(false)
  const [guardadoRename, setGuardadoRename] = useState(false)
  // Puntero del panel de edición de plato — el borrador, originalVariantes, el
  // cuarteto, TODA la maquinaria de flush (registro/espejo/commits) y el modal
  // cascadeWarning viven en PlatoEditPanel (fresh-mount, siembra desde la prop).
  const [platoExpandido, setPlatoExpandido] = useState<string | null>(null)
  const cerrarEditPlato = useCallback(() => setPlatoExpandido(null), [])
  // Confirmación de borrado de PLATO completo (siempre se muestra; enumera referencias).
  const [platoDeleteWarning, setPlatoDeleteWarning] = useState<{
    categoriaId: string;
    platoId: string;
    nombre: string;
    combosCount: number;
    promosCount: number;
    esDiaActual: boolean;
    esGanadorActual: boolean;
    onConfirm: () => void;
  } | null>(null)
  const [categoriaDeleteWarning, setCategoriaDeleteWarning] = useState<{
    categoriaId: string;
    nombre: string;
    platosCount: number;
    combosCount: number;
    promosCount: number;
    esDiaActual: boolean;
    esGanadorActual: boolean;
    onConfirm: () => void;
  } | null>(null)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [cropModal, setCropModal] = useState<{ imagen: string; platoId: string; categoriaId: string } | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null)

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])
  const [subTab, setSubTab] = useState<'combos' | 'promos' | 'plato-dia' | 'plato-ganador'>('combos')
  const [mostrarFormCombo, setMostrarFormCombo] = useState(false)
  const [mostrarFormPromo, setMostrarFormPromo] = useState(false)
  const [nuevoCombo, setNuevoCombo] = useState({
    nombre: '', descripcion: '', platoIds: [] as ComboItem[], precio: '',
    dias: [] as DiaSemana[], horaInicio: '', horaFin: '',
  })
  const [intentoCombo, setIntentoCombo] = useState(false)
  const [touchedCombo, setTouchedCombo] = useState<Record<string, boolean>>({})
  const [editandoComboId, setEditandoComboId] = useState<string | null>(null)
  const [busquedaPlatosCombo, setBusquedaPlatosCombo] = useState('')
  const [guardandoCombo, setGuardandoCombo] = useState(false)
  const [guardadoCombo, setGuardadoCombo] = useState(false)
  const [nuevaPromo, setNuevaPromo] = useState({ nombre: '', descripcion: '', tipo: '', valor: '', dias: [] as string[], platoIds: [] as PromoItem[] })
  const [intentoPromo, setIntentoPromo] = useState(false)
  const [touchedPromo, setTouchedPromo] = useState<Record<string, boolean>>({})
  const [editandoPromoId, setEditandoPromoId] = useState<string | null>(null)
  const [busquedaPlatosPromo, setBusquedaPlatosPromo] = useState('')
  const [guardandoPromo, setGuardandoPromo] = useState(false)
  const [guardadoPromo, setGuardadoPromo] = useState(false)
  // Aviso efímero genérico (banner auto-descartable). mostrarAviso(cualquier string).
  const [aviso, setAviso] = useState<string | null>(null)
  function mostrarAviso(msg: string) {
    setAviso(msg)
    setTimeout(() => setAviso(null), 3500)
  }
  // El form del plato del día (borrador + cuarteto) vive en PlatoDelDiaForm,
  // montado con key={platoDiaSwr?.id ?? 'new'} — sin estado puntero.
  const [sorprendemeCatsMenu, setSorprendemeCatsMenu] = useState<string[]>([])
  // El form del ganador (borrador + cuarteto) vive en PlatoGanadorForm, montado
  // con key={platoGanadorSwr?.id ?? 'new'} — sin estado puntero.
  // "Hay plato del día/ganador ACTIVO" se deriva de SWR (Fase 3) — antes eran
  // espejos locales seteados por efectos y por los handlers. Cambio semántico
  // aceptado: los consumidores a nivel de página (borrados, avisos, cross-check
  // día↔ganador) leen ahora el registro GUARDADO; un borrador sin guardar en el
  // otro form ya no cuenta como "activo".
  const platoDiaActivo = !!platoDiaSwr?.activo
  const platoGanadorActivo = !!platoGanadorSwr?.activo
  const [horarioCategoria, setHorarioCategoria] = useState<string | null>(null)
  const [guardandoHorarioCat, setGuardandoHorarioCat] = useState(false)
  const [guardadoHorarioCat, setGuardadoHorarioCat] = useState(false)
  const [horarioCatInicio, setHorarioCatInicio] = useState('')
  const [horarioCatFin, setHorarioCatFin] = useState('')

  // getHorarioPlato + horariosPorPlato + todosPlatos viven más abajo,
  // tras la declaración de `categorias` (useMemo) — ver BL.12.

  // Helper: detectar qué se afecta al poner horario a una categoría
  function detectarAfectados(catId: string): string[] {
    const cat = categorias.find(c => c.id === catId)
    if (!cat) return []
    const platosIds = cat.platos.map(p => p.id)
    const afectados: string[] = []

    // Combos
    combos.forEach(combo => {
      if (combo.platosIds?.some((id: string) => platosIds.includes(id))) {
        afectados.push(`Combo "${combo.nombre}" — solo visible en este horario`)
      }
    })

    // Promos
    promos.forEach(promo => {
      if (promo.platosIds?.some((id: string) => platosIds.includes(id))) {
        afectados.push(`Promo "${promo.nombre}" — solo visible en este horario`)
      }
    })

    // Plato del día (registro guardado en SWR, no el borrador del form)
    if (platoDiaActivo && platosIds.includes(platoDiaSwr?.plato_id)) {
      const platoNombre = cat.platos.find(p => p.id === platoDiaSwr?.plato_id)?.nombre || 'Plato'
      afectados.push(`Plato del día "${platoNombre}" — solo visible en este horario`)
    }

    // Sorpréndeme
    if (sorprendemeCatsMenu.includes(catId)) {
      afectados.push(`Sorpréndeme — esta categoría está seleccionada, solo funcionará en este horario`)
    }

    return afectados
  }

  async function guardarHorarioCategoria() {
    if (!horarioCategoria || !rest?.id) return

    setGuardandoHorarioCat(true)
    const supabase = createClient()
    await supabase.from('categorias').update({
      hora_inicio: horarioCatInicio || null,
      hora_fin: horarioCatFin || null,
    }).eq('id', horarioCategoria)
    await mutateCategoriasYPlatos()
    setGuardandoHorarioCat(false)
    setGuardadoHorarioCat(true)
    setTimeout(() => {
      setGuardadoHorarioCat(false)
      setHorarioCategoria(null)
    }, 1200)
  }
  
  async function actualizarSorprendemeCats(nuevas: string[]) {
    setSorprendemeCatsMenu(nuevas)
    if (!rest?.id) return
    const supabase = createClient()
    await supabase.from('config_restaurante').update({ sorprendeme_categorias: nuevas }).eq('restaurante_id', rest.id)
    await mutateConfig()
  }
  
  // validarPlatoDia, guardar y desactivar viven en components/menu-admin/PlatoDelDiaForm.

  // validarPlatoGanador, guardar y desactivar viven en components/menu-admin/PlatoGanadorForm.

  // Dos promos entran en conflicto si comparten ≥1 plato Y ≥1 día Y ≥1 variante de ese plato.
  // variante_id null (todas las variantes) cruza CUALQUIER variante específica y cruza otro null;
  // dos variantes específicas cruzan solo si son iguales. El TIPO de promo no importa; solo
  // cuentan las promos ACTIVAS. Devuelve el nombre de la primera promo en conflicto, o null.
  // Devuelve un descriptor por cada (plato, variante) del NUEVO promo que choca con alguna
  // promo activa existente. platoNombre + varianteNombre (null = todas las variantes) + el
  // nombre de la promo en conflicto, para construir un mensaje específico. Array vacío = sin
  // conflictos. Reglas: solo promos ACTIVAS, excluye editandoPromoId, requiere cruce de días,
  // y cruce de variante (a==null || b==null || a===b). Sin early-return: recorre todos los platos.
  function detectarConflictoPromo(
    state: { dias: string[]; platoIds: PromoItem[] },
    promosExistentes: any[],
    excludeId: string | null,
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

  function validarPromo(state: { nombre: string; descripcion: string; tipo: string; valor: string; dias: string[]; platoIds: PromoItem[] }): Record<string, string> {
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
    // `promos` y `editandoPromoId` se leen del closure del componente.
    if (state.platoIds.length > 0 && state.dias.length > 0) {
      const conflictos = detectarConflictoPromo(state, promos, editandoPromoId)
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
  async function agregarPromo() {
    setIntentoPromo(true)
    setTouchedPromo({ nombre: true, tipo: true, valor: true, dias: true, platos: true })
    const errores = validarPromo(nuevaPromo)
    if (Object.keys(errores).length > 0 || !rest?.id) return
    setGuardandoPromo(true)
    const supabase = createClient()

    // Step 1: insert with activo: false so public menu can't see it yet
    const { data: promoData, error } = await supabase.from('promos').insert({
      restaurante_id: rest.id,
      nombre: nuevaPromo.nombre,
      descripcion: nuevaPromo.descripcion || null,
      tipo: nuevaPromo.tipo,
      valor: nuevaPromo.valor ? parseInt(nuevaPromo.valor) : null,
      dias: nuevaPromo.dias,
      activo: false,
    }).select().single()

    if (error || !promoData) { setGuardandoPromo(false); alert('Error al crear promo'); return }

    // Step 2: insert junction rows
    if (nuevaPromo.platoIds.length > 0) {
      const { error: ppError } = await supabase.from('promo_platos').insert(
        nuevaPromo.platoIds.map(item => ({ promo_id: promoData.id, plato_id: item.plato_id, variante_id: item.variante_id }))
      )
      if (ppError) {
        await supabase.from('promos').delete().eq('id', promoData.id)
        setGuardandoPromo(false)
        alert('Error al asociar platos a la promo')
        return
      }
    }

    // Step 3: activate the promo so the public menu picks it up complete
    const { error: actError } = await supabase.from('promos')
      .update({ activo: true })
      .eq('id', promoData.id)

    if (actError) {
      setGuardandoPromo(false)
      alert('Error al activar la promo')
      return
    }

    await invalidateAll('promos')
    setGuardandoPromo(false)
    setGuardadoPromo(true)
    setTimeout(() => {
      setGuardadoPromo(false)
      setNuevaPromo({ nombre: '', descripcion: '', tipo: '', valor: '', dias: [], platoIds: [] as PromoItem[] })
      setIntentoPromo(false)
      setTouchedPromo({})
      setMostrarFormPromo(false)
      setBusquedaPlatosPromo('')
    }, 1200)
  }
  async function actualizarPromo() {
    if (!editandoPromoId) return
    setIntentoPromo(true)
    setTouchedPromo({ nombre: true, tipo: true, valor: true, dias: true, platos: true })
    const errores = validarPromo(nuevaPromo)
    if (Object.keys(errores).length > 0) return
    setGuardandoPromo(true)
    const supabase = createClient()

    const wasActive = promos.find(p => p.id === editandoPromoId)?.activo ?? true

    // Step 1: update fields and deactivate so public menu can't see partial state
    const { error } = await supabase.from('promos').update({
      nombre: nuevaPromo.nombre,
      descripcion: nuevaPromo.descripcion || null,
      tipo: nuevaPromo.tipo,
      valor: nuevaPromo.valor ? parseInt(nuevaPromo.valor) : null,
      dias: nuevaPromo.dias,
      activo: false,
    }).eq('id', editandoPromoId)

    if (error) { setGuardandoPromo(false); alert('Error al actualizar promo'); return }

    // Step 2: delete old junction rows
    await supabase.from('promo_platos').delete().eq('promo_id', editandoPromoId)

    // Step 3: insert new junction rows
    if (nuevaPromo.platoIds.length > 0) {
      const { error: ppError } = await supabase.from('promo_platos').insert(
        nuevaPromo.platoIds.map(item => ({ promo_id: editandoPromoId, plato_id: item.plato_id, variante_id: item.variante_id }))
      )
      if (ppError) {
        setGuardandoPromo(false)
        alert('Error al asociar platos a la promo. La promo quedó desactivada.')
        return
      }
    }

    // Step 4: restore original active state
    const { error: actError } = await supabase.from('promos')
      .update({ activo: wasActive })
      .eq('id', editandoPromoId)

    if (actError) {
      setGuardandoPromo(false)
      alert('Error al reactivar la promo. Puedes activarla manualmente desde la lista.')
      return
    }

    await invalidateAll('promos')
    setGuardandoPromo(false)
    setGuardadoPromo(true)
    setTimeout(() => {
      setGuardadoPromo(false)
      setNuevaPromo({ nombre: '', descripcion: '', tipo: '', valor: '', dias: [], platoIds: [] as PromoItem[] })
      setIntentoPromo(false)
      setTouchedPromo({})
      setMostrarFormPromo(false)
      setEditandoPromoId(null)
      setBusquedaPlatosPromo('')
    }, 1200)
  }
  async function togglePromo(id: string) {
    const promo = promos.find(p => p.id === id)
    if (!promo) return

    const newActivo = !promo.activo
    await mutatePromos(
      (current: any) => current?.map((p: any) =>
        p.id === id ? { ...p, activo: newActivo } : p
      ),
      { revalidate: false }
    )

    const supabase = createClient()
    const { error } = await supabase.from('promos').update({ activo: newActivo }).eq('id', id)

    if (error) {
      console.error('Error toggling promo:', error)
      await invalidateAll('promos')
      return
    }

    await invalidateAll('promos')
  }
  async function eliminarPromo(id: string) {
    const supabase = createClient()
    await supabase.from('promo_platos').delete().eq('promo_id', id)
    await supabase.from('promos').delete().eq('id', id)
    await invalidateAll('promos')
  }

  // Auto-borra promos que quedaron SIN platos (junction vacío) tras una cascada de
  // borrado de plato/variante/categoría. Imperativo: se llama desde los handlers de
  // borrado, NUNCA desde un efecto global (eso dispararía durante la ventana de junction
  // vacío transitorio de actualizarPromo y borraría una promo en edición).
  async function limpiarPromosVacias(): Promise<string[]> {
    if (!rest?.id) return []
    const supabase = createClient()
    // Recuento: cada promo con sus filas de junction (length 0 = vacía).
    const { data, error } = await supabase
      .from('promos')
      .select('id, nombre, promo_platos(id)')
      .eq('restaurante_id', rest.id)
    if (error || !data) return []
    const vacias = (data as any[]).filter(p => (p.promo_platos?.length ?? 0) === 0)
    if (vacias.length === 0) return []
    // Borrar cada promo vacía reusando la lógica de eliminarPromo (junction → promo),
    // SIN invalidar por promo; un solo refetch al final.
    for (const p of vacias) {
      await supabase.from('promo_platos').delete().eq('promo_id', p.id)
      await supabase.from('promos').delete().eq('id', p.id)
    }
    // La invalidación de 'promos' la hace limpiarVinculosVacios (siempre, aunque no se
    // borre nada, para refrescar promos que solo perdieron un plato). Aquí solo devolvemos
    // los nombres borrados; el aviso lo compone el orquestador.
    return vacias.map(p => p.nombre || 'Sin nombre')
  }

  // Auto-borra combos que quedaron rotos (junction < 2 platos, el mínimo de validarCombo)
  // tras una cascada de borrado de plato/variante/categoría. Un combo de 1 plato está por
  // debajo del mínimo y no se puede re-guardar sin re-agregar un plato. Imperativo: se llama
  // desde los handlers de borrado, NUNCA desde un efecto global (eso dispararía durante la
  // ventana de junction vacío transitorio de actualizarCombo y borraría un combo en edición).
  async function limpiarCombosVacios(): Promise<string[]> {
    if (!rest?.id) return []
    const supabase = createClient()
    // Recuento: cada combo con sus filas de junction (length < 2 = roto).
    const { data, error } = await supabase
      .from('combos')
      .select('id, nombre, combo_platos(id)')
      .eq('restaurante_id', rest.id)
    if (error || !data) return []
    const rotos = (data as any[]).filter(c => (c.combo_platos?.length ?? 0) < 2)
    if (rotos.length === 0) return []
    // Borrar cada combo roto reusando la lógica de eliminarCombo (junction → combo),
    // SIN invalidar por combo; un solo refetch al final.
    for (const c of rotos) {
      await supabase.from('combo_platos').delete().eq('combo_id', c.id)
      await supabase.from('combos').delete().eq('id', c.id)
    }
    // La invalidación de 'combos' la hace limpiarVinculosVacios (siempre, aunque no se
    // borre nada, para refrescar combos que solo perdieron un plato). Aquí solo devolvemos
    // los nombres borrados; el aviso lo compone el orquestador.
    return rotos.map(c => c.nombre || 'Sin nombre')
  }

  // Orquestador: corre ambas limpiezas tras una cascada y compone UN solo aviso.
  // Promos quedan VACÍAS (cero platos); combos quedan INCOMPLETOS (< 2 platos) — wording
  // distinto por tipo. Un único mostrarAviso evita que un aviso pise al otro (timer de 3.5s).
  async function limpiarVinculosVacios() {
    // Ambas limpiezas tocan tablas/keys disjuntas → corren en paralelo.
    const [promos, combos] = await Promise.all([limpiarPromosVacias(), limpiarCombosVacios()])
    // SIEMPRE invalidar combos + promos (aunque no se borrara nada): un plato/variante/
    // categoría borrado en cascada quita filas de combo_platos/promo_platos de vínculos que
    // SOBREVIVEN (combo con ≥2, promo con ≥1). Sin esto, la vista mantiene el junction viejo
    // y el plato borrado aparece como placeholder 'Plato' hasta una revalidación por foco.
    await Promise.all([invalidateAll('combos'), invalidateAll('promos')])
    const partes: string[] = []
    if (promos.length === 1) partes.push(`la promo "${promos[0]}" quedó sin platos`)
    else if (promos.length > 1) partes.push(`${promos.length} promos quedaron sin platos (${promos.map(n => `"${n}"`).join(', ')})`)
    if (combos.length === 1) partes.push(`el combo "${combos[0]}" quedó incompleto`)
    else if (combos.length > 1) partes.push(`${combos.length} combos quedaron incompletos (${combos.map(n => `"${n}"`).join(', ')})`)
    if (partes.length === 0) return
    const total = promos.length + combos.length
    const cuerpo = partes.join(' y ')
    const verbo = total === 1 ? 'se eliminó' : 'se eliminaron'
    mostrarAviso(`${cuerpo.charAt(0).toUpperCase()}${cuerpo.slice(1)}, así que ${verbo}.`)
  }

  // MAX_DESC / MAX_PRECIO se importan de components/menu-admin/PlatoForm (Fase 3).
  function recortarImagen(imageSrc: string, pixelCrop: any): Promise<Blob> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!
        canvas.width = 800
        canvas.height = 450
        ctx.drawImage(
          img,
          pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
          0, 0, 800, 450
        )
        canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.82)
      }
      img.src = imageSrc
    })
  }

  // useCallback: baja estable a PlatoEditPanel (React.memo) como onSelectFoto.
  const seleccionarFoto = useCallback((platoId: string, categoriaId: string, file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      alert('La imagen es muy grande. Máximo 10MB.')
      return
    }
    const url = URL.createObjectURL(file)
    setCropModal({ imagen: url, platoId, categoriaId })
    setCrop({ x: 0, y: 0 })
    setZoom(1)
  }, [])

  async function confirmarRecorte() {
    if (!cropModal || !croppedAreaPixels || !rest?.id) return
    setSubiendoFoto(true)
    setCropModal(null)

    const supabase = createClient()
    const path = `${rest.id}/platos/${cropModal.platoId}.jpg`

    const blob = await recortarImagen(cropModal.imagen, croppedAreaPixels)

    const { error: uploadError } = await supabase.storage
      .from('imagenes')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })

    if (uploadError) {
      setSubiendoFoto(false)
      alert('Error al subir la imagen')
      return
    }

    const { data: urlData } = supabase.storage.from('imagenes').getPublicUrl(path)
    const foto_url = urlData.publicUrl + '?t=' + Date.now()

    await supabase.from('platos').update({ foto_url }).eq('id', cropModal.platoId)

    await mutateCategoriasYPlatos()
    setSubiendoFoto(false)
  }

  // ── Derived data (replaces removed read-effect) ──
  const categorias = useMemo<Categoria[]>(() => {
    if (!catsAndPlatos) return []
    return catsAndPlatos.categorias.map((cat: any) => ({
      id: cat.id,
      nombre: cat.nombre,
      orden: cat.orden,
      hora_inicio: cat.hora_inicio || null,
      hora_fin: cat.hora_fin || null,
      platos: catsAndPlatos.platos
        .filter((p: any) => p.categoria_id === cat.id)
        .map((p: any) => ({
          id: p.id,
          nombre: p.nombre,
          precio: p.precio,
          descripcion: p.descripcion || '',
          disponible: p.disponible,
          foto_url: p.foto_url,
          variantes: p.variantes || [],
        })),
    }))
  }, [catsAndPlatos])

  const combos = useMemo<any[]>(() => {
    if (!combosSwr || !catsAndPlatos) return []
    return combosSwr.map((c: any) => ({
      id: c.id,
      nombre: c.nombre,
      descripcion: c.descripcion || '',
      precio: c.precio,
      precioIndividual: c.precio_individual,
      activo: c.activo,
      platosIds: c.combo_platos?.map((cp: any) => cp.plato_id) || [],
      platos: c.combo_platos?.map((cp: any) => {
        const plato = catsAndPlatos.platos.find((p: any) => p.id === cp.plato_id)
        const nombre = plato?.nombre || 'Plato'
        if (cp.variante_id && plato?.variantes?.length) {
          const v = plato.variantes.find((x: any) => x.id === cp.variante_id)
          if (v) return `${nombre} (${v.nombre})`
        }
        return nombre
      }) || [],
      combo_platos: c.combo_platos || [],
      dias: c.dias || [],
      horario_inicio: c.horario_inicio || null,
      horario_fin: c.horario_fin || null,
    }))
  }, [combosSwr, catsAndPlatos])

  const promos = useMemo<any[]>(() => {
    if (!promosSwr || !catsAndPlatos) return []
    return promosSwr.map((p: any) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion || '',
      tipo: p.tipo,
      valor: p.valor?.toString() || '',
      dias: p.dias || [],
      activo: p.activo,
      platos: p.promo_platos?.map((pp: any) => {
        const plato = catsAndPlatos.platos.find((pl: any) => pl.id === pp.plato_id)
        const nombre = plato?.nombre || 'Plato'
        if (pp.variante_id && plato?.variantes?.length) {
          const v = plato.variantes.find((x: any) => x.id === pp.variante_id)
          if (v) return `${nombre} (${v.nombre})`
        }
        return nombre
      }) || [],
      platosIds: p.promo_platos?.map((pp: any) => pp.plato_id) || [],
      // raw lock carry for edit-pop rehydration (mirror ComboAdmin.combo_platos)
      promoPlatos: p.promo_platos?.map((pp: any) => ({
        plato_id: pp.plato_id,
        variante_id: pp.variante_id ?? null,
      })) || [],
    }))
  }, [promosSwr, catsAndPlatos])

  // ── Lookups derivados (BL.12) ──
  // horariosPorPlato evita la búsqueda lineal de getHorarioPlato; lo vuelve O(1).
  // todosPlatos centraliza el flatMap repetido en formularios de combo/promo/plato-día/ganador.
  const horariosPorPlato = useMemo(() => {
    const map = new Map<string, { hora_inicio: string; hora_fin: string }>()
    for (const cat of categorias) {
      if (cat.hora_inicio && cat.hora_fin) {
        for (const p of cat.platos) {
          map.set(p.id, { hora_inicio: cat.hora_inicio, hora_fin: cat.hora_fin })
        }
      }
    }
    return map
  }, [categorias])

  const todosPlatos = useMemo(() => categorias.flatMap(c => c.platos), [categorias])

  function getHorarioPlato(platoId: string): { hora_inicio: string; hora_fin: string } | null {
    return horariosPorPlato.get(platoId) ?? null
  }

  const platoDiaOptions = useMemo(() => {
    return todosPlatos.map(p => {
      const h = horariosPorPlato.get(p.id) ?? null
      const precioStr = `$${formatoPrecio(p.precio)}`
      const scheduleStr = h ? ` (⏰ ${h.hora_inicio}–${h.hora_fin})` : ''
      return {
        value: p.id,
        label: (
          <span>
            {p.nombre} <span style={{ color: 'var(--text-tertiary)' }}>— {precioStr}{scheduleStr}</span>
          </span>
        ),
        searchText: `${p.nombre} ${precioStr}${scheduleStr}`.toLowerCase(),
      }
    })
  }, [todosPlatos, horariosPorPlato])

  const platoGanadorOptions = useMemo(() => {
    return todosPlatos.map(p => ({
      value: p.id,
      label: <span>{p.nombre} <span style={{ color: 'var(--text-tertiary)' }}>— ${formatoPrecio(p.precio)}</span></span>,
      searchText: `${p.nombre} ${p.precio}`.toLowerCase(),
    }))
  }, [todosPlatos])

  useEffect(() => {
    if (configSwr?.sorprendeme_categorias) {
      setSorprendemeCatsMenu(configSwr.sorprendeme_categorias)
    }
  }, [configSwr])

  // Proteger ruta
  useEffect(() => {
    if (!cargandoAuth && !usuario) {
      router.push('/login')
    }
  }, [cargandoAuth, usuario, router])
  const precioIndividualCombo = useMemo(() => {
    return nuevoCombo.platoIds.reduce((sum: number, item: ComboItem) => {
      const plato = todosPlatos.find(p => p.id === item.plato_id)
      if (!plato) return sum
      if (item.variante_id) {
        const v = plato.variantes?.find(x => x.id === item.variante_id)
        if (v) return sum + v.precio
      }
      return sum + (plato.precio || 0)
    }, 0)
  }, [nuevoCombo.platoIds, todosPlatos])
  function validarCombo(state: { nombre: string; precio: string; platoIds: ComboItem[] }): Record<string, string> {
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
  async function agregarCombo() {
    setIntentoCombo(true)
    setTouchedCombo({ nombre: true, precio: true, platos: true })
    const errores = validarCombo(nuevoCombo)
    if (Object.keys(errores).length > 0 || !rest?.id) return
    setGuardandoCombo(true)
    const supabase = createClient()

    // Step 1: insert with activo: false so public menu can't see it yet
    const { data: comboData, error } = await supabase.from('combos').insert({
      restaurante_id: rest.id,
      nombre: nuevoCombo.nombre,
      descripcion: nuevoCombo.descripcion || null,
      precio: parseInt(nuevoCombo.precio),
      precio_individual: precioIndividualCombo,
      activo: false,
      dias: nuevoCombo.dias.length > 0 ? nuevoCombo.dias : null,
      horario_inicio: nuevoCombo.horaInicio || null,
      horario_fin: nuevoCombo.horaFin || null,
    }).select().single()

    if (error || !comboData) { setGuardandoCombo(false); alert('Error al crear combo'); return }

    // Step 2: insert junction rows
    if (nuevoCombo.platoIds.length > 0) {
      const { error: cpError } = await supabase.from('combo_platos').insert(
        nuevoCombo.platoIds.map((item: ComboItem) => ({
          combo_id: comboData.id,
          plato_id: item.plato_id,
          variante_id: item.variante_id,
        }))
      )
      if (cpError) {
        await supabase.from('combos').delete().eq('id', comboData.id)
        setGuardandoCombo(false)
        alert('Error al asociar platos al combo')
        return
      }
    }

    // Step 3: activate the combo so the public menu picks it up complete
    const { error: actError } = await supabase.from('combos')
      .update({ activo: true })
      .eq('id', comboData.id)

    if (actError) {
      setGuardandoCombo(false)
      alert('Error al activar el combo')
      return
    }

    await invalidateAll('combos')
    setGuardandoCombo(false)
    setGuardadoCombo(true)
    setTimeout(() => {
      setGuardadoCombo(false)
      setNuevoCombo({ nombre: '', descripcion: '', platoIds: [] as ComboItem[], precio: '', dias: [], horaInicio: '', horaFin: '' })
      setIntentoCombo(false)
      setTouchedCombo({})
      setMostrarFormCombo(false)
      setBusquedaPlatosCombo('')
    }, 1200)
  }
  async function actualizarCombo() {
    if (!editandoComboId) return
    setIntentoCombo(true)
    setTouchedCombo({ nombre: true, precio: true, platos: true })
    const errores = validarCombo(nuevoCombo)
    if (Object.keys(errores).length > 0) return
    setGuardandoCombo(true)
    const supabase = createClient()

    const wasActive = combos.find(c => c.id === editandoComboId)?.activo ?? true

    // Step 1: update fields and deactivate so public menu can't see partial state
    const { error } = await supabase.from('combos').update({
      nombre: nuevoCombo.nombre,
      descripcion: nuevoCombo.descripcion || null,
      precio: parseInt(nuevoCombo.precio),
      precio_individual: precioIndividualCombo,
      dias: nuevoCombo.dias.length > 0 ? nuevoCombo.dias : null,
      horario_inicio: nuevoCombo.horaInicio || null,
      horario_fin: nuevoCombo.horaFin || null,
      activo: false,
    }).eq('id', editandoComboId)

    if (error) { setGuardandoCombo(false); alert('Error al actualizar combo'); return }

    // Step 2: delete old junction rows
    await supabase.from('combo_platos').delete().eq('combo_id', editandoComboId)

    // Step 3: insert new junction rows
    if (nuevoCombo.platoIds.length > 0) {
      const { error: cpError } = await supabase.from('combo_platos').insert(
        nuevoCombo.platoIds.map((item: ComboItem) => ({
          combo_id: editandoComboId,
          plato_id: item.plato_id,
          variante_id: item.variante_id,
        }))
      )
      if (cpError) {
        setGuardandoCombo(false)
        alert('Error al asociar platos al combo. El combo quedó desactivado.')
        return
      }
    }

    // Step 4: restore original active state
    const { error: actError } = await supabase.from('combos')
      .update({ activo: wasActive })
      .eq('id', editandoComboId)

    if (actError) {
      setGuardandoCombo(false)
      alert('Error al reactivar el combo. Puedes activarlo manualmente desde la lista.')
      return
    }

    await invalidateAll('combos')
    setGuardandoCombo(false)
    setGuardadoCombo(true)
    setTimeout(() => {
      setGuardadoCombo(false)
      setNuevoCombo({ nombre: '', descripcion: '', platoIds: [] as ComboItem[], precio: '', dias: [], horaInicio: '', horaFin: '' })
      setIntentoCombo(false)
      setTouchedCombo({})
      setMostrarFormCombo(false)
      setEditandoComboId(null)
      setBusquedaPlatosCombo('')
    }, 1200)
  }
  async function toggleCombo(id: string) {
    const combo = combos.find(c => c.id === id)
    if (!combo) return

    const newActivo = !combo.activo
    await mutateCombos(
      (current: any) => current?.map((c: any) =>
        c.id === id ? { ...c, activo: newActivo } : c
      ),
      { revalidate: false }
    )

    const supabase = createClient()
    const { error } = await supabase.from('combos').update({ activo: newActivo }).eq('id', id)

    if (error) {
      console.error('Error toggling combo:', error)
      await invalidateAll('combos')
      return
    }

    await invalidateAll('combos')
  }
  async function eliminarCombo(id: string) {
    const supabase = createClient()
    await supabase.from('combo_platos').delete().eq('combo_id', id)
    await supabase.from('combos').delete().eq('id', id)
    await invalidateAll('combos')
  }

  // ── Categorías ──
  // validarCategoria y el form de crear viven en components/menu-admin/CategoriaForm
  // (el validador se importa de allí para el form inline de renombrar).
  async function eliminarCategoria(id: string) {
    const supabase = createClient()
    const cat = categorias.find(c => c.id === id)
    const platosIds = cat ? cat.platos.map(p => p.id) : []
    const eraGanador = platoGanadorActivo && platosIds.includes(platoGanadorSwr?.plato_id)
    const eraDia = platoDiaActivo && platosIds.includes(platoDiaSwr?.plato_id)
    // plato_ganador.plato_id es NO ACTION (no cascada): si alguno de los platos de la
    // categoría es el ganador actual, hay que borrar su fila ANTES, o el DELETE de platos
    // fallaría por violación de FK. combo_platos / promo_platos / plato_del_dia SÍ son CASCADE.
    if (eraGanador) await supabase.from('plato_ganador').delete().eq('plato_id', platoGanadorSwr.plato_id)
    const { error } = await supabase.from('platos').delete().eq('categoria_id', id)
    if (error) {
      alert('No se pudo eliminar la categoría. Intentá de nuevo.')
      return
    }
    // Refrescar estado local de los destacados si la categoría borrada los ocupaba.
    if (eraGanador) {
      await invalidateAll('plato-ganador')
    }
    if (eraDia) {
      await invalidateAll('plato-del-dia')
    }
    await supabase.from('categorias').delete().eq('id', id)
    await mutateCategoriasYPlatos()
    // El borrado en cascada de los platos pudo dejar promos sin platos o combos incompletos.
    await limpiarVinculosVacios()
    setMenuCategoria(null)
  }
  async function renombrarCategoria(id: string) {
    setIntentoRename(true)
    setTouchedRename({ nombre: true })
    const errores = validarCategoria(nombreEditCategoria)
    if (Object.keys(errores).length > 0) return
    setGuardandoRename(true)
    const supabase = createClient()
    await supabase.from('categorias').update({ nombre: nombreEditCategoria }).eq('id', id)
    await mutateCategoriasYPlatos()
    setGuardandoRename(false)
    setGuardadoRename(true)
    setTimeout(() => {
      setGuardadoRename(false)
      setEditandoCategoria(null)
      setNombreEditCategoria('')
      setIntentoRename(false)
      setTouchedRename({})
    }, 1200)
  }
  async function moverCategoria(id: string, direccion: 'arriba' | 'abajo') {
    const idx = categorias.findIndex(c => c.id === id)
    if (idx === -1) return
    if (direccion === 'arriba' && idx === 0) return
    if (direccion === 'abajo' && idx === categorias.length - 1) return
    if (!catsAndPlatos) return

    const offset = direccion === 'arriba' ? -1 : 1
    const catA = categorias[idx]
    const catB = categorias[idx + offset]

    const optimisticData = {
      categorias: catsAndPlatos.categorias.map(c => {
        if (c.id === catA.id) return { ...c, orden: catB.orden ?? 0 }
        if (c.id === catB.id) return { ...c, orden: catA.orden ?? 0 }
        return c
      }),
      platos: catsAndPlatos.platos,
    }
    await mutateCategoriasYPlatos(optimisticData, { revalidate: false })

    const supabase = createClient()
    const ordenA = catA.orden ?? 0
    const ordenB = catB.orden ?? 0

    const [{ error: errorA }, { error: errorB }] = await Promise.all([
      supabase.from('categorias').update({ orden: ordenB }).eq('id', catA.id),
      supabase.from('categorias').update({ orden: ordenA }).eq('id', catB.id),
    ])

    if (errorA || errorB) {
      console.error('Error reordering categorías:', errorA || errorB)
      await mutateCategoriasYPlatos()
      return
    }

    await mutateCategoriasYPlatos()
  }

  // ── Platos ──
  // validarPlato y el form de crear viven en components/menu-admin/PlatoForm
  // (el validador se importa de allí para el panel de edición).
  async function toggleDisponible(categoriaId: string, platoId: string) {
    const cat = categorias.find(c => c.id === categoriaId)
    const plato = cat?.platos.find(p => p.id === platoId)
    if (!plato) return

    const newDisponible = !plato.disponible

    await mutateCategoriasYPlatos(
      (current: any) => current ? {
        ...current,
        platos: current.platos.map((p: any) =>
          p.id === platoId ? { ...p, disponible: newDisponible } : p
        ),
      } : current,
      { revalidate: false }
    )

    const supabase = createClient()
    const { error } = await supabase.from('platos').update({ disponible: newDisponible }).eq('id', platoId)

    if (error) {
      console.error('Error toggling plato disponible:', error)
      await mutateCategoriasYPlatos()
      return
    }

    await mutateCategoriasYPlatos()
  }
  async function eliminarPlato(categoriaId: string, platoId: string) {
    const supabase = createClient()
    const eraGanador = platoGanadorActivo && platoGanadorSwr?.plato_id === platoId
    const eraDia = platoDiaActivo && platoDiaSwr?.plato_id === platoId
    // plato_ganador.plato_id es NO ACTION (no cascada): si el plato es el ganador actual,
    // hay que borrar su fila ANTES del DELETE de platos o fallaría por violación de FK.
    // Gateado en eraGanador (evita un round-trip cuando no es el ganador).
    // combo_platos / promo_platos / plato_del_dia SÍ son CASCADE → se limpian solos.
    if (eraGanador) await supabase.from('plato_ganador').delete().eq('plato_id', platoId)
    const { error } = await supabase.from('platos').delete().eq('id', platoId)
    if (error) {
      alert('No se pudo eliminar el plato. Intentá de nuevo.')
      return
    }
    // Refrescar estado local de los destacados si el plato borrado los ocupaba.
    if (eraGanador) {
      await invalidateAll('plato-ganador')
    }
    if (eraDia) {
      await invalidateAll('plato-del-dia')
    }
    await mutateCategoriasYPlatos()
    // El borrado en cascada de promo_platos/combo_platos pudo dejar promos sin platos o combos incompletos.
    await limpiarVinculosVacios()
    if (platoExpandido === platoId) {
      setPlatoExpandido(null)
    }
  }
  // El guardado de edición (diff de variantes, cascadeWarning, doSave) vive en
  // components/menu-admin/PlatoEditPanel. La limpieza post-cascada sigue siendo
  // de la página y baja como callback estable:
  const limpiarTrasCascada = useCallback(async () => {
    await limpiarVinculosVacios()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rest?.id])
  async function moverPlato(categoriaId: string, platoId: string, direccion: 'arriba' | 'abajo') {
    const cat = categorias.find(c => c.id === categoriaId)
    if (!cat) return
    const idx = cat.platos.findIndex(p => p.id === platoId)
    if (idx === -1) return
    if (direccion === 'arriba' && idx === 0) return
    if (direccion === 'abajo' && idx === cat.platos.length - 1) return
    if (!catsAndPlatos) return

    const offset = direccion === 'arriba' ? -1 : 1
    const platoA = cat.platos[idx]
    const platoB = cat.platos[idx + offset]

    const flatPlatoA = catsAndPlatos.platos.find(p => p.id === platoA.id)
    const flatPlatoB = catsAndPlatos.platos.find(p => p.id === platoB.id)
    if (!flatPlatoA || !flatPlatoB) return

    const optimisticData = {
      categorias: catsAndPlatos.categorias,
      platos: catsAndPlatos.platos.map(p => {
        if (p.id === flatPlatoA.id) return { ...p, orden: flatPlatoB.orden ?? 0 }
        if (p.id === flatPlatoB.id) return { ...p, orden: flatPlatoA.orden ?? 0 }
        return p
      }),
    }
    await mutateCategoriasYPlatos(optimisticData, { revalidate: false })

    const supabase = createClient()
    const ordenA = flatPlatoA.orden ?? 0
    const ordenB = flatPlatoB.orden ?? 0

    const [{ error: errorA }, { error: errorB }] = await Promise.all([
      supabase.from('platos').update({ orden: ordenB }).eq('id', flatPlatoA.id),
      supabase.from('platos').update({ orden: ordenA }).eq('id', flatPlatoB.id),
    ])

    if (errorA || errorB) {
      console.error('Error reordering platos:', errorA || errorB)
      await mutateCategoriasYPlatos()
      return
    }

    await mutateCategoriasYPlatos()
  }

  // Filtrar
  const categoriasFiltradas = busqueda.trim()
    ? categorias.map(cat => ({
        ...cat,
        platos: cat.platos.filter(p =>
          p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
          p.descripcion?.toLowerCase().includes(busqueda.toLowerCase())
        ),
      })).filter(cat => cat.platos.length > 0)
    : categorias
  const totalResultados = categoriasFiltradas.reduce((sum, cat) => sum + cat.platos.length, 0)
  if (cargandoAuth || cargandoMenu) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 500, fontFamily: 'var(--font-display)' }}>Menu<span style={{ color: 'var(--color-accent)' }}>App</span></div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>Cargando menú...</div>
        </div>
      </div>
    )
  }

  if (!usuario) return null
  return (
    <div style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '500px', minWidth: '320px', margin: '0 auto', paddingBottom: '80px' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: 500 }}>Mi menú</div>
          {rest?.slug && (
            <a href={'/' + rest.slug} target="_blank" rel="noopener" className="btn-outline" style={{ padding: '8px 14px', fontSize: '12px', textDecoration: 'none' }}>
              Ver mi menú
            </a>
          )}
        </div>

        {/* Tabs */}
        <div style={{ padding: '12px 20px 0', display: 'flex', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {['platos', 'combos', 'sorprendeme'].map((tab) => (
            <div key={tab} onClick={() => {
              if (tab === 'sorprendeme') { setTabActiva('sorprendeme' as any) }
              else { setTabActiva(tab as 'platos' | 'combos') }
            }}
              style={{
                flex: 1, padding: '10px', textAlign: 'center', fontSize: '13px', cursor: 'pointer',
                fontWeight: tabActiva === tab ? 500 : 400,
                color: tabActiva === tab ? 'var(--color-info)' : 'var(--text-tertiary)',
                borderBottom: `2px solid ${tabActiva === tab ? 'var(--color-info)' : 'var(--border-light)'}`,
                whiteSpace: 'nowrap', minWidth: 'fit-content',
              }}>
              {tab === 'platos' ? 'Platos' : tab === 'combos' ? 'Combos / Promos' : 'Sorpréndeme'}
            </div>
          ))}
        </div>

        {tabActiva === 'platos' && (
          <>
            {/* Buscador */}
            <div style={{ padding: '12px 20px' }}>
              <input className="input" placeholder="Buscar plato..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
              {busqueda.trim() && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{totalResultados} resultado{totalResultados !== 1 ? 's' : ''} para &quot;{busqueda}&quot;</span>
                  <span onClick={() => setBusqueda('')} style={{ fontSize: '12px', color: 'var(--color-info)', cursor: 'pointer' }}>Limpiar</span>
                </div>
              )}
            </div>

            {/* Botón agregar categoría */}
            <div style={{ padding: '0 20px 12px' }}>
              <button onClick={() => setMostrarFormCategoria(true)}
                className="btn-primary" style={{ padding: '10px 16px', fontSize: '13px' }}>
                + Categoría
              </button>
            </div>

            {/* Form nueva categoría */}
            {mostrarFormCategoria && (
              <CategoriaForm
                restId={rest?.id}
                ordenSiguiente={categorias.length}
                mutateCategoriasYPlatos={mutateCategoriasYPlatos}
                onClose={cerrarFormCategoria}
              />
            )}

            {/* Sin resultados */}
            {busqueda.trim() && totalResultados === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
                <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>No se encontraron platos</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Intenta con otro nombre</div>
              </div>
            )}

            {/* Categorías */}
            {categoriasFiltradas.map((cat, catIdx) => (
              <div key={cat.id} style={{ padding: '0 20px', marginBottom: '14px', position: 'relative' }}>

                {/* Header categoría */}
                {editandoCategoria === cat.id ? (() => {
                  const errores = validarCategoria(nombreEditCategoria)
                  const valido = Object.keys(errores).length === 0
                  return (
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input className="input" value={nombreEditCategoria} maxLength={40} onChange={(e) => setNombreEditCategoria(e.target.value)}
                        autoFocus
                        onBlur={() => setTouchedRename(prev => ({ ...prev, nombre: true }))}
                        onKeyDown={(e) => e.key === 'Enter' && renombrarCategoria(cat.id)}
                        style={{
                          flex: 1,
                          borderColor: intentoRename && touchedRename.nombre && errores.nombre ? 'var(--color-danger)' : undefined,
                        }} />
                      <button onClick={() => renombrarCategoria(cat.id)} disabled={guardandoRename || guardadoRename} className="btn-primary"
                        style={{
                          padding: '8px 14px', fontSize: '12px',
                          opacity: valido ? 1 : 0.5,
                          cursor: valido ? 'pointer' : 'default',
                          ...(valido ? {} : { transform: 'none', boxShadow: 'none' }),
                        }}>{guardandoRename ? 'Guardando...' : guardadoRename ? '✓ Guardado' : 'OK'}</button>
                      <button onClick={() => { setEditandoCategoria(null); setIntentoRename(false); setTouchedRename({}); setNombreEditCategoria('') }} className="btn-outline" style={{ padding: '8px 14px', fontSize: '12px' }}>✕</button>
                    </div>
                    {intentoRename && touchedRename.nombre && errores.nombre && (
                      <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: '4px' }}>
                        {errores.nombre}
                      </div>
                    )}
                  </div>
                  )
                })() : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {/* Flechas mover categoría */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <span onClick={() => moverCategoria(cat.id, 'arriba')}
                          style={{ fontSize: '10px', cursor: catIdx > 0 ? 'pointer' : 'default', color: catIdx > 0 ? 'var(--text-secondary)' : 'var(--border-light)', lineHeight: 1 }}>▲</span>
                        <span onClick={() => moverCategoria(cat.id, 'abajo')}
                          style={{ fontSize: '10px', cursor: catIdx < categorias.length - 1 ? 'pointer' : 'default', color: catIdx < categorias.length - 1 ? 'var(--text-secondary)' : 'var(--border-light)', lineHeight: 1 }}>▼</span>
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
                      <span onClick={() => setMostrarFormPlato(mostrarFormPlato === cat.id ? null : cat.id)}
                        style={{ fontSize: '12px', color: 'var(--color-info)', cursor: 'pointer' }}>+ Plato</span>
                      <span onClick={() => setMenuCategoria(menuCategoria === cat.id ? null : cat.id)}
                        style={{ fontSize: '12px', color: 'var(--text-tertiary)', cursor: 'pointer' }}>⋯</span>
                    </div>
                  </div>
                )}

                {/* Menú ⋯ categoría */}
                {menuCategoria === cat.id && (
                  <>
                    <div onClick={() => setMenuCategoria(null)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
                    <div style={{
                      position: 'absolute', right: '20px', top: '30px', zIndex: 70,
                      background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
                      borderRadius: 'var(--radius-sm)', overflow: 'hidden', width: '180px',
                      boxShadow: 'var(--shadow-lg)', animation: 'scaleIn 0.15s ease',
                    }}>
                      <div onClick={() => { setNombreEditCategoria(cat.nombre); setEditandoCategoria(cat.id); setMenuCategoria(null); setIntentoRename(false); setTouchedRename({}) }}
                        style={{ padding: '10px 14px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid var(--border-light)' }}>Renombrar</div>
                      <div onClick={() => {
                        const c = categorias.find(x => x.id === cat.id) as any
                        setHorarioCatInicio(c?.hora_inicio || '')
                        setHorarioCatFin(c?.hora_fin || '')
                        setHorarioCategoria(cat.id)
                        setMenuCategoria(null)
                      }}
                        style={{ padding: '10px 14px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid var(--border-light)' }}>Horario de visibilidad</div>
                      <div onClick={() => {
                        const categoryPlatoIds = cat.platos.map(p => p.id)
                        const combosCount = combos.filter(c => c.platosIds.some((id: string) => categoryPlatoIds.includes(id))).length
                        const promosCount = promos.filter(p => p.activo && p.platosIds.some((id: string) => categoryPlatoIds.includes(id))).length
                        const esDiaActual = platoDiaActivo && categoryPlatoIds.includes(platoDiaSwr?.plato_id)
                        const esGanadorActual = platoGanadorActivo && categoryPlatoIds.includes(platoGanadorSwr?.plato_id)
                        setMenuCategoria(null)
                        setCategoriaDeleteWarning({
                          categoriaId: cat.id,
                          nombre: cat.nombre,
                          platosCount: cat.platos.length,
                          combosCount, promosCount, esDiaActual, esGanadorActual,
                          onConfirm: () => eliminarCategoria(cat.id),
                        })
                      }}
                        style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--color-danger)', cursor: 'pointer' }}>Eliminar categoría</div>
                    </div>
                  </>
                )}

                {/* Form nuevo plato */}
                {mostrarFormPlato === cat.id && (
                  <PlatoForm
                    restId={rest?.id}
                    categoriaId={cat.id}
                    categoriaNombre={cat.nombre}
                    ordenSiguiente={categorias.find(c => c.id === cat.id)?.platos.length ?? 0}
                    mutateCategoriasYPlatos={mutateCategoriasYPlatos}
                    onClose={cerrarFormPlato}
                  />
                )}

                {/* Platos */}
                {cat.platos.map((plato, pIdx) => (
                  <div key={plato.id} className="card" style={{ marginBottom: '8px', opacity: plato.disponible ? 1 : 0.5, overflow: 'hidden' }}>

                    {/* Vista normal del plato */}
                    <div
                      onClick={() => setPlatoExpandido(platoExpandido === plato.id ? null : plato.id)}
                      style={{ padding: '12px', display: 'flex', gap: '12px', cursor: 'pointer' }}
                    >
                      <div style={{
                        width: '52px', height: '52px', borderRadius: '8px', background: 'var(--bg-tertiary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '18px', fontWeight: 500, color: 'var(--text-tertiary)', flexShrink: 0,
                        overflow: 'hidden',
                      }}>
                        {plato.foto_url ? (
                          <img src={plato.foto_url} alt={plato.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : plato.nombre.charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                          <div style={{ fontSize: '13px', fontWeight: 500 }}>{plato.nombre}</div>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            {/* Flechas mover plato */}
                            <span onClick={(e) => { e.stopPropagation(); moverPlato(cat.id, plato.id, 'arriba') }}
                              style={{ fontSize: '9px', cursor: pIdx > 0 ? 'pointer' : 'default', color: pIdx > 0 ? 'var(--text-secondary)' : 'var(--border-light)', padding: '2px' }}>▲</span>
                            <span onClick={(e) => { e.stopPropagation(); moverPlato(cat.id, plato.id, 'abajo') }}
                              style={{ fontSize: '9px', cursor: pIdx < cat.platos.length - 1 ? 'pointer' : 'default', color: pIdx < cat.platos.length - 1 ? 'var(--text-secondary)' : 'var(--border-light)', padding: '2px' }}>▼</span>
                            <span onClick={(e) => { e.stopPropagation(); toggleDisponible(cat.id, plato.id) }}
                              style={{ fontSize: '11px', color: 'var(--color-info)', cursor: 'pointer', marginLeft: '4px' }}>
                              {plato.disponible ? 'Agotar' : 'Activar'}
                            </span>
                            <span onClick={(e) => {
                              e.stopPropagation()
                              // Conteos EN MEMORIA (sin queries): combos/promos por platosIds,
                              // día/ganador por la config local. Promos: solo ACTIVAS.
                              const combosCount = combos.filter(c => c.platosIds.includes(plato.id)).length
                              const promosCount = promos.filter(p => p.activo && p.platosIds.includes(plato.id)).length
                              const esDiaActual = platoDiaActivo && platoDiaSwr?.plato_id === plato.id
                              const esGanadorActual = platoGanadorActivo && platoGanadorSwr?.plato_id === plato.id
                              setPlatoDeleteWarning({
                                categoriaId: cat.id,
                                platoId: plato.id,
                                nombre: plato.nombre,
                                combosCount,
                                promosCount,
                                esDiaActual,
                                esGanadorActual,
                                onConfirm: () => eliminarPlato(cat.id, plato.id),
                              })
                            }}
                              style={{ fontSize: '11px', color: 'var(--color-danger)', cursor: 'pointer' }}>✕</span>
                          </div>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {plato.variantes && plato.variantes.length > 0 ? 'desde ' : ''}${formatoPrecio(plato.precio)}
                          {plato.descripcion && <span style={{ marginLeft: '6px', color: 'var(--text-tertiary)' }}>· {plato.descripcion.length > 30 ? plato.descripcion.slice(0, 30) + '...' : plato.descripcion}</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px' }}>
                          <span className={`badge ${plato.disponible ? 'badge-success' : 'badge-danger'}`}>
                            {plato.disponible ? 'Disponible' : 'Agotado'}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>toca para editar</span>
                        </div>
                      </div>
                    </div>

                    {/* Panel edición expandido */}
                    {platoExpandido === plato.id && (
                      <PlatoEditPanel
                        plato={plato}
                        categoriaId={cat.id}
                        combos={combos}
                        promos={promos}
                        diaVarianteId={platoDiaActivo ? platoDiaSwr?.variante_id ?? null : null}
                        ganadorVarianteId={platoGanadorActivo ? platoGanadorSwr?.variante_id ?? null : null}
                        esBasico={esBasico}
                        subiendoFoto={subiendoFoto}
                        onSelectFoto={seleccionarFoto}
                        mutateCategoriasYPlatos={mutateCategoriasYPlatos}
                        onCascadeCleanup={limpiarTrasCascada}
                        onClose={cerrarEditPlato}
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {tabActiva === 'combos' && (
          <>
            {!esPro ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔒</div>
                <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '6px' }}>Combos, Promos, Plato del día y Plato ganador</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.6 }}>
                  Crea paquetes con descuento, promociones por día y destaca tu plato estrella. Disponible en el Plan Pro.
                </div>
                <div onClick={() => router.push('/suscripcion')} style={{
                  display: 'inline-block', background: 'var(--text-primary)', color: 'white',
                  padding: '12px 24px', borderRadius: 'var(--radius-md)', fontSize: '13px',
                  fontWeight: 500, cursor: 'pointer',
                }}>
                  Ver Plan Pro — $29.000/mes
                </div>
              </div>
            ) : (
            <>
            {/* Sub-tabs */}
            <div style={{ padding: '12px 20px 0', display: 'flex', gap: '8px', justifyContent: 'center' }}>
              {['combos', 'promos', 'plato-dia', 'plato-ganador'].map((sub) => (
                <div key={sub} onClick={() => setSubTab(sub as typeof subTab)}
                  style={{
                    padding: '7px 14px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                    background: subTab === sub ? 'var(--text-primary)' : 'var(--bg-secondary)',
                    color: subTab === sub ? 'var(--bg-secondary)' : 'var(--text-secondary)',
                    border: subTab === sub ? 'none' : '1px solid var(--border-light)',
                  }}>
                  {sub === 'combos' ? 'Combos' : sub === 'promos' ? 'Promos' : sub === 'plato-dia' ? 'Plato del día' : 'Ganador'}
                </div>
              ))}
            </div>

            {/* === COMBOS === */}
            {subTab === 'combos' && (
              <div style={{ padding: '14px 20px' }}>
                {combosSwr !== undefined && combos.length === 0 && !mostrarFormCombo ? (
                  <div style={{ textAlign: 'center', padding: '30px 0' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🍱</div>
                    <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Sin combos</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Crea paquetes de platos con descuento</div>
                    <button onClick={() => { setEditandoComboId(null); setNuevoCombo({ nombre: '', descripcion: '', platoIds: [] as ComboItem[], precio: '', dias: [], horaInicio: '', horaFin: '' }); setBusquedaPlatosCombo(''); setMostrarFormCombo(true); setIntentoCombo(false); setTouchedCombo({}) }} className="btn-primary" style={{ padding: '10px 20px', fontSize: '13px' }}>+ Crear combo</button>
                  </div>
                ) : (
                  <>
                    {!mostrarFormCombo && (
                      <button onClick={() => { setEditandoComboId(null); setNuevoCombo({ nombre: '', descripcion: '', platoIds: [] as ComboItem[], precio: '', dias: [], horaInicio: '', horaFin: '' }); setBusquedaPlatosCombo(''); setMostrarFormCombo(true); setIntentoCombo(false); setTouchedCombo({}) }} className="btn-primary" style={{ padding: '8px 14px', fontSize: '13px', marginBottom: '14px' }}>+ Crear combo</button>
                    )}
                  </>
                )}

                {mostrarFormCombo && (() => {
                  const errores = validarCombo(nuevoCombo)
                  const valido = Object.keys(errores).length === 0
                  const totalPlatosCombo = todosPlatos.length
                  const platosFiltradosCombo = busquedaPlatosCombo.trim()
                    ? todosPlatos.filter(p => p.nombre.toLowerCase().includes(busquedaPlatosCombo.toLowerCase()))
                    : todosPlatos
                  return (
                  <div className="card" style={{ padding: '14px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>{editandoComboId ? 'Editar combo' : 'Nuevo combo'}</div>
                    <input className="input" placeholder="Nombre del combo (ej: Combo paisa)" value={nuevoCombo.nombre} maxLength={50}
                      onChange={(e) => setNuevoCombo({ ...nuevoCombo, nombre: e.target.value })}
                      onBlur={() => setTouchedCombo(prev => ({ ...prev, nombre: true }))}
                      style={{
                        marginBottom: intentoCombo && touchedCombo.nombre && errores.nombre ? '4px' : '8px',
                        borderColor: intentoCombo && touchedCombo.nombre && errores.nombre ? 'var(--color-danger)' : undefined,
                      }} />
                    {intentoCombo && touchedCombo.nombre && errores.nombre && (
                      <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
                        {errores.nombre}
                      </div>
                    )}
                    <input className="input" placeholder="Descripción (opcional)" value={nuevoCombo.descripcion || ''}
                      onChange={(e) => {
                        if (e.target.value.length <= MAX_DESC) setNuevoCombo({ ...nuevoCombo, descripcion: e.target.value })
                      }}
                      style={{ marginBottom: '2px' }} />
                    <div style={{
                      textAlign: 'right',
                      fontSize: '10px',
                      color: (nuevoCombo.descripcion || '').length > MAX_DESC - 20
                        ? 'var(--color-warning)'
                        : 'var(--text-tertiary)',
                      marginBottom: '8px',
                    }}>
                      {(nuevoCombo.descripcion || '').length}/{MAX_DESC}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Selecciona los platos:</div>
                    {totalPlatosCombo >= 10 && (
                      <input
                        className="input"
                        type="text"
                        placeholder="Buscar plato..."
                        value={busquedaPlatosCombo}
                        onChange={(e) => setBusquedaPlatosCombo(e.target.value)}
                        style={{ marginBottom: '6px', fontSize: '12px' }}
                      />
                    )}
                    <div style={{ maxHeight: '160px', overflowY: 'auto', marginBottom: '8px' }}>
                      {platosFiltradosCombo.map(p => {
                        const currentItem = nuevoCombo.platoIds.find((i: ComboItem) => i.plato_id === p.id)
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
                            const yaSeleccionado = nuevoCombo.platoIds.some((i: ComboItem) => i.plato_id === p.id)
                            const sel: ComboItem[] = yaSeleccionado
                              ? nuevoCombo.platoIds.filter((i: ComboItem) => i.plato_id !== p.id)
                              : [...nuevoCombo.platoIds, {
                                  plato_id: p.id,
                                  variante_id: p.variantes?.[0]?.id ?? null,
                                }]
                            setNuevoCombo({ ...nuevoCombo, platoIds: sel })
                            setTouchedCombo(prev => ({ ...prev, platos: true }))
                          }} style={{
                            padding: '8px 10px',
                            borderBottom: '1px solid var(--border-light)', cursor: 'pointer',
                            background: isSelected ? 'var(--color-info-light)' : 'transparent',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <span style={{ fontSize: '12px' }}>{p.nombre}</span>
                                {(() => { const h = getHorarioPlato(p.id); return h ? <span style={{ fontSize: '9px', color: 'var(--color-warning)', marginLeft: '4px' }}>⏰ {formato12h(h.hora_inicio)}–{formato12h(h.hora_fin)}</span> : null })()}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>${formatoPrecio(precioMostrar)}</span>
                                {isSelected && <span style={{ color: 'var(--color-info)', fontSize: '12px' }}>✓</span>}
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
                                    const sel = nuevoCombo.platoIds.map((item: ComboItem) =>
                                      item.plato_id === p.id ? { ...item, variante_id: v as string } : item
                                    )
                                    setNuevoCombo({ ...nuevoCombo, platoIds: sel })
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
                                  error={intentoCombo && !!errores.platos && !currentItem?.variante_id}
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {intentoCombo && touchedCombo.platos && errores.platos && (
                      <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
                        {errores.platos}
                      </div>
                    )}
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', marginTop: '4px' }}>
                      Días activos (opcional):
                    </div>
                    <DiasSelector
                      value={nuevoCombo.dias}
                      onChange={(dias) => setNuevoCombo({ ...nuevoCombo, dias })}
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px', marginBottom: '10px' }}>
                      Sin selección = visible todos los días
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Horario (opcional):
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <TimePicker
                        value={nuevoCombo.horaInicio}
                        onChange={(v) => setNuevoCombo({ ...nuevoCombo, horaInicio: v })}
                      />
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>—</span>
                      <TimePicker
                        value={nuevoCombo.horaFin}
                        onChange={(v) => setNuevoCombo({ ...nuevoCombo, horaFin: v })}
                      />
                    </div>
                    <TimeRangeHelper
                      start={nuevoCombo.horaInicio || null}
                      end={nuevoCombo.horaFin || null}
                      verb="Combo disponible"
                    />
                    <div style={{ marginBottom: '10px' }} />
                    <input className="input" type="number" placeholder="Precio del combo" value={nuevoCombo.precio}
                      onChange={(e) => setNuevoCombo({ ...nuevoCombo, precio: e.target.value })}
                      onBlur={() => setTouchedCombo(prev => ({ ...prev, precio: true }))}
                      style={{
                        marginBottom: intentoCombo && touchedCombo.precio && errores.precio ? '4px' : '8px',
                        borderColor: intentoCombo && touchedCombo.precio && errores.precio ? 'var(--color-danger)' : undefined,
                      }} />
                    {intentoCombo && touchedCombo.precio && errores.precio && (
                      <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
                        {errores.precio}
                      </div>
                    )}
                    {nuevoCombo.platoIds.length > 0 && nuevoCombo.precio && (
                      <div style={{ fontSize: '12px', color: 'var(--color-green)', marginBottom: '8px' }}>
                        Ahorro: ${formatoPrecio(precioIndividualCombo - parseInt(nuevoCombo.precio || '0'))} ({Math.round(((precioIndividualCombo - parseInt(nuevoCombo.precio || '0')) / precioIndividualCombo) * 100)}% descuento)
                      </div>
                    )}
                    {nuevoCombo.platoIds.length > 0 && (() => {
                      const platosConHorario = nuevoCombo.platoIds.map((item: ComboItem) => ({ id: item.plato_id, horario: getHorarioPlato(item.plato_id) })).filter(p => p.horario)
                      if (platosConHorario.length === 0) return null
                      const horarios = platosConHorario.map(p => `${p.horario!.hora_inicio}–${p.horario!.hora_fin}`)
                      return (
                        <div style={{ fontSize: '11px', color: 'var(--color-warning)', background: 'var(--color-warning-light)', padding: '8px 10px', borderRadius: '6px', marginBottom: '8px' }}>
                          ⚠ Este combo incluye platos con horario restringido ({horarios.join(', ')}). El combo solo será visible cuando todos los platos estén activos.
                        </div>
                      )
                    })()}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={editandoComboId ? actualizarCombo : agregarCombo} disabled={guardandoCombo || guardadoCombo} className="btn-primary"
                        style={{
                          flex: 1, padding: '10px', fontSize: '13px',
                          opacity: valido ? 1 : 0.5,
                          cursor: valido ? 'pointer' : 'default',
                          ...(valido ? {} : { transform: 'none', boxShadow: 'none' }),
                        }}>{guardandoCombo ? 'Guardando...' : guardadoCombo ? '✓ Guardado' : editandoComboId ? 'Guardar cambios' : 'Crear'}</button>
                      <button onClick={() => { setMostrarFormCombo(false); setIntentoCombo(false); setTouchedCombo({}); setNuevoCombo({ nombre: '', descripcion: '', platoIds: [] as ComboItem[], precio: '', dias: [], horaInicio: '', horaFin: '' }); setBusquedaPlatosCombo(''); setEditandoComboId(null) }} className="btn-outline" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>Cancelar</button>
                    </div>
                  </div>
                  )
                })()}

                {combos.map((combo) => (
                  <div key={combo.id} className="card" style={{ padding: '14px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 500 }}>{combo.nombre}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{combo.platos.join(' + ')}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 500 }}>${formatoPrecio(combo.precio)}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', textDecoration: 'line-through' }}>${formatoPrecio(combo.precioIndividual)}</span>
                          <span className="badge badge-success">Ahorras ${formatoPrecio(combo.precioIndividual - combo.precio)}</span>
                        </div>
                        {((combo.dias && combo.dias.length > 0) || (combo.horario_inicio && combo.horario_fin)) && (
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                            {combo.dias && combo.dias.length > 0 && (
                              <span>{formatDias(combo.dias, 'short')}</span>
                            )}
                            {combo.dias && combo.dias.length > 0 && combo.horario_inicio && combo.horario_fin && ' · '}
                            {combo.horario_inicio && combo.horario_fin && (
                              <span>{formato12h(combo.horario_inicio)}–{formato12h(combo.horario_fin)}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div onClick={() => toggleCombo(combo.id)} style={{
                          width: '36px', height: '20px', borderRadius: '10px',
                          background: combo.activo ? 'var(--color-info)' : 'var(--border-light)',
                          position: 'relative', cursor: 'pointer',
                        }}>
                          <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'white', position: 'absolute', top: '2px', left: combo.activo ? '18px' : '2px', transition: 'left 0.2s' }} />
                        </div>
                        <span onClick={() => {
                          setNuevoCombo({
                            nombre: combo.nombre,
                            descripcion: combo.descripcion || '',
                            platoIds: (combo.combo_platos ?? []).map((cp: any) => ({
                              plato_id: cp.plato_id,
                              variante_id: cp.variante_id ?? null,
                            })) as ComboItem[],
                            precio: combo.precio.toString(),
                            dias: combo.dias || [],
                            horaInicio: combo.horario_inicio || '',
                            horaFin: combo.horario_fin || '',
                          })
                          setEditandoComboId(combo.id)
                          setMostrarFormCombo(true)
                          setIntentoCombo(false)
                          setTouchedCombo({})
                          setBusquedaPlatosCombo('')
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                        }} style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', color: 'var(--color-info)' }}>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
</span>
                        <span onClick={() => eliminarCombo(combo.id)} style={{ fontSize: '12px', color: 'var(--color-danger)', cursor: 'pointer' }}>✕</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* === PROMOS === */}
            {subTab === 'promos' && (
              <div style={{ padding: '14px 20px' }}>
                {promosSwr !== undefined && promos.length === 0 && !mostrarFormPromo ? (
                  <div style={{ textAlign: 'center', padding: '30px 0' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏷️</div>
                    <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Sin promociones</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Crea ofertas para atraer más clientes</div>
                    <button onClick={() => { setEditandoPromoId(null); setNuevaPromo({ nombre: '', descripcion: '', tipo: '', valor: '', dias: [], platoIds: [] as PromoItem[] }); setBusquedaPlatosPromo(''); setMostrarFormPromo(true); setIntentoPromo(false); setTouchedPromo({}) }} className="btn-primary" style={{ padding: '10px 20px', fontSize: '13px' }}>+ Crear promo</button>
                  </div>
                ) : (
                  <>
                    {!mostrarFormPromo && (
                      <button onClick={() => { setEditandoPromoId(null); setNuevaPromo({ nombre: '', descripcion: '', tipo: '', valor: '', dias: [], platoIds: [] as PromoItem[] }); setBusquedaPlatosPromo(''); setMostrarFormPromo(true); setIntentoPromo(false); setTouchedPromo({}) }} className="btn-primary" style={{ padding: '8px 14px', fontSize: '13px', marginBottom: '14px' }}>+ Crear promo</button>
                    )}
                  </>
                )}

                {mostrarFormPromo && (() => {
                  const errores = validarPromo(nuevaPromo)
                  const valido = Object.keys(errores).length === 0
                  const totalPlatosPromo = todosPlatos.length
                  const platosFiltradosPromo = busquedaPlatosPromo.trim()
                    ? todosPlatos.filter(p => p.nombre.toLowerCase().includes(busquedaPlatosPromo.toLowerCase()))
                    : todosPlatos
                  return (
                  <div className="card" style={{ padding: '14px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>{editandoPromoId ? 'Editar promoción' : 'Nueva promoción'}</div>
                    <input className="input" placeholder="Nombre (ej: Happy Hour)" value={nuevaPromo.nombre} maxLength={50}
                      onChange={(e) => setNuevaPromo({ ...nuevaPromo, nombre: e.target.value })}
                      onBlur={() => setTouchedPromo(prev => ({ ...prev, nombre: true }))}
                      style={{
                        marginBottom: intentoPromo && touchedPromo.nombre && errores.nombre ? '4px' : '8px',
                        borderColor: intentoPromo && touchedPromo.nombre && errores.nombre ? 'var(--color-danger)' : undefined,
                      }} />
                    {intentoPromo && touchedPromo.nombre && errores.nombre && (
                      <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
                        {errores.nombre}
                      </div>
                    )}
                    <input className="input" placeholder="Descripción (ej: Bebidas al 2x1 los viernes)" value={nuevaPromo.descripcion}
                      onChange={(e) => {
                        if (e.target.value.length <= MAX_DESC) setNuevaPromo({ ...nuevaPromo, descripcion: e.target.value })
                      }}
                      style={{ marginBottom: '2px' }} />
                    <div style={{
                      textAlign: 'right',
                      fontSize: '10px',
                      color: nuevaPromo.descripcion.length > MAX_DESC - 20
                        ? 'var(--color-warning)'
                        : 'var(--text-tertiary)',
                      marginBottom: '8px',
                    }}>
                      {nuevaPromo.descripcion.length}/{MAX_DESC}
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Tipo de promo:</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      {[
                        { id: 'dos_por_uno', label: '2x1' },
                        { id: 'descuento', label: '% Descuento' },
                      ].map(t => (
                        <div key={t.id} onClick={() => {
                          setNuevaPromo({ ...nuevaPromo, tipo: t.id, valor: '' })
                          setTouchedPromo(prev => ({ ...prev, tipo: true, valor: false, platos: false }))
                        }} style={{
                          padding: '7px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                          background: nuevaPromo.tipo === t.id ? 'var(--text-primary)' : 'var(--bg-secondary)',
                          color: nuevaPromo.tipo === t.id ? 'white' : 'var(--text-secondary)',
                          border: nuevaPromo.tipo === t.id ? 'none' : '1px solid var(--border-light)',
                        }}>{t.label}</div>
                      ))}
                    </div>
                    {intentoPromo && touchedPromo.tipo && errores.tipo && (
                      <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
                        {errores.tipo}
                      </div>
                    )}
                    {nuevaPromo.tipo === 'descuento' && (
                      <input className="input" type="number" placeholder="Porcentaje (ej: 20)" value={nuevaPromo.valor}
                        onChange={(e) => setNuevaPromo({ ...nuevaPromo, valor: e.target.value })}
                        onBlur={() => setTouchedPromo(prev => ({ ...prev, valor: true }))}
                        style={{
                          marginBottom: intentoPromo && touchedPromo.valor && errores.valor ? '4px' : '8px',
                          borderColor: intentoPromo && touchedPromo.valor && errores.valor ? 'var(--color-danger)' : undefined,
                        }} />
                    )}
                    {intentoPromo && touchedPromo.valor && errores.valor && nuevaPromo.tipo === 'descuento' && (
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
                        value={busquedaPlatosPromo}
                        onChange={(e) => setBusquedaPlatosPromo(e.target.value)}
                        style={{ marginBottom: '6px', fontSize: '12px' }}
                      />
                    )}
                    <div style={{ maxHeight: '160px', overflowY: 'auto', marginBottom: '10px', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                      {platosFiltradosPromo.map(p => {
                        const currentItem = nuevaPromo.platoIds.find((i: PromoItem) => i.plato_id === p.id)
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
                          const yaSeleccionado = nuevaPromo.platoIds.some((i: PromoItem) => i.plato_id === p.id)
                          // On select, default variante_id to null = "todas las variantes" (OPTIONAL lock,
                          // unlike combos which auto-pick variantes[0]).
                          const sel: PromoItem[] = yaSeleccionado
                            ? nuevaPromo.platoIds.filter((i: PromoItem) => i.plato_id !== p.id)
                            : [...nuevaPromo.platoIds, { plato_id: p.id, variante_id: null }]
                          setNuevaPromo({ ...nuevaPromo, platoIds: sel })
                          setTouchedPromo(prev => ({ ...prev, platos: true }))
                        }} style={{
                          padding: '8px 10px',
                          borderBottom: '1px solid var(--border-light)', cursor: 'pointer',
                          background: isSelected ? 'var(--color-info-light)' : 'transparent',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <span style={{ fontSize: '12px' }}>{p.nombre}</span>
                              {(() => { const h = getHorarioPlato(p.id); return h ? <span style={{ fontSize: '9px', color: 'var(--color-warning)', marginLeft: '4px' }}>⏰ {formato12h(h.hora_inicio)}–{formato12h(h.hora_fin)}</span> : null })()}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>${formatoPrecio(precioMostrar)}</span>
                              {isSelected && <span style={{ color: 'var(--color-info)', fontSize: '12px' }}>✓</span>}
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
                                  const sel = nuevaPromo.platoIds.map((item: PromoItem) =>
                                    item.plato_id === p.id ? { ...item, variante_id: (v as string) || null } : item
                                  )
                                  setNuevaPromo({ ...nuevaPromo, platoIds: sel })
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
                    {intentoPromo && touchedPromo.platos && errores.platos && (
                      <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
                        {errores.platos}
                      </div>
                    )}

                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Días activos:</div>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                      {['L', 'M', 'Mi', 'J', 'V', 'S', 'D'].map((d, i) => {
                        const dias = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
                        const sel = nuevaPromo.dias.includes(dias[i])
                        return (
                          <div key={d} onClick={() => {
                            setNuevaPromo({ ...nuevaPromo, dias: sel ? nuevaPromo.dias.filter(x => x !== dias[i]) : [...nuevaPromo.dias, dias[i]] })
                            setTouchedPromo(prev => ({ ...prev, dias: true }))
                          }} style={{
                            width: '32px', height: '32px', borderRadius: '50%', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', fontSize: '11px', cursor: 'pointer',
                            background: sel ? 'var(--text-primary)' : 'var(--bg-secondary)',
                            color: sel ? 'white' : 'var(--text-secondary)',
                            border: sel ? 'none' : '1px solid var(--border-light)',
                          }}>{d}</div>
                        )
                      })}
                    </div>
                    {intentoPromo && touchedPromo.dias && errores.dias && (
                      <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
                        {errores.dias}
                      </div>
                    )}
                    {(() => {
                      const tipoSet = !!nuevaPromo.tipo
                      const valorSet = nuevaPromo.tipo === 'dos_por_uno' || (nuevaPromo.valor && parseInt(nuevaPromo.valor) > 0)
                      const hasPlatos = nuevaPromo.platoIds.length > 0

                      if (!tipoSet || !valorSet || !hasPlatos) return null

                      const platosSeleccionados = nuevaPromo.platoIds
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
                        .filter(Boolean) as { plato: typeof todosPlatos[number]; precioBase: number; varianteNombre: string | null }[]

                      return (
                        <div style={{
                          background: 'var(--color-green-light)',
                          padding: '12px',
                          borderRadius: '8px',
                          marginBottom: '12px',
                        }}>
                          <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-green)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Vista previa
                          </div>
                          {nuevaPromo.tipo === 'dos_por_uno' ? (
                            <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                              Compra 2 lleva 1 gratis (ahorro 50% en el segundo)
                            </div>
                          ) : (
                            platosSeleccionados.map(({ plato, precioBase, varianteNombre }) => {
                              const original = precioBase
                              let final = 0
                              let detalle = ''

                              if (nuevaPromo.tipo === 'descuento') {
                                const valorNum = parseInt(nuevaPromo.valor)
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
                    {nuevaPromo.platoIds.length > 0 && (() => {
                      const platosConHorario = nuevaPromo.platoIds.map(item => ({ id: item.plato_id, horario: getHorarioPlato(item.plato_id) })).filter(p => p.horario)
                      if (platosConHorario.length === 0) return null
                      const horarios = platosConHorario.map(p => `${p.horario!.hora_inicio}–${p.horario!.hora_fin}`)
                      return (
                        <div style={{ fontSize: '11px', color: 'var(--color-warning)', background: 'var(--color-warning-light)', padding: '8px 10px', borderRadius: '6px', marginBottom: '8px' }}>
                          ⚠ Esta promo incluye platos con horario restringido ({horarios.join(', ')}). La promo solo será visible cuando todos los platos estén activos.
                        </div>
                      )
                    })()}
                    {intentoPromo && !guardandoPromo && !guardadoPromo && errores.conflicto && (
                      <div style={{ fontSize: '11px', color: 'var(--color-danger)', background: 'var(--color-danger-light)', padding: '8px 10px', borderRadius: '6px', marginBottom: '8px' }}>
                        {errores.conflicto}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={editandoPromoId ? actualizarPromo : agregarPromo} disabled={guardandoPromo || guardadoPromo} className="btn-primary"
                        style={{
                          flex: 1, padding: '10px', fontSize: '13px',
                          opacity: valido ? 1 : 0.5,
                          cursor: valido ? 'pointer' : 'default',
                          ...(valido ? {} : { transform: 'none', boxShadow: 'none' }),
                        }}>{guardandoPromo ? 'Guardando...' : guardadoPromo ? '✓ Guardado' : editandoPromoId ? 'Guardar cambios' : 'Crear'}</button>
                      <button onClick={() => { setMostrarFormPromo(false); setIntentoPromo(false); setTouchedPromo({}); setNuevaPromo({ nombre: '', descripcion: '', tipo: '', valor: '', dias: [], platoIds: [] as PromoItem[] }); setBusquedaPlatosPromo(''); setEditandoPromoId(null) }} className="btn-outline" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>Cancelar</button>
                    </div>
                  </div>
                  )
                })()}

                {promos.map((promo: any) => (
                  <div key={promo.id} className="card" style={{ padding: '14px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 500 }}>{promo.nombre}</div>
                        {promo.descripcion && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', overflowWrap: 'break-word' }}>{promo.descripcion}</div>}
                        {promo.platos && promo.platos.length > 0 && (
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>Aplica en: {promo.platos.join(', ')}</div>
                        )}
                        <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                          <span className="badge badge-warning">{promo.tipo === 'dos_por_uno' ? '2x1' : `${promo.valor}% off`}</span>
                          <span className="badge badge-neutral">{promo.dias.join(', ')}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div onClick={() => togglePromo(promo.id)} style={{
                          width: '36px', height: '20px', borderRadius: '10px',
                          background: promo.activo ? 'var(--color-info)' : 'var(--border-light)',
                          position: 'relative', cursor: 'pointer',
                        }}>
                          <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'white', position: 'absolute', top: '2px', left: promo.activo ? '18px' : '2px', transition: 'left 0.2s' }} />
                        </div>
                        <span onClick={() => {
                          // Rehydrate from the raw promoPlatos carry (with variante_id), not the
                          // lossy platosIds — mirrors combo edit-pop reading combo.combo_platos.
                          const platoIds: PromoItem[] = (promo.promoPlatos ?? []).map((pp: any) => ({
                            plato_id: pp.plato_id,
                            variante_id: pp.variante_id ?? null,
                          }))
                          setNuevaPromo({
                            nombre: promo.nombre,
                            descripcion: promo.descripcion || '',
                            tipo: promo.tipo,
                            valor: promo.valor || '',
                            dias: promo.dias || [],
                            platoIds,
                          })
                          setEditandoPromoId(promo.id)
                          setMostrarFormPromo(true)
                          setIntentoPromo(false)
                          setTouchedPromo({})
                          setBusquedaPlatosPromo('')
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                        }} style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', color: 'var(--color-info)' }}>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
</span>
                        <span onClick={() => eliminarPromo(promo.id)} style={{ fontSize: '12px', color: 'var(--color-danger)', cursor: 'pointer' }}>✕</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* === PLATO DEL DÍA === */}
            {/* Keyed fresh-mount: remonta al cambiar el registro guardado; gateado
                hasta que SWR resuelva (undefined = cargando, null = sin fila). */}
            {subTab === 'plato-dia' && platoDiaSwr !== undefined && (
              <PlatoDelDiaForm
                key={platoDiaSwr?.id ?? 'new'}
                restId={rest?.id}
                todosPlatos={todosPlatos}
                horariosPorPlato={horariosPorPlato}
                platoDiaOptions={platoDiaOptions}
                promos={promos}
                initial={platoDiaSwr}
                ganadorActivo={platoGanadorActivo}
                ganadorPlatoId={platoGanadorSwr?.plato_id || ''}
              />
            )}

            {/* === PLATO GANADOR === */}
            {/* Keyed fresh-mount, espejo del plato del día. */}
            {subTab === 'plato-ganador' && platoGanadorSwr !== undefined && (
              <PlatoGanadorForm
                key={platoGanadorSwr?.id ?? 'new'}
                restId={rest?.id}
                todosPlatos={todosPlatos}
                horariosPorPlato={horariosPorPlato}
                platoGanadorOptions={platoGanadorOptions}
                initial={platoGanadorSwr}
                diaActivo={platoDiaActivo}
                diaPlatoId={platoDiaSwr?.plato_id || ''}
              />
            )}

            </>
            )}
          </>
        )}
        
        {/* === SORPRÉNDEME === */}
        {tabActiva === 'sorprendeme' && !(plan === 'basico' || plan === 'pro') && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔒</div>
            <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '6px' }}>Sorpréndeme</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.6 }}>
              Configura una combinación aleatoria para tus clientes. Disponible desde el Plan Básico.
            </div>
            <div onClick={() => router.push('/suscripcion')} style={{
              display: 'inline-block', background: 'var(--text-primary)', color: 'white',
              padding: '12px 24px', borderRadius: 'var(--radius-md)', fontSize: '13px',
              fontWeight: 500, cursor: 'pointer',
            }}>
              Ver Planes
            </div>
          </div>
        )}
        {tabActiva === 'sorprendeme' && (plan === 'basico' || plan === 'pro') && (
              <div style={{ padding: '14px 20px' }}>
                <div className="card" style={{ padding: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Configurar Sorpréndeme</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                    Selecciona 2 categorías. Cuando el cliente toque "Sorpréndeme", verá un plato aleatorio de cada una.
                  </div>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {categorias.map((cat: any) => {
                    const seleccionada = sorprendemeCatsMenu.includes(cat.id)
                    const puedeSeleccionar = seleccionada || sorprendemeCatsMenu.length < 2
                    return (
                      <div key={cat.id} onClick={() => {
                        if (seleccionada) {
                          actualizarSorprendemeCats(sorprendemeCatsMenu.filter((id: string) => id !== cat.id))
                        } else if (puedeSeleccionar) {
                          actualizarSorprendemeCats([...sorprendemeCatsMenu, cat.id])
                        }
                      }} style={{
                        padding: '12px', borderRadius: '10px', marginBottom: '8px', cursor: puedeSeleccionar || seleccionada ? 'pointer' : 'default',
                        border: seleccionada ? '2px solid var(--color-info)' : '1px solid var(--border-light)',
                        background: seleccionada ? 'var(--color-info-light)' : 'transparent',
                        opacity: !puedeSeleccionar && !seleccionada ? 0.4 : 1,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <div>
                          <span style={{ fontSize: '13px', fontWeight: 500 }}>{cat.nombre}</span>
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                            {cat.platos.length} platos
                            {cat.hora_inicio && cat.hora_fin && (
                              <span style={{ color: 'var(--color-warning)', marginLeft: '6px' }}>⏰ {cat.hora_inicio}–{cat.hora_fin}</span>
                            )}
                          </div>
                        </div>
                        {seleccionada && <span style={{ color: 'var(--color-info)', fontSize: '16px' }}>✓</span>}
                      </div>
                    )
                  })}
                  </div>
                  {sorprendemeCatsMenu.length === 2 && (() => {
                    const catsConHorario = sorprendemeCatsMenu.map(id => categorias.find(c => c.id === id)).filter(c => c?.hora_inicio && c?.hora_fin)
                    return (
                      <>
                        <div style={{ background: 'var(--color-green-light)', borderRadius: '8px', padding: '12px', marginTop: '8px' }}>
                          <div style={{ fontSize: '12px', color: 'var(--color-green)', fontWeight: 500 }}>✓ Configuración lista</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-green)', marginTop: '2px' }}>El Sorpréndeme mostrará un plato de cada categoría seleccionada</div>
                        </div>
                        {catsConHorario.length > 0 && (
                          <div style={{ background: 'var(--color-warning-light)', borderRadius: '8px', padding: '10px', marginTop: '8px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--color-warning)' }}>
                              ⚠ {catsConHorario.length === 1 ? `La categoría "${catsConHorario[0]?.nombre}" tiene horario (${catsConHorario[0]?.hora_inicio}–${catsConHorario[0]?.hora_fin}).` : 'Ambas categorías tienen horario.'} El Sorpréndeme solo funcionará cuando {catsConHorario.length === 1 ? 'esta categoría esté' : 'ambas estén'} activa{catsConHorario.length === 1 ? '' : 's'}.
                            </div>
                          </div>
                        )}
                      </>
                    )
                  })()}
                  {sorprendemeCatsMenu.length < 2 && (
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '8px' }}>
                      Selecciona {2 - sorprendemeCatsMenu.length} categoría{sorprendemeCatsMenu.length === 1 ? '' : 's'} más
                    </div>
                  )}
                </div>
              </div>
            )}
        {/* Modal horario categoría */}
        {horarioCategoria && (() => {
          const cat = categorias.find(c => c.id === horarioCategoria)
          return (
            <Modal
              isOpen={!!horarioCategoria}
              onClose={() => setHorarioCategoria(null)}
              title={`Horario de "${cat?.nombre || ''}"`}
              maxWidth={500}
            >
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                Define en qué horario esta categoría es visible en el menú. Déjalo vacío para que se muestre siempre.
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="label">Horario de visibilidad</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                  <TimePicker
                    value={horarioCatInicio}
                    onChange={(v) => setHorarioCatInicio(v)}
                  />
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>—</span>
                  <TimePicker
                    value={horarioCatFin}
                    onChange={(v) => setHorarioCatFin(v)}
                  />
                </div>
                <TimeRangeHelper
                  start={horarioCatInicio}
                  end={horarioCatFin}
                  verb={`"${cat?.nombre || ''}" visible`}
                />
              </div>

              {(() => {
                const avisoHorario = horarioCategoria && horarioCatInicio && horarioCatFin
                  ? detectarAfectados(horarioCategoria)
                  : []
                return (
                  <>
                    {avisoHorario.length > 0 && (
                      <div style={{ marginBottom: '14px', background: 'var(--color-warning-light)', border: '1px solid var(--color-warning)', borderRadius: '8px', padding: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-warning)', marginBottom: '8px' }}>
                          Esto afectará otras funciones
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                          Al asignar horario a "{cat?.nombre}", lo siguiente solo será visible de {formato12h(horarioCatInicio)} a {formato12h(horarioCatFin)}:
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
                        onClick={guardarHorarioCategoria}
                        disabled={guardandoHorarioCat}
                        className="btn-primary"
                        style={{ flex: 1, padding: '12px', fontSize: '13px' }}
                      >
                        {guardandoHorarioCat ? 'Guardando...' : guardadoHorarioCat ? '✓ Guardado' : 'Guardar'}
                      </button>
                      <button
                        onClick={() => { setHorarioCatInicio(''); setHorarioCatFin('') }}
                        className="btn-outline"
                        style={{ padding: '12px 16px', fontSize: '13px' }}
                      >
                        Limpiar
                      </button>
                    </div>
                  </>
                )
              })()}
            </Modal>
          )
        })()}

        {/* El modal cascadeWarning (variantes vinculadas) vive en PlatoEditPanel. */}

        {/* Aviso efímero genérico (banner auto-descartable, reusable vía mostrarAviso) */}
        {aviso && (
          <div style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 200,
            maxWidth: '90vw',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-light)',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            fontSize: '13px',
            color: 'var(--text-primary)',
          }}>
            <span>{aviso}</span>
            <span
              onClick={() => setAviso(null)}
              style={{ cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '14px', lineHeight: 1, flexShrink: 0 }}
              aria-label="Cerrar aviso"
            >✕</span>
          </div>
        )}

        {/* Modal confirmación de borrado de PLATO completo */}
        {platoDeleteWarning && (() => {
          const { combosCount, promosCount, esDiaActual, esGanadorActual } = platoDeleteWarning
          const tieneRefs = combosCount > 0 || promosCount > 0 || esDiaActual || esGanadorActual
          const textoVinc = construirTextoVinculaciones([
            { n: combosCount, sing: 'combo', plur: 'combos' },
            { n: promosCount, sing: 'promo', plur: 'promos' },
          ])
          return (
            <Modal
              isOpen={!!platoDeleteWarning}
              onClose={() => setPlatoDeleteWarning(null)}
              title="¿Eliminar este plato?"
              maxWidth={460}
            >
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '12px' }}>
                {platoDeleteWarning.nombre || '(sin nombre)'}
              </div>

              {textoVinc && (
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                  Vinculado a {textoVinc}.
                </div>
              )}

              {esDiaActual && (
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-danger)', marginBottom: '8px' }}>
                  Es tu Plato del Día actual — el destacado quedará vacío.
                </div>
              )}
              {esGanadorActual && (
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-danger)', marginBottom: '8px' }}>
                  Es tu Plato Ganador actual — el destacado quedará vacío.
                </div>
              )}

              <div style={{ fontSize: '12px', color: 'var(--color-danger)', marginBottom: '16px' }}>
                {tieneRefs
                  ? 'Si continuás, el plato y esas vinculaciones se eliminarán automáticamente. Esta acción no se puede deshacer.'
                  : 'Esta acción no se puede deshacer.'}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    const cb = platoDeleteWarning.onConfirm
                    setPlatoDeleteWarning(null)
                    cb()
                  }}
                  className="btn-primary"
                  style={{ flex: 1, padding: '10px', fontSize: '13px', background: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                >
                  Sí, eliminar
                </button>
                <button
                  onClick={() => setPlatoDeleteWarning(null)}
                  className="btn-outline"
                  style={{ flex: 1, padding: '10px', fontSize: '13px' }}
                >
                  Cancelar
                </button>
              </div>
            </Modal>
          )
        })()}

        {categoriaDeleteWarning && (() => {
          const { platosCount, combosCount, promosCount, esDiaActual, esGanadorActual } = categoriaDeleteWarning
          const tieneRefs = combosCount > 0 || promosCount > 0 || esDiaActual || esGanadorActual
          const textoVinc = construirTextoVinculaciones([
            { n: combosCount, sing: 'combo', plur: 'combos' },
            { n: promosCount, sing: 'promo', plur: 'promos' },
          ])
          return (
            <Modal
              isOpen={!!categoriaDeleteWarning}
              onClose={() => setCategoriaDeleteWarning(null)}
              title="¿Estás seguro de eliminar esta categoría?"
              maxWidth={460}
            >
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '12px' }}>
                {categoriaDeleteWarning.nombre || '(sin nombre)'}
              </div>

              {platosCount > 0 && (
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                  Se eliminarán {platosCount} {platosCount === 1 ? 'plato' : 'platos'}.
                </div>
              )}

              {textoVinc && (
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                  Vinculada a {textoVinc}.
                </div>
              )}

              {esDiaActual && (
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-danger)', marginBottom: '8px' }}>
                  Es tu Plato del Día actual — el destacado quedará vacío.
                </div>
              )}
              {esGanadorActual && (
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-danger)', marginBottom: '8px' }}>
                  Es tu Plato Ganador actual — el destacado quedará vacío.
                </div>
              )}

              <div style={{ fontSize: '12px', color: 'var(--color-danger)', marginBottom: '16px' }}>
                {tieneRefs
                  ? 'Si continuás, la categoría, sus platos y esas vinculaciones se eliminarán automáticamente. Esta acción no se puede deshacer.'
                  : 'Esta acción no se puede deshacer.'}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    const cb = categoriaDeleteWarning.onConfirm
                    setCategoriaDeleteWarning(null)
                    cb()
                  }}
                  className="btn-primary"
                  style={{ flex: 1, padding: '10px', fontSize: '13px', background: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                >
                  Sí, eliminar
                </button>
                <button
                  onClick={() => setCategoriaDeleteWarning(null)}
                  className="btn-outline"
                  style={{ flex: 1, padding: '10px', fontSize: '13px' }}
                >
                  Cancelar
                </button>
              </div>
            </Modal>
          )
        })()}

        {/* Modal recorte de imagen */}
        {cropModal && (
          <>
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 80 }} />
            <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', flexDirection: 'column', maxWidth: '500px', minWidth: '320px', margin: '0 auto' }}>
              {/* Header */}
              <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span onClick={() => setCropModal(null)} style={{ fontSize: '14px', color: 'white', cursor: 'pointer' }}>Cancelar</span>
                <span style={{ fontSize: '15px', fontWeight: 500, color: 'white' }}>Ajustar foto</span>
                <span onClick={confirmarRecorte} style={{ fontSize: '14px', color: '#4CAF50', fontWeight: 500, cursor: 'pointer' }}>Listo</span>
              </div>

              {/* Área de recorte */}
              <div style={{ position: 'relative', flex: 1 }}>
                <Cropper
                  image={cropModal.imagen}
                  crop={crop}
                  zoom={zoom}
                  aspect={16 / 9}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>

              {/* Controles */}
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', maxWidth: '300px' }}>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>-</span>
                  <input type="range" min={1} max={3} step={0.1} value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#4CAF50' }} />
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>+</span>
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Arrastra para ajustar · Zoom para acercar</div>
              </div>
            </div>
          </>
        )}
        <BottomNav />

      </div>
    </div>
  )
}