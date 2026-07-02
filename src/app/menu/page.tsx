'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks'
import { useCategoriasYPlatos } from '@/hooks/data/useCategoriasYPlatos'
import { usePlatoDelDia } from '@/hooks/data/usePlatoDelDia'
import { useCombos } from '@/hooks/data/useCombos'
import { usePromos } from '@/hooks/data/usePromos'
import { useConfigRestaurante } from '@/hooks/data/useConfigRestaurante'
import { usePlatoGanador } from '@/hooks/data/usePlatoGanador'
import { createClient } from '@/lib/supabase-browser'
import CropModal from '@/components/ui/CropModal'
import Modal from '@/components/ui/Modal'
import BottomNav from '@/components/BottomNav'
import { construirTextoVinculaciones } from '@/components/menu-admin/VarianteEditor'
import CategoriaForm from '@/components/menu-admin/CategoriaForm'
import CategoriaSection from '@/components/menu-admin/CategoriaSection'
import HorarioCategoriaModal from '@/components/menu-admin/HorarioCategoriaModal'
import PlatoDelDiaForm from '@/components/menu-admin/PlatoDelDiaForm'
import PlatoGanadorForm from '@/components/menu-admin/PlatoGanadorForm'
import ComboForm from '@/components/menu-admin/ComboForm'
import PromoForm from '@/components/menu-admin/PromoForm'
import { invalidateAll } from '@/lib/swr'
import { formato12h } from '@/lib/time'
import { formatoPrecio } from '@/lib/precio'
import { formatDias } from '@/lib/dias'
import { puedeSubirFoto as calcularPuedeSubirFoto, LIMITE_FOTOS_GRATIS } from '@/lib/fotosGate'
import type { Plan, Variante } from '@/types'

// construirTextoVinculaciones se movió a components/menu-admin/VarianteEditor
// (lo comparten los modales de borrado de aquí y las notas de fila marcada del editor).

interface Plato {
  id: string; nombre: string; precio: number; descripcion: string; disponible: boolean; foto_url: string | null
  variantes?: Variante[]
}
interface Categoria {
  id: string; nombre: string; orden: number; platos: Plato[]; hora_inicio?: string | null; hora_fin?: string | null
}

// El shape ComboItem vive en components/menu-admin/ComboForm (F8.5b).

// El shape PromoItem vive en components/menu-admin/PromoForm.

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

  // ── Fotos por plan (STRATEGIC.2) ──
  // Cupo VIVO en gratis nunca-pago: cuenta platos con foto en TODO el menú (borrar
  // libera cupo; reemplazar no lo consume). fue_pago (downgrade) no sube nada.
  const fuePago = !!rest?.fue_pago
  const fotosUsadas = useMemo(
    () => (catsAndPlatos?.platos ?? []).filter((p: any) => p.foto_url != null).length,
    [catsAndPlatos]
  )
  const puedeSubirFoto = calcularPuedeSubirFoto(plan as Plan, fuePago, fotosUsadas)
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
  // Puntero del rename inline de categoría — nombre + cuarteto viven en el
  // CategoriaRenameForm privado de CategoriaSection (fresh-mount por apertura).
  const [editandoCategoria, setEditandoCategoria] = useState<string | null>(null)
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
  // Puntero del modal de recorte — crop/zoom/croppedAreaPixels viven en
  // components/ui/CropModal (fresh-mount por apertura).
  const [cropModal, setCropModal] = useState<{ imagen: string; platoId: string; categoriaId: string } | null>(null)
  const [subTab, setSubTab] = useState<'combos' | 'promos' | 'plato-dia' | 'plato-ganador'>('combos')
  // Punteros del form de combo (crear/editar) — el borrador, su cuarteto y la
  // búsqueda de platos viven en ComboForm (fresh-mount keyed en editandoComboId).
  const [mostrarFormCombo, setMostrarFormCombo] = useState(false)
  const [editandoComboId, setEditandoComboId] = useState<string | null>(null)
  const cerrarFormCombo = useCallback(() => {
    setMostrarFormCombo(false)
    setEditandoComboId(null)
  }, [])
  // Punteros del form de promo (crear/editar) — el borrador, su cuarteto y la
  // búsqueda viven en PromoForm (fresh-mount keyed en editandoPromoId).
  const [mostrarFormPromo, setMostrarFormPromo] = useState(false)
  const [editandoPromoId, setEditandoPromoId] = useState<string | null>(null)
  const cerrarFormPromo = useCallback(() => {
    setMostrarFormPromo(false)
    setEditandoPromoId(null)
  }, [])
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
  // Puntero del modal de horario de categoría — inicio/fin + guardando/guardado
  // viven en HorarioCategoriaModal (fresh-mount, siembra desde la categoría).
  const [horarioCategoria, setHorarioCategoria] = useState<string | null>(null)
  const cerrarHorarioCategoria = useCallback(() => setHorarioCategoria(null), [])

  // ── Callbacks estables para las filas/secciones memoizadas (BL.13) ──
  // Los handlers que leen datos vivos (categorias/combos/promos/SWR) se delegan
  // vía ref a la versión del ÚLTIMO render: identidad constante para React.memo
  // sin closures viejos (el wrapper lee liveHandlers.current al momento del
  // click, nunca al momento de crearse). Los que solo tocan setters usan
  // updates funcionales y son estables por sí mismos.
  const liveHandlers = useRef({} as {
    moverCategoria: (id: string, direccion: 'arriba' | 'abajo') => void
    moverPlato: (categoriaId: string, platoId: string, direccion: 'arriba' | 'abajo') => void
    toggleDisponible: (categoriaId: string, platoId: string) => void
    requestDeletePlato: (categoriaId: string, platoId: string) => void
    requestDeleteCategoria: (catId: string) => void
    seleccionarFoto: (platoId: string, categoriaId: string, file: File) => void
  })
  liveHandlers.current = {
    moverCategoria,
    moverPlato,
    toggleDisponible,
    requestDeletePlato,
    requestDeleteCategoria,
    seleccionarFoto: seleccionarFotoLive,
  }
  const onMoverCategoria = useCallback((id: string, d: 'arriba' | 'abajo') => liveHandlers.current.moverCategoria(id, d), [])
  const onMoverPlato = useCallback((c: string, p: string, d: 'arriba' | 'abajo') => liveHandlers.current.moverPlato(c, p, d), [])
  const onToggleDisponible = useCallback((c: string, p: string) => liveHandlers.current.toggleDisponible(c, p), [])
  const onRequestDeletePlato = useCallback((c: string, p: string) => liveHandlers.current.requestDeletePlato(c, p), [])
  const onRequestDeleteCategoria = useCallback((c: string) => liveHandlers.current.requestDeleteCategoria(c), [])
  const seleccionarFoto = useCallback((platoId: string, categoriaId: string, file: File) => liveHandlers.current.seleccionarFoto(platoId, categoriaId, file), [])
  const onToggleExpand = useCallback((platoId: string) => setPlatoExpandido(prev => prev === platoId ? null : platoId), [])
  const onToggleFormPlato = useCallback((catId: string) => setMostrarFormPlato(prev => prev === catId ? null : catId), [])
  const onToggleMenuCategoria = useCallback((catId: string) => setMenuCategoria(prev => prev === catId ? null : catId), [])
  const onCerrarMenuCategoria = useCallback(() => setMenuCategoria(null), [])
  const onAbrirRename = useCallback((catId: string) => { setEditandoCategoria(catId); setMenuCategoria(null) }, [])
  const onCerrarRename = useCallback(() => setEditandoCategoria(null), [])
  const onAbrirHorario = useCallback((catId: string) => { setHorarioCategoria(catId); setMenuCategoria(null) }, [])

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

  // El guardado del horario de categoría vive en HorarioCategoriaModal.


  async function actualizarSorprendemeCats(nuevas: string[]) {
    setSorprendemeCatsMenu(nuevas)
    if (!rest?.id) return
    const supabase = createClient()
    await supabase.from('config_restaurante').update({ sorprendeme_categorias: nuevas }).eq('restaurante_id', rest.id)
    await mutateConfig()
  }
  
  // validarPlatoDia, guardar y desactivar viven en components/menu-admin/PlatoDelDiaForm.

  // validarPlatoGanador, guardar y desactivar viven en components/menu-admin/PlatoGanadorForm.

  // detectarConflictoPromo, validarPromo y los guardados de promo viven en
  // components/menu-admin/PromoForm (con promos/excludeId/todosPlatos como
  // parámetros explícitos). limpiarPromosVacias sigue siendo SOLO de los
  // handlers de borrado de esta página — nunca de un guardado ni de un efecto.
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
  // recortarImagen vive en lib/imagen; la UI de recorte en components/ui/CropModal.

  // Guard de cupo de fotos (STRATEGIC.2). Bloquea una foto NUEVA sin elegibilidad;
  // REEMPLAZAR una existente no cambia el conteo y sigue permitido en nunca-pago
  // (el upload es upsert al mismo path). fue_pago en gratis: bloqueado siempre,
  // incluso el reemplazo. Devuelve true si hay que cortar el pipeline.
  function fotoBloqueada(platoId: string): boolean {
    const tieneFoto = (catsAndPlatos?.platos ?? []).some((p: any) => p.id === platoId && p.foto_url != null)
    if (puedeSubirFoto || (tieneFoto && !fuePago)) return false
    mostrarAviso(fuePago
      ? 'Tus fotos están ocultas en el plan gratis. Vuelve a Básico para mostrarlas.'
      : `Alcanzaste las ${LIMITE_FOTOS_GRATIS} fotos del plan gratis. Actualiza a Básico para fotos ilimitadas.`)
    return true
  }

  // Cuerpo VIVO de seleccionarFoto: lee el guard de cupo del último render. Baja a
  // PlatoEditPanel (React.memo) vía el delegado estable `seleccionarFoto` del bloque
  // liveHandlers (BL.13) — la identidad no cambia cuando cambian catsAndPlatos/cupo.
  function seleccionarFotoLive(platoId: string, categoriaId: string, file: File) {
    if (fotoBloqueada(platoId)) return
    if (file.size > 10 * 1024 * 1024) {
      alert('La imagen es muy grande. Máximo 10MB.')
      return
    }
    const url = URL.createObjectURL(file)
    setCropModal({ imagen: url, platoId, categoriaId })
  }

  // Mitad de SUBIDA del pipeline de foto: el blob ya viene recortado por
  // CropModal (Listo → onConfirm). Storage path + update + mutate son de /menu.
  async function confirmarRecorte(blob: Blob) {
    if (!cropModal || !rest?.id) return
    // Re-chequeo del guard al confirmar: el conteo pudo cambiar entre seleccionar
    // y recortar (p.ej. otra foto subida mientras el CropModal estaba abierto).
    if (fotoBloqueada(cropModal.platoId)) {
      setCropModal(null)
      return
    }
    setSubiendoFoto(true)
    setCropModal(null)

    const supabase = createClient()
    const path = `${rest.id}/platos/${cropModal.platoId}.jpg`

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

  // getHorarioPlato vive ahora como helper local de cada form admin (todos
  // reciben horariosPorPlato); en la página solo queda el Map.

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
  // validarCombo, precioIndividual y los guardados de combo viven en
  // components/menu-admin/ComboForm.
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
  // renombrarCategoria vive en el CategoriaRenameForm de CategoriaSection.
  // Apertura del modal de confirmación de borrado de categoría: los conteos se
  // computan acá (sobre `categorias` SIN filtrar — el borrado afecta todos los
  // platos, no solo los visibles bajo una búsqueda activa) y el modal queda en
  // la página; CategoriaSection solo dispara onRequestDeleteCategoria(catId).
  function requestDeleteCategoria(catId: string) {
    const cat = categorias.find(c => c.id === catId)
    if (!cat) return
    const categoryPlatoIds = cat.platos.map(p => p.id)
    const combosCount = combos.filter(c => c.platosIds.some((id: string) => categoryPlatoIds.includes(id))).length
    const promosCount = promos.filter(p => p.activo && p.platosIds.some((id: string) => categoryPlatoIds.includes(id))).length
    const esDiaActual = platoDiaActivo && categoryPlatoIds.includes(platoDiaSwr?.plato_id)
    const esGanadorActual = platoGanadorActivo && categoryPlatoIds.includes(platoGanadorSwr?.plato_id)
    setMenuCategoria(null)
    setCategoriaDeleteWarning({
      categoriaId: catId,
      nombre: cat.nombre,
      platosCount: cat.platos.length,
      combosCount, promosCount, esDiaActual, esGanadorActual,
      onConfirm: () => eliminarCategoria(catId),
    })
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
  // Apertura del modal de confirmación de borrado de PLATO: conteos EN MEMORIA
  // (sin queries) — combos/promos por platosIds, día/ganador por el registro
  // SWR guardado; promos: solo ACTIVAS. PlatoCard solo dispara
  // onRequestDeletePlato(categoriaId, platoId).
  function requestDeletePlato(categoriaId: string, platoId: string) {
    const plato = categorias.find(c => c.id === categoriaId)?.platos.find(p => p.id === platoId)
    if (!plato) return
    const combosCount = combos.filter(c => c.platosIds.includes(platoId)).length
    const promosCount = promos.filter(p => p.activo && p.platosIds.includes(platoId)).length
    const esDiaActual = platoDiaActivo && platoDiaSwr?.plato_id === platoId
    const esGanadorActual = platoGanadorActivo && platoGanadorSwr?.plato_id === platoId
    setPlatoDeleteWarning({
      categoriaId,
      platoId,
      nombre: plato.nombre,
      combosCount,
      promosCount,
      esDiaActual,
      esGanadorActual,
      onConfirm: () => eliminarPlato(categoriaId, platoId),
    })
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

            {/* Categorías — secciones memoizadas (BL.13): un render de página
                salta secciones y filas intactas; ver contrato en CategoriaSection. */}
            {categoriasFiltradas.map((cat, catIdx) => (
              <CategoriaSection
                key={cat.id}
                cat={cat}
                catIdx={catIdx}
                totalCategorias={categorias.length}
                renombrando={editandoCategoria === cat.id}
                menuAbierto={menuCategoria === cat.id}
                formPlatoAbierto={mostrarFormPlato === cat.id}
                ordenSiguientePlato={categorias.find(c => c.id === cat.id)?.platos.length ?? 0}
                platoExpandido={platoExpandido}
                restId={rest?.id}
                combos={combos}
                promos={promos}
                diaVarianteId={platoDiaActivo ? platoDiaSwr?.variante_id ?? null : null}
                ganadorVarianteId={platoGanadorActivo ? platoGanadorSwr?.variante_id ?? null : null}
                esBasico={esBasico}
                fuePago={fuePago}
                fotosUsadas={fotosUsadas}
                puedeSubirFoto={puedeSubirFoto}
                subiendoFoto={subiendoFoto}
                mutateCategoriasYPlatos={mutateCategoriasYPlatos}
                onMoverCategoria={onMoverCategoria}
                onToggleMenuCategoria={onToggleMenuCategoria}
                onCerrarMenuCategoria={onCerrarMenuCategoria}
                onAbrirRename={onAbrirRename}
                onCerrarRename={onCerrarRename}
                onAbrirHorario={onAbrirHorario}
                onRequestDeleteCategoria={onRequestDeleteCategoria}
                onToggleFormPlato={onToggleFormPlato}
                onCerrarFormPlato={cerrarFormPlato}
                onToggleExpand={onToggleExpand}
                onMoverPlato={onMoverPlato}
                onToggleDisponible={onToggleDisponible}
                onRequestDeletePlato={onRequestDeletePlato}
                onSelectFoto={seleccionarFoto}
                onCascadeCleanup={limpiarTrasCascada}
                onCerrarEditPlato={cerrarEditPlato}
              />
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
                    <button onClick={() => { setEditandoComboId(null); setMostrarFormCombo(true) }} className="btn-primary" style={{ padding: '10px 20px', fontSize: '13px' }}>+ Crear combo</button>
                  </div>
                ) : (
                  <>
                    {!mostrarFormCombo && (
                      <button onClick={() => { setEditandoComboId(null); setMostrarFormCombo(true) }} className="btn-primary" style={{ padding: '8px 14px', fontSize: '13px', marginBottom: '14px' }}>+ Crear combo</button>
                    )}
                  </>
                )}

                {mostrarFormCombo && (
                  <ComboForm
                    key={editandoComboId ?? 'new'}
                    restId={rest?.id}
                    todosPlatos={todosPlatos}
                    horariosPorPlato={horariosPorPlato}
                    comboInicial={editandoComboId ? combos.find(c => c.id === editandoComboId) ?? null : null}
                    onClose={cerrarFormCombo}
                  />
                )}

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
                          // El seeding del borrador lo hace ComboForm al montar
                          // (keyed en editandoComboId, lee comboInicial).
                          setEditandoComboId(combo.id)
                          setMostrarFormCombo(true)
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
                    <button onClick={() => { setEditandoPromoId(null); setMostrarFormPromo(true) }} className="btn-primary" style={{ padding: '10px 20px', fontSize: '13px' }}>+ Crear promo</button>
                  </div>
                ) : (
                  <>
                    {!mostrarFormPromo && (
                      <button onClick={() => { setEditandoPromoId(null); setMostrarFormPromo(true) }} className="btn-primary" style={{ padding: '8px 14px', fontSize: '13px', marginBottom: '14px' }}>+ Crear promo</button>
                    )}
                  </>
                )}

                {mostrarFormPromo && (
                  <PromoForm
                    key={editandoPromoId ?? 'new'}
                    restId={rest?.id}
                    todosPlatos={todosPlatos}
                    horariosPorPlato={horariosPorPlato}
                    promos={promos}
                    promoInicial={editandoPromoId ? promos.find(p => p.id === editandoPromoId) ?? null : null}
                    onClose={cerrarFormPromo}
                  />
                )}

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
                          // El seeding del borrador lo hace PromoForm al montar
                          // (keyed en editandoPromoId, lee promoInicial.promoPlatos).
                          setEditandoPromoId(promo.id)
                          setMostrarFormPromo(true)
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
            <HorarioCategoriaModal
              catId={horarioCategoria}
              catNombre={cat?.nombre || ''}
              inicioInicial={cat?.hora_inicio || ''}
              finInicial={cat?.hora_fin || ''}
              afectados={detectarAfectados(horarioCategoria)}
              mutateCategoriasYPlatos={mutateCategoriasYPlatos}
              onClose={cerrarHorarioCategoria}
            />
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
          <CropModal
            imagen={cropModal.imagen}
            aspect={16 / 9}
            titulo="Ajustar foto"
            anchoSalida={800}
            altoSalida={450}
            onConfirm={confirmarRecorte}
            onCancel={() => setCropModal(null)}
          />
        )}
        <BottomNav />

      </div>
    </div>
  )
}