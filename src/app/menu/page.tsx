'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { mutate as globalMutate } from 'swr'
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
import TimeRangeHelper from '@/components/ui/TimeRangeHelper'
import Select from '@/components/ui/Select'
import DiasSelector from '@/components/ui/DiasSelector'
import { formato12h } from '@/lib/time'
import type { DiaSemana, Variante } from '@/types'

function invalidateAll(prefix: string) {
  return globalMutate(
    (key) => Array.isArray(key) && key[0] === prefix,
    undefined,
    { revalidate: true, populateCache: false },
  )
}

function formatDiasShort(dias: string[]): string {
  const map: Record<string, string> = {
    lun: 'Lun', mar: 'Mar', mie: 'Mié', jue: 'Jue',
    vie: 'Vie', sab: 'Sáb', dom: 'Dom',
  }
  return dias.map(d => map[d] || d).join(', ')
}

interface Plato {
  id: string; nombre: string; precio: number; descripcion: string; disponible: boolean; foto_url: string | null
  variantes?: Variante[]
}
interface Categoria {
  id: string; nombre: string; orden: number; platos: Plato[]; hora_inicio?: string | null; hora_fin?: string | null
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
  const [mostrarFormCategoria, setMostrarFormCategoria] = useState(false)
  const [nuevaCategoria, setNuevaCategoria] = useState('')
  const [intentoCategoria, setIntentoCategoria] = useState(false)
  const [touchedCategoria, setTouchedCategoria] = useState<Record<string, boolean>>({})
  const [guardandoCat, setGuardandoCat] = useState(false)
  const [guardadoCat, setGuardadoCat] = useState(false)
  const [mostrarFormPlato, setMostrarFormPlato] = useState<string | null>(null)
  const [nuevoPlato, setNuevoPlato] = useState<{
    nombre: string;
    precio: string;
    descripcion: string;
    hasVariantes: boolean;
    variantes: { nombre: string; precio: string }[];
  }>({
    nombre: '',
    precio: '',
    descripcion: '',
    hasVariantes: false,
    variantes: [],
  })
  const [intentoPlato, setIntentoPlato] = useState(false)
  const [touchedPlato, setTouchedPlato] = useState<Record<string, boolean>>({})
  const [guardandoPlato, setGuardandoPlato] = useState(false)
  const [guardadoPlato, setGuardadoPlato] = useState(false)
  const [menuCategoria, setMenuCategoria] = useState<string | null>(null)
  const [editandoCategoria, setEditandoCategoria] = useState<string | null>(null)
  const [nombreEditCategoria, setNombreEditCategoria] = useState('')
  const [intentoRename, setIntentoRename] = useState(false)
  const [touchedRename, setTouchedRename] = useState<Record<string, boolean>>({})
  const [guardandoRename, setGuardandoRename] = useState(false)
  const [guardadoRename, setGuardadoRename] = useState(false)
  const [platoExpandido, setPlatoExpandido] = useState<string | null>(null)
  const [editPlato, setEditPlato] = useState<{
    nombre: string;
    precio: string;
    descripcion: string;
    hasVariantes: boolean;
    variantes: { id?: string; nombre: string; precio: string }[];
  }>({
    nombre: '',
    precio: '',
    descripcion: '',
    hasVariantes: false,
    variantes: [],
  })
  const [originalVariantes, setOriginalVariantes] = useState<{
    id: string;
    nombre: string;
    precio: number;
    orden: number;
  }[]>([])
  const [cascadeWarning, setCascadeWarning] = useState<{
    rowsToDelete: { id: string; nombre: string }[];
    combosCount: number;
    destacadosCount: number;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null)
  const [intentoEditPlato, setIntentoEditPlato] = useState(false)
  const [touchedEditPlato, setTouchedEditPlato] = useState<Record<string, boolean>>({})
  const [guardandoEditPlato, setGuardandoEditPlato] = useState(false)
  const [guardadoEditPlato, setGuardadoEditPlato] = useState(false)
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
    nombre: '', descripcion: '', platoIds: [] as string[], precio: '',
    dias: [] as DiaSemana[], horaInicio: '', horaFin: '',
  })
  const [intentoCombo, setIntentoCombo] = useState(false)
  const [touchedCombo, setTouchedCombo] = useState<Record<string, boolean>>({})
  const [editandoComboId, setEditandoComboId] = useState<string | null>(null)
  const [busquedaPlatosCombo, setBusquedaPlatosCombo] = useState('')
  const [guardandoCombo, setGuardandoCombo] = useState(false)
  const [guardadoCombo, setGuardadoCombo] = useState(false)
  const [nuevaPromo, setNuevaPromo] = useState({ nombre: '', descripcion: '', tipo: '', valor: '', dias: [] as string[], platoIds: [] as string[] })
  const [intentoPromo, setIntentoPromo] = useState(false)
  const [touchedPromo, setTouchedPromo] = useState<Record<string, boolean>>({})
  const [editandoPromoId, setEditandoPromoId] = useState<string | null>(null)
  const [busquedaPlatosPromo, setBusquedaPlatosPromo] = useState('')
  const [guardandoPromo, setGuardandoPromo] = useState(false)
  const [guardadoPromo, setGuardadoPromo] = useState(false)
  const [platoDiaConfig, setPlatoDiaConfig] = useState({ platoId: '', precioEspecial: '', horaInicio: '11:00', horaFin: '15:00' })
  const [guardandoPlatoDia, setGuardandoPlatoDia] = useState(false)
  const [guardadoPlatoDia, setGuardadoPlatoDia] = useState(false)
  const [intentoPlatoDia, setIntentoPlatoDia] = useState(false)
  const [touchedPlatoDia, setTouchedPlatoDia] = useState<Record<string, boolean>>({})
  const [platoDiaActivo, setPlatoDiaActivo] = useState(false)
  const [sorprendemeCatsMenu, setSorprendemeCatsMenu] = useState<string[]>([])
  const [platoGanadorConfig, setPlatoGanadorConfig] = useState({ platoId: '', titulo: 'Recomendado del chef', descripcion: '' })
  const [platoGanadorActivo, setPlatoGanadorActivo] = useState(false)
  const [guardandoGanador, setGuardandoGanador] = useState(false)
  const [guardadoGanador, setGuardadoGanador] = useState(false)
  const [intentoGanador, setIntentoGanador] = useState(false)
  const [touchedGanador, setTouchedGanador] = useState<Record<string, boolean>>({})
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

    // Plato del día
    if (platoDiaActivo && platosIds.includes(platoDiaConfig.platoId)) {
      const platoNombre = cat.platos.find(p => p.id === platoDiaConfig.platoId)?.nombre || 'Plato'
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
  
  function validarPlatoDia(
    state: { platoId: string; precioEspecial: string },
    otherActive?: { activo: boolean; platoId: string }
  ): Record<string, string> {
    const e: Record<string, string> = {}
    if (!state.platoId) e.platoId = 'Selecciona un plato'
    const v = parseInt(state.precioEspecial)
    if (!state.precioEspecial || isNaN(v) || v <= 0) e.precioEspecial = 'El precio especial debe ser mayor a 0'

    if (state.platoId && otherActive?.activo && otherActive.platoId === state.platoId) {
      e.platoId = 'Este plato ya está configurado como plato ganador. Selecciona otro o desactiva el plato ganador primero.'
    }

    return e
  }
  async function guardarPlatoDia() {
    setIntentoPlatoDia(true)
    setTouchedPlatoDia({ platoId: true, precioEspecial: true })
    const errores = validarPlatoDia(platoDiaConfig, {
      activo: platoGanadorActivo,
      platoId: platoGanadorConfig.platoId,
    })
    if (Object.keys(errores).length > 0 || !rest?.id) return
    setGuardandoPlatoDia(true)
    const supabase = createClient()
    const fechaColombia = new Date(new Date().getTime() - 5 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Borrar cualquier plato del día anterior (activo o no) para garantizar
    // exactamente 0 o 1 fila por restaurante — maybeSingle() en el hook
    // lanza error con múltiples filas y SWR devolvería null silenciosamente.
    await supabase.from('plato_del_dia').delete().eq('restaurante_id', rest.id)

    // Insertar nuevo
    await supabase.from('plato_del_dia').insert({
      restaurante_id: rest.id,
      plato_id: platoDiaConfig.platoId,
      precio_especial: parseInt(platoDiaConfig.precioEspecial),
      horario_inicio: platoDiaConfig.horaInicio,
      horario_fin: platoDiaConfig.horaFin,
      activo: true,
      fecha: fechaColombia,
    })

    setPlatoDiaActivo(true)
    await invalidateAll('plato-del-dia')
    setGuardandoPlatoDia(false)
    setGuardadoPlatoDia(true)
    setTimeout(() => setGuardadoPlatoDia(false), 1200)
  }

  function validarPlatoGanador(
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
  async function guardarPlatoGanador() {
    setIntentoGanador(true)
    setTouchedGanador({ platoId: true, titulo: true })
    const errores = validarPlatoGanador(platoGanadorConfig, {
      activo: platoDiaActivo,
      platoId: platoDiaConfig.platoId,
    })
    if (Object.keys(errores).length > 0 || !rest?.id) return
    setGuardandoGanador(true)
    const supabase = createClient()

    // Borrar cualquier plato ganador anterior para garantizar exactamente
    // 0 o 1 fila por restaurante (ver nota en guardarPlatoDia).
    await supabase.from('plato_ganador').delete().eq('restaurante_id', rest.id)

    await supabase.from('plato_ganador').insert({
      restaurante_id: rest.id,
      plato_id: platoGanadorConfig.platoId,
      titulo: platoGanadorConfig.titulo,
      descripcion: platoGanadorConfig.descripcion || null,
      activo: true,
    })

    setPlatoGanadorActivo(true)
    await invalidateAll('plato-ganador')
    setGuardandoGanador(false)
    setGuardadoGanador(true)
    setTimeout(() => setGuardadoGanador(false), 1200)
  }

  async function desactivarPlatoGanador() {
    if (!rest?.id) return
    const supabase = createClient()
    await supabase.from('plato_ganador').delete().eq('restaurante_id', rest.id)
    setPlatoGanadorActivo(false)
    setPlatoGanadorConfig({ platoId: '', titulo: 'Recomendado del chef', descripcion: '' })
    await invalidateAll('plato-ganador')
  }

  async function desactivarPlatoDia() {
    if (!rest?.id) return
    const supabase = createClient()
    await supabase.from('plato_del_dia').delete().eq('restaurante_id', rest.id)
    setPlatoDiaActivo(false)
    setPlatoDiaConfig({ platoId: '', precioEspecial: '', horaInicio: '11:00', horaFin: '15:00' })
    await invalidateAll('plato-del-dia')
  }

  function validarPromo(state: { nombre: string; tipo: string; valor: string; dias: string[]; platoIds: string[] }): Record<string, string> {
    const e: Record<string, string> = {}
    if (!state.nombre.trim()) e.nombre = 'El nombre es obligatorio'
    if (!state.tipo) e.tipo = 'Selecciona el tipo de promoción'
    if (state.dias.length === 0) e.dias = 'Selecciona al menos un día'
    if (state.platoIds.length === 0) e.platos = 'Selecciona al menos un plato'
    if (state.tipo === 'descuento') {
      const v = parseInt(state.valor)
      if (!state.valor || isNaN(v) || v < 1 || v > 100) e.valor = 'Ingresa un porcentaje entre 1 y 100'
    } else if (state.tipo === 'precio_especial') {
      const v = parseInt(state.valor)
      if (!state.valor || isNaN(v) || v <= 0) e.valor = 'El precio especial debe ser mayor a 0'
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
      tipo: nuevaPromo.tipo,
      valor: nuevaPromo.valor ? parseInt(nuevaPromo.valor) : null,
      dias: nuevaPromo.dias,
      activo: false,
    }).select().single()

    if (error || !promoData) { setGuardandoPromo(false); alert('Error al crear promo'); return }

    // Step 2: insert junction rows
    if (nuevaPromo.platoIds.length > 0) {
      const { error: ppError } = await supabase.from('promo_platos').insert(
        nuevaPromo.platoIds.map(platoId => ({ promo_id: promoData.id, plato_id: platoId }))
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
      setNuevaPromo({ nombre: '', descripcion: '', tipo: '', valor: '', dias: [], platoIds: [] })
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
        nuevaPromo.platoIds.map(platoId => ({ promo_id: editandoPromoId, plato_id: platoId }))
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
      setNuevaPromo({ nombre: '', descripcion: '', tipo: '', valor: '', dias: [], platoIds: [] })
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

  const MAX_DESC = 150
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

  function seleccionarFoto(platoId: string, categoriaId: string, file: File) {
    if (file.size > 10 * 1024 * 1024) {
      alert('La imagen es muy grande. Máximo 10MB.')
      return
    }
    const url = URL.createObjectURL(file)
    setCropModal({ imagen: url, platoId, categoriaId })
    setCrop({ x: 0, y: 0 })
    setZoom(1)
  }

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
        return plato?.nombre || 'Plato'
      }) || [],
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
        return plato?.nombre || 'Plato'
      }) || [],
      platosIds: p.promo_platos?.map((pp: any) => pp.plato_id) || [],
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
      const precioStr = `$${p.precio.toLocaleString('es-CO')}`
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
      label: <span>{p.nombre} <span style={{ color: 'var(--text-tertiary)' }}>— ${p.precio.toLocaleString('es-CO')}</span></span>,
      searchText: `${p.nombre} ${p.precio}`.toLowerCase(),
    }))
  }, [todosPlatos])

  // ── Seed MIXED states from SWR ──
  useEffect(() => {
    if (platoDiaSwr !== undefined) {
      if (platoDiaSwr && platoDiaSwr.activo) {
        setPlatoDiaConfig({
          platoId: platoDiaSwr.plato_id || '',
          precioEspecial: platoDiaSwr.precio_especial?.toString() || '',
          horaInicio: platoDiaSwr.horario_inicio || '11:00',
          horaFin: platoDiaSwr.horario_fin || '15:00',
        })
        setPlatoDiaActivo(true)
      } else {
        setPlatoDiaActivo(false)
      }
    }
  }, [platoDiaSwr])

  useEffect(() => {
    if (platoGanadorSwr !== undefined) {
      if (platoGanadorSwr && platoGanadorSwr.activo) {
        setPlatoGanadorConfig({
          platoId: platoGanadorSwr.plato_id || '',
          titulo: platoGanadorSwr.titulo || 'Recomendado del chef',
          descripcion: platoGanadorSwr.descripcion || '',
        })
        setPlatoGanadorActivo(true)
      } else {
        setPlatoGanadorActivo(false)
      }
    }
  }, [platoGanadorSwr])

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
    return nuevoCombo.platoIds.reduce((sum, id) => {
      const plato = todosPlatos.find(p => p.id === id)
      return sum + (plato?.precio || 0)
    }, 0)
  }, [nuevoCombo.platoIds, todosPlatos])
  function validarCombo(state: { nombre: string; precio: string; platoIds: string[] }): Record<string, string> {
    const e: Record<string, string> = {}
    if (!state.nombre.trim()) e.nombre = 'El nombre es obligatorio'
    const precioNum = parseInt(state.precio)
    if (!state.precio || isNaN(precioNum) || precioNum <= 0) e.precio = 'El precio debe ser mayor a 0'
    if (state.platoIds.length < 2) e.platos = 'Selecciona al menos 2 platos'
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
        nuevoCombo.platoIds.map(platoId => ({ combo_id: comboData.id, plato_id: platoId }))
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
      setNuevoCombo({ nombre: '', descripcion: '', platoIds: [], precio: '', dias: [], horaInicio: '', horaFin: '' })
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
        nuevoCombo.platoIds.map(platoId => ({ combo_id: editandoComboId, plato_id: platoId }))
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
      setNuevoCombo({ nombre: '', descripcion: '', platoIds: [], precio: '', dias: [], horaInicio: '', horaFin: '' })
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
  function validarCategoria(nombre: string): Record<string, string> {
    const e: Record<string, string> = {}
    if (!nombre.trim()) e.nombre = 'El nombre es obligatorio'
    return e
  }
  async function agregarCategoria() {
    setIntentoCategoria(true)
    setTouchedCategoria({ nombre: true })
    const errores = validarCategoria(nuevaCategoria)
    if (Object.keys(errores).length > 0 || !rest?.id) return
    setGuardandoCat(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('categorias')
      .insert({ restaurante_id: rest.id, nombre: nuevaCategoria, orden: categorias.length })
      .select()
      .single()

    if (data) {
      await mutateCategoriasYPlatos()
    }
    setGuardandoCat(false)
    setGuardadoCat(true)
    setTimeout(() => {
      setGuardadoCat(false)
      setNuevaCategoria('')
      setIntentoCategoria(false)
      setTouchedCategoria({})
      setMostrarFormCategoria(false)
    }, 1200)
  }
  async function eliminarCategoria(id: string) {
    const supabase = createClient()
    await supabase.from('platos').delete().eq('categoria_id', id)
    await supabase.from('categorias').delete().eq('id', id)
    await mutateCategoriasYPlatos()
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
  function validarPlato(state: {
    nombre: string;
    precio: string;
    hasVariantes?: boolean;
    variantes?: { nombre: string; precio: string }[];
  }): Record<string, string> {
    const e: Record<string, string> = {}
    if (!state.nombre.trim()) e.nombre = 'El nombre es obligatorio'

    if (state.hasVariantes) {
      const variantes = state.variantes || []
      if (variantes.length < 2) {
        e.variantes = 'Necesitas al menos 2 variantes'
      } else {
        variantes.forEach((v, i) => {
          if (!v.nombre.trim()) {
            e[`variante_${i}_nombre`] = 'Nombre obligatorio'
          }
          const p = parseInt(v.precio)
          if (!v.precio || isNaN(p) || p <= 0) {
            e[`variante_${i}_precio`] = 'Precio inválido'
          }
        })
      }
    } else {
      const precioNum = parseInt(state.precio)
      if (!state.precio || isNaN(precioNum) || precioNum <= 0) {
        e.precio = 'El precio debe ser mayor a 0'
      }
    }

    return e
  }
  async function agregarPlato(categoriaId: string) {
    setIntentoPlato(true)
    setTouchedPlato({ nombre: true, precio: true })

    const errores = validarPlato(nuevoPlato)
    if (Object.keys(errores).length > 0 || !rest?.id) return

    setGuardandoPlato(true)
    const supabase = createClient()
    const cat = categorias.find(c => c.id === categoriaId)

    let precioParaInsert: number
    if (nuevoPlato.hasVariantes) {
      const precios = nuevoPlato.variantes.map(v => parseInt(v.precio))
      precioParaInsert = Math.min(...precios)
    } else {
      precioParaInsert = parseInt(nuevoPlato.precio)
    }

    const { data: platoData, error: platoError } = await supabase
      .from('platos')
      .insert({
        restaurante_id: rest.id,
        categoria_id: categoriaId,
        nombre: nuevoPlato.nombre.trim(),
        precio: precioParaInsert,
        descripcion: nuevoPlato.descripcion.trim() || null,
        disponible: !nuevoPlato.hasVariantes,
        orden: cat ? cat.platos.length : 0,
      })
      .select()
      .single()

    if (platoError || !platoData) {
      setGuardandoPlato(false)
      console.error('Error al crear plato:', platoError)
      return
    }

    if (nuevoPlato.hasVariantes && nuevoPlato.variantes.length > 0) {
      const variantesParaInsert = nuevoPlato.variantes.map((v, i) => ({
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
        setGuardandoPlato(false)
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

    setGuardadoPlato(true)
    setGuardandoPlato(false)
    setTimeout(() => {
      setNuevoPlato({
        nombre: '', precio: '', descripcion: '',
        hasVariantes: false, variantes: [],
      })
      setIntentoPlato(false)
      setTouchedPlato({})
      setGuardadoPlato(false)
      setMostrarFormPlato(null)
    }, 1200)
  }
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
    await supabase.from('platos').delete().eq('id', platoId)
    await mutateCategoriasYPlatos()
    if (platoExpandido === platoId) {
      setPlatoExpandido(null)
      setOriginalVariantes([])
    }
  }
  async function guardarEdicionPlato(categoriaId: string, platoId: string) {
    setIntentoEditPlato(true)
    setTouchedEditPlato({ nombre: true, precio: true })

    const errores = validarPlato(editPlato)
    if (Object.keys(errores).length > 0) return

    let precioParaUpdate: number
    if (editPlato.hasVariantes) {
      const precios = editPlato.variantes.map(v => parseInt(v.precio))
      precioParaUpdate = Math.min(...precios)
    } else {
      precioParaUpdate = parseInt(editPlato.precio)
    }

    let rowsToInsert: { id?: string; nombre: string; precio: string; _idx: number }[] = []
    let rowsToUpdate: { id?: string; nombre: string; precio: string; _idx: number }[] = []
    let rowsToDelete: { id: string; nombre: string; precio: number; orden: number }[] = []

    if (editPlato.hasVariantes) {
      const formIds = new Set(
        editPlato.variantes.filter(v => v.id).map(v => v.id!)
      )

      rowsToInsert = editPlato.variantes
        .map((v, idx) => ({ ...v, _idx: idx }))
        .filter(v => !v.id)

      rowsToDelete = originalVariantes.filter(o => !formIds.has(o.id))

      rowsToUpdate = editPlato.variantes
        .map((v, idx) => ({ ...v, _idx: idx }))
        .filter(v => {
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
      const [combos, dia, ganador] = await Promise.all([
        supabase.from('combo_platos').select('*', { count: 'exact', head: true }).in('variante_id', idsToDelete),
        supabase.from('plato_del_dia').select('*', { count: 'exact', head: true }).in('variante_id', idsToDelete),
        supabase.from('plato_ganador').select('*', { count: 'exact', head: true }).in('variante_id', idsToDelete),
      ])
      const combosCount = combos.count || 0
      const destacadosCount = (dia.count || 0) + (ganador.count || 0)
      const refCount = combosCount + destacadosCount
      if (refCount > 0) {
        setCascadeWarning({
          rowsToDelete: rowsToDelete.map(r => ({ id: r.id, nombre: r.nombre })),
          combosCount,
          destacadosCount,
          onConfirm: () => {
            doSavePlatoEdit(platoId, categoriaId, precioParaUpdate, rowsToInsert, rowsToUpdate, rowsToDelete)
          },
          onCancel: () => {},
        })
        return
      }
    }

    await doSavePlatoEdit(platoId, categoriaId, precioParaUpdate, rowsToInsert, rowsToUpdate, rowsToDelete)
  }

  async function doSavePlatoEdit(
    platoId: string,
    categoriaId: string,
    precioParaUpdate: number,
    rowsToInsert: { nombre: string; precio: string; _idx: number }[],
    rowsToUpdate: { id?: string; nombre: string; precio: string; _idx: number }[],
    rowsToDelete: { id: string; nombre: string; precio: number; orden: number }[],
  ) {
    setGuardandoEditPlato(true)
    const supabase = createClient()

    const cat = categorias.find(c => c.id === categoriaId)
    const platoLocal = cat?.platos.find(p => p.id === platoId)
    const originalDisponible = platoLocal?.disponible ?? true

    if (editPlato.hasVariantes) {
      await supabase.from('platos').update({ disponible: false }).eq('id', platoId)
    }

    const { error: platoErr } = await supabase
      .from('platos')
      .update({
        nombre: editPlato.nombre.trim(),
        precio: precioParaUpdate,
        descripcion: editPlato.descripcion.trim() || null,
      })
      .eq('id', platoId)

    if (platoErr) {
      console.error('Error updating plato:', platoErr)
      setGuardandoEditPlato(false)
      if (editPlato.hasVariantes && originalDisponible) {
        await supabase.from('platos').update({ disponible: true }).eq('id', platoId)
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
        plato_id: platoId,
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
      await supabase.from('platos').update({ disponible: true }).eq('id', platoId)
    }

    await mutateCategoriasYPlatos()

    setGuardandoEditPlato(false)
    setGuardadoEditPlato(true)
    setTimeout(() => {
      setGuardadoEditPlato(false)
      setPlatoExpandido(null)
      setIntentoEditPlato(false)
      setTouchedEditPlato({})
      setOriginalVariantes([])
    }, 1200)
  }
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
              <button onClick={() => { setMostrarFormCategoria(true); setIntentoCategoria(false); setTouchedCategoria({}) }}
                className="btn-primary" style={{ padding: '10px 16px', fontSize: '13px' }}>
                + Categoría
              </button>
            </div>

            {/* Form nueva categoría */}
            {mostrarFormCategoria && (() => {
              const errores = validarCategoria(nuevaCategoria)
              const valido = Object.keys(errores).length === 0
              return (
              <div style={{ padding: '0 20px', marginBottom: '14px' }}>
                <div className="card" style={{ padding: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Nueva categoría</div>
                  <input className="input" placeholder="Ej: Postres" value={nuevaCategoria}
                    onChange={(e) => setNuevaCategoria(e.target.value)} autoFocus
                    onBlur={() => setTouchedCategoria(prev => ({ ...prev, nombre: true }))}
                    onKeyDown={(e) => e.key === 'Enter' && agregarCategoria()}
                    style={{
                      marginBottom: intentoCategoria && touchedCategoria.nombre && errores.nombre ? '4px' : '10px',
                      borderColor: intentoCategoria && touchedCategoria.nombre && errores.nombre ? 'var(--color-danger)' : undefined,
                    }} />
                  {intentoCategoria && touchedCategoria.nombre && errores.nombre && (
                    <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '10px' }}>
                      {errores.nombre}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={agregarCategoria} disabled={guardandoCat || guardadoCat} className="btn-primary"
                      style={{
                        flex: 1, padding: '10px', fontSize: '13px',
                        opacity: valido ? 1 : 0.5,
                        cursor: valido ? 'pointer' : 'default',
                        ...(valido ? {} : { transform: 'none', boxShadow: 'none' }),
                      }}>{guardandoCat ? 'Guardando...' : guardadoCat ? '✓ Guardado' : 'Crear'}</button>
                    <button onClick={() => { setMostrarFormCategoria(false); setIntentoCategoria(false); setTouchedCategoria({}); setNuevaCategoria('') }} className="btn-outline" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>Cancelar</button>
                  </div>
                </div>
              </div>
              )
            })()}

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
                      <input className="input" value={nombreEditCategoria} onChange={(e) => setNombreEditCategoria(e.target.value)}
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
                      <span onClick={() => {
                        const opening = mostrarFormPlato !== cat.id
                        setMostrarFormPlato(opening ? cat.id : null)
                        if (opening) {
                          setIntentoPlato(false)
                          setTouchedPlato({})
                          setNuevoPlato({ nombre: '', precio: '', descripcion: '', hasVariantes: false, variantes: [] })
                        }
                      }}
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
                      <div onClick={() => eliminarCategoria(cat.id)}
                        style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--color-danger)', cursor: 'pointer' }}>Eliminar categoría</div>
                    </div>
                  </>
                )}

                {/* Form nuevo plato */}
                {mostrarFormPlato === cat.id && (() => {
                  const errores = validarPlato(nuevoPlato)
                  const valido = Object.keys(errores).length === 0
                  return (
                  <div className="card" style={{ padding: '14px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Nuevo plato en {cat.nombre}</div>
                    <input className="input" placeholder="Nombre del plato" value={nuevoPlato.nombre}
                      onChange={(e) => setNuevoPlato({ ...nuevoPlato, nombre: e.target.value })} autoFocus
                      onBlur={() => setTouchedPlato(prev => ({ ...prev, nombre: true }))}
                      style={{
                        marginBottom: intentoPlato && touchedPlato.nombre && errores.nombre ? '4px' : '8px',
                        borderColor: intentoPlato && touchedPlato.nombre && errores.nombre ? 'var(--color-danger)' : undefined,
                      }} />
                    {intentoPlato && touchedPlato.nombre && errores.nombre && (
                      <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
                        {errores.nombre}
                      </div>
                    )}
                    {!nuevoPlato.hasVariantes && (
                      <>
                        <input className="input" type="number" placeholder="Precio (ej: 18000)" value={nuevoPlato.precio}
                          onChange={(e) => setNuevoPlato({ ...nuevoPlato, precio: e.target.value })}
                          onBlur={() => setTouchedPlato(prev => ({ ...prev, precio: true }))}
                          style={{
                            marginBottom: intentoPlato && touchedPlato.precio && errores.precio ? '4px' : '8px',
                            borderColor: intentoPlato && touchedPlato.precio && errores.precio ? 'var(--color-danger)' : undefined,
                          }} />
                        {intentoPlato && touchedPlato.precio && errores.precio && (
                          <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
                            {errores.precio}
                          </div>
                        )}
                      </>
                    )}
                    <div style={{ position: 'relative', marginBottom: '10px' }}>
                      <input className="input" placeholder="Descripción (opcional)" value={nuevoPlato.descripcion}
                        onChange={(e) => { if (e.target.value.length <= MAX_DESC) setNuevoPlato({ ...nuevoPlato, descripcion: e.target.value }) }}
                        style={{ paddingRight: '50px' }} />
                      <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                        fontSize: '10px', color: nuevoPlato.descripcion.length > MAX_DESC - 20 ? 'var(--color-warning)' : 'var(--text-tertiary)' }}>
                        {nuevoPlato.descripcion.length}/{MAX_DESC}
                      </span>
                    </div>

                    {/* Toggle hasVariantes */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', marginBottom: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                        <input
                          type="checkbox"
                          checked={nuevoPlato.hasVariantes}
                          onChange={(e) => setNuevoPlato({ ...nuevoPlato, hasVariantes: e.target.checked })}
                        />
                        <span>Este plato tiene variantes (ej: tamaños, sabores)</span>
                      </label>
                    </div>

                    {/* Variantes editor — visible only when hasVariantes */}
                    {nuevoPlato.hasVariantes && (
                      <div style={{ marginBottom: '10px', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
                          Variantes
                        </div>

                        {nuevoPlato.variantes.length === 0 && (
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                            Aún no agregaste variantes
                          </div>
                        )}

                        {nuevoPlato.variantes.map((v, i) => (
                          <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'flex-start' }}>
                            <input
                              type="text"
                              placeholder="Ej: Pequeña"
                              value={v.nombre}
                              onChange={(e) => {
                                const nuevas = [...nuevoPlato.variantes]
                                nuevas[i] = { ...nuevas[i], nombre: e.target.value }
                                setNuevoPlato({ ...nuevoPlato, variantes: nuevas })
                              }}
                              style={{
                                flex: 1,
                                padding: '6px 8px',
                                border: `1px solid ${intentoPlato && errores[`variante_${i}_nombre`] ? 'var(--color-danger)' : 'var(--border-light)'}`,
                                borderRadius: '4px',
                                fontSize: '13px',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                              }}
                            />

                            <input
                              type="number"
                              placeholder="$0"
                              value={v.precio}
                              onChange={(e) => {
                                const nuevas = [...nuevoPlato.variantes]
                                nuevas[i] = { ...nuevas[i], precio: e.target.value }
                                setNuevoPlato({ ...nuevoPlato, variantes: nuevas })
                              }}
                              style={{
                                width: '90px',
                                padding: '6px 8px',
                                border: `1px solid ${intentoPlato && errores[`variante_${i}_precio`] ? 'var(--color-danger)' : 'var(--border-light)'}`,
                                borderRadius: '4px',
                                fontSize: '13px',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                              }}
                            />

                            <button
                              type="button"
                              disabled={i === 0}
                              onClick={() => {
                                if (i === 0) return
                                const nuevas = [...nuevoPlato.variantes]
                                ;[nuevas[i - 1], nuevas[i]] = [nuevas[i], nuevas[i - 1]]
                                setNuevoPlato({ ...nuevoPlato, variantes: nuevas })
                              }}
                              style={{
                                padding: '4px 6px',
                                background: 'transparent',
                                border: '1px solid var(--border-light)',
                                borderRadius: '4px',
                                cursor: i === 0 ? 'not-allowed' : 'pointer',
                                opacity: i === 0 ? 0.4 : 1,
                                fontSize: '11px',
                                color: 'var(--text-primary)',
                              }}
                              aria-label="Mover arriba"
                            >
                              ▲
                            </button>

                            <button
                              type="button"
                              disabled={i === nuevoPlato.variantes.length - 1}
                              onClick={() => {
                                if (i === nuevoPlato.variantes.length - 1) return
                                const nuevas = [...nuevoPlato.variantes]
                                ;[nuevas[i], nuevas[i + 1]] = [nuevas[i + 1], nuevas[i]]
                                setNuevoPlato({ ...nuevoPlato, variantes: nuevas })
                              }}
                              style={{
                                padding: '4px 6px',
                                background: 'transparent',
                                border: '1px solid var(--border-light)',
                                borderRadius: '4px',
                                cursor: i === nuevoPlato.variantes.length - 1 ? 'not-allowed' : 'pointer',
                                opacity: i === nuevoPlato.variantes.length - 1 ? 0.4 : 1,
                                fontSize: '11px',
                                color: 'var(--text-primary)',
                              }}
                              aria-label="Mover abajo"
                            >
                              ▼
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setNuevoPlato({
                                  ...nuevoPlato,
                                  variantes: nuevoPlato.variantes.filter((_, idx) => idx !== i),
                                })
                              }}
                              style={{
                                padding: '4px 8px',
                                background: 'transparent',
                                border: '1px solid var(--color-danger)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                color: 'var(--color-danger)',
                                fontSize: '12px',
                              }}
                              aria-label="Eliminar variante"
                            >
                              ✕
                            </button>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => {
                            setNuevoPlato({
                              ...nuevoPlato,
                              variantes: [...nuevoPlato.variantes, { nombre: '', precio: '' }],
                            })
                          }}
                          style={{
                            marginTop: '4px',
                            padding: '6px 12px',
                            background: 'transparent',
                            border: '1px dashed var(--border-light)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: 'var(--text-primary)',
                            width: '100%',
                          }}
                        >
                          + Agregar variante
                        </button>

                        {intentoPlato && errores.variantes && (
                          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--color-danger)' }}>
                            {errores.variantes}
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                      📷 Podrás agregar foto después de crear el plato
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => agregarPlato(cat.id)} disabled={guardandoPlato || guardadoPlato}
                        className="btn-primary"
                        style={{
                          flex: 1, padding: '10px', fontSize: '13px',
                          opacity: valido ? 1 : 0.5,
                          cursor: valido ? 'pointer' : 'default',
                          ...(valido ? {} : { transform: 'none', boxShadow: 'none' }),
                        }}>{guardandoPlato ? 'Guardando...' : guardadoPlato ? '✓ Guardado' : 'Agregar'}</button>
                      <button onClick={() => {
                        setMostrarFormPlato(null)
                        setIntentoPlato(false)
                        setTouchedPlato({})
                        setNuevoPlato({ nombre: '', precio: '', descripcion: '', hasVariantes: false, variantes: [] })
                      }} className="btn-outline" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>Cancelar</button>
                    </div>
                  </div>
                  )
                })()}

                {/* Platos */}
                {cat.platos.map((plato, pIdx) => (
                  <div key={plato.id} className="card" style={{ marginBottom: '8px', opacity: plato.disponible ? 1 : 0.5, overflow: 'hidden' }}>

                    {/* Vista normal del plato */}
                    <div
                      onClick={() => {
                        if (platoExpandido === plato.id) {
                          setPlatoExpandido(null)
                          setIntentoEditPlato(false)
                          setTouchedEditPlato({})
                          setOriginalVariantes([])
                        } else {
                          const variantesSorted = (plato.variantes || []).slice().sort((a, b) => a.orden - b.orden)
                          setPlatoExpandido(plato.id)
                          setEditPlato({
                            nombre: plato.nombre,
                            precio: plato.precio.toString(),
                            descripcion: plato.descripcion || '',
                            hasVariantes: variantesSorted.length > 0,
                            variantes: variantesSorted.map(v => ({
                              id: v.id,
                              nombre: v.nombre,
                              precio: v.precio.toString(),
                            })),
                          })
                          setOriginalVariantes(variantesSorted.map(v => ({
                            id: v.id,
                            nombre: v.nombre,
                            precio: v.precio,
                            orden: v.orden,
                          })))
                          setIntentoEditPlato(false)
                          setTouchedEditPlato({})
                        }
                      }}
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
                            <span onClick={(e) => { e.stopPropagation(); eliminarPlato(cat.id, plato.id) }}
                              style={{ fontSize: '11px', color: 'var(--color-danger)', cursor: 'pointer' }}>✕</span>
                          </div>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {plato.variantes && plato.variantes.length > 0 ? 'desde ' : ''}${plato.precio.toLocaleString('es-CO')}
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
                    {platoExpandido === plato.id && (() => {
                      const errores = validarPlato(editPlato)
                      const valido = Object.keys(errores).length === 0
                      return (
                      <div style={{
                        padding: '0 12px 14px', borderTop: '1px solid var(--border-light)',
                        paddingTop: '14px', animation: 'fadeInUp 0.2s ease',
                      }}>
                        <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '10px' }}>Editar plato</div>
                        <input className="input" placeholder="Nombre" value={editPlato.nombre}
                          onChange={(e) => setEditPlato({ ...editPlato, nombre: e.target.value })}
                          onBlur={() => setTouchedEditPlato(prev => ({ ...prev, nombre: true }))}
                          style={{
                            marginBottom: intentoEditPlato && touchedEditPlato.nombre && errores.nombre ? '4px' : '8px',
                            borderColor: intentoEditPlato && touchedEditPlato.nombre && errores.nombre ? 'var(--color-danger)' : undefined,
                          }} />
                        {intentoEditPlato && touchedEditPlato.nombre && errores.nombre && (
                          <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
                            {errores.nombre}
                          </div>
                        )}
                        {!editPlato.hasVariantes && (
                          <>
                            <input className="input" type="number" placeholder="Precio" value={editPlato.precio}
                              onChange={(e) => setEditPlato({ ...editPlato, precio: e.target.value })}
                              onBlur={() => setTouchedEditPlato(prev => ({ ...prev, precio: true }))}
                              style={{
                                marginBottom: intentoEditPlato && touchedEditPlato.precio && errores.precio ? '4px' : '8px',
                                borderColor: intentoEditPlato && touchedEditPlato.precio && errores.precio ? 'var(--color-danger)' : undefined,
                              }} />
                            {intentoEditPlato && touchedEditPlato.precio && errores.precio && (
                              <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
                                {errores.precio}
                              </div>
                            )}
                          </>
                        )}
                        <div style={{ position: 'relative', marginBottom: '10px' }}>
                          <input className="input" placeholder="Descripción" value={editPlato.descripcion}
                            onChange={(e) => { if (e.target.value.length <= MAX_DESC) setEditPlato({ ...editPlato, descripcion: e.target.value }) }}
                            style={{ paddingRight: '50px' }} />
                          <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                            fontSize: '10px', color: editPlato.descripcion.length > MAX_DESC - 20 ? 'var(--color-warning)' : 'var(--text-tertiary)' }}>
                            {editPlato.descripcion.length}/{MAX_DESC}
                          </span>
                        </div>

                        {/* Toggle hasVariantes */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', marginBottom: '8px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                            <input
                              type="checkbox"
                              checked={editPlato.hasVariantes}
                              onChange={(e) => {
                                const turningOff = !e.target.checked && editPlato.hasVariantes
                                if (turningOff && editPlato.variantes.length > 0) {
                                  const precios = editPlato.variantes
                                    .map(v => parseInt(v.precio))
                                    .filter(p => !isNaN(p))
                                  const minPrecio = precios.length > 0 ? Math.min(...precios).toString() : ''
                                  setEditPlato({
                                    ...editPlato,
                                    hasVariantes: false,
                                    precio: minPrecio,
                                  })
                                } else {
                                  setEditPlato({ ...editPlato, hasVariantes: e.target.checked })
                                }
                              }}
                            />
                            <span>Este plato tiene variantes (ej: tamaños, sabores)</span>
                          </label>
                        </div>

                        {/* Variantes editor — visible only when hasVariantes */}
                        {editPlato.hasVariantes && (
                          <div style={{ marginBottom: '10px', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
                              Variantes
                            </div>

                            {editPlato.variantes.length === 0 && (
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                Aún no agregaste variantes
                              </div>
                            )}

                            {editPlato.variantes.map((v, i) => (
                              <div key={v.id ?? `new-${i}`} style={{ display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'flex-start' }}>
                                <input
                                  type="text"
                                  placeholder="Ej: Pequeña"
                                  value={v.nombre}
                                  onChange={(e) => {
                                    const nuevas = [...editPlato.variantes]
                                    nuevas[i] = { ...nuevas[i], nombre: e.target.value }
                                    setEditPlato({ ...editPlato, variantes: nuevas })
                                  }}
                                  style={{
                                    flex: 1,
                                    padding: '6px 8px',
                                    border: `1px solid ${intentoEditPlato && errores[`variante_${i}_nombre`] ? 'var(--color-danger)' : 'var(--border-light)'}`,
                                    borderRadius: '4px',
                                    fontSize: '13px',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                  }}
                                />

                                <input
                                  type="number"
                                  placeholder="$0"
                                  value={v.precio}
                                  onChange={(e) => {
                                    const nuevas = [...editPlato.variantes]
                                    nuevas[i] = { ...nuevas[i], precio: e.target.value }
                                    setEditPlato({ ...editPlato, variantes: nuevas })
                                  }}
                                  style={{
                                    width: '90px',
                                    padding: '6px 8px',
                                    border: `1px solid ${intentoEditPlato && errores[`variante_${i}_precio`] ? 'var(--color-danger)' : 'var(--border-light)'}`,
                                    borderRadius: '4px',
                                    fontSize: '13px',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                  }}
                                />

                                <button
                                  type="button"
                                  disabled={i === 0}
                                  onClick={() => {
                                    if (i === 0) return
                                    const nuevas = [...editPlato.variantes]
                                    ;[nuevas[i - 1], nuevas[i]] = [nuevas[i], nuevas[i - 1]]
                                    setEditPlato({ ...editPlato, variantes: nuevas })
                                  }}
                                  style={{
                                    padding: '4px 6px',
                                    background: 'transparent',
                                    border: '1px solid var(--border-light)',
                                    borderRadius: '4px',
                                    cursor: i === 0 ? 'not-allowed' : 'pointer',
                                    opacity: i === 0 ? 0.4 : 1,
                                    fontSize: '11px',
                                    color: 'var(--text-primary)',
                                  }}
                                  aria-label="Mover arriba"
                                >
                                  ▲
                                </button>

                                <button
                                  type="button"
                                  disabled={i === editPlato.variantes.length - 1}
                                  onClick={() => {
                                    if (i === editPlato.variantes.length - 1) return
                                    const nuevas = [...editPlato.variantes]
                                    ;[nuevas[i], nuevas[i + 1]] = [nuevas[i + 1], nuevas[i]]
                                    setEditPlato({ ...editPlato, variantes: nuevas })
                                  }}
                                  style={{
                                    padding: '4px 6px',
                                    background: 'transparent',
                                    border: '1px solid var(--border-light)',
                                    borderRadius: '4px',
                                    cursor: i === editPlato.variantes.length - 1 ? 'not-allowed' : 'pointer',
                                    opacity: i === editPlato.variantes.length - 1 ? 0.4 : 1,
                                    fontSize: '11px',
                                    color: 'var(--text-primary)',
                                  }}
                                  aria-label="Mover abajo"
                                >
                                  ▼
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditPlato({
                                      ...editPlato,
                                      variantes: editPlato.variantes.filter((_, idx) => idx !== i),
                                    })
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    background: 'transparent',
                                    border: '1px solid var(--color-danger)',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    color: 'var(--color-danger)',
                                    fontSize: '12px',
                                  }}
                                  aria-label="Eliminar variante"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}

                            <button
                              type="button"
                              onClick={() => {
                                setEditPlato({
                                  ...editPlato,
                                  variantes: [...editPlato.variantes, { nombre: '', precio: '' }],
                                })
                              }}
                              style={{
                                marginTop: '4px',
                                padding: '6px 12px',
                                background: 'transparent',
                                border: '1px dashed var(--border-light)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                color: 'var(--text-primary)',
                                width: '100%',
                              }}
                            >
                              + Agregar variante
                            </button>

                            {intentoEditPlato && errores.variantes && (
                              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--color-danger)' }}>
                                {errores.variantes}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Foto */}
                        {esBasico && <div style={{ marginBottom: '10px' }}>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Foto del plato</div>
                          {plato.foto_url && (
                            <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: '8px', overflow: 'hidden', marginBottom: '8px' }}>
                              <img src={plato.foto_url} alt={plato.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                          )}
                          <label style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '8px 14px', borderRadius: '8px', fontSize: '12px',
                            border: '1px solid var(--border-light)', cursor: subiendoFoto ? 'not-allowed' : 'pointer',
                            color: subiendoFoto ? 'var(--text-tertiary)' : 'var(--color-info)',
                            opacity: subiendoFoto ? 0.6 : 1,
                          }}>
                            {subiendoFoto ? 'Subiendo...' : plato.foto_url ? 'Cambiar foto' : '📷 Subir foto'}
                            <input type="file" accept="image/*" style={{ display: 'none' }}
                              disabled={subiendoFoto}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) seleccionarFoto(plato.id, cat.id, file)
                              }} />
                          </label>
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}>JPG o PNG · Máximo 10MB · Se redimensiona a 800px</div>
                        </div>}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => guardarEdicionPlato(cat.id, plato.id)}
                            disabled={guardandoEditPlato || guardadoEditPlato}
                            className="btn-primary"
                            style={{
                              flex: 1, padding: '10px', fontSize: '13px',
                              opacity: valido ? 1 : 0.5,
                              cursor: valido ? 'pointer' : 'default',
                              ...(valido ? {} : { transform: 'none', boxShadow: 'none' }),
                            }}>{guardandoEditPlato ? 'Guardando...' : guardadoEditPlato ? '✓ Guardado' : 'Guardar'}</button>
                          <button onClick={() => {
                            setPlatoExpandido(null)
                            setIntentoEditPlato(false)
                            setTouchedEditPlato({})
                            setOriginalVariantes([])
                          }} className="btn-outline" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>Cancelar</button>
                        </div>
                      </div>
                      )
                    })()}
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
                    <button onClick={() => { setEditandoComboId(null); setNuevoCombo({ nombre: '', descripcion: '', platoIds: [], precio: '', dias: [], horaInicio: '', horaFin: '' }); setBusquedaPlatosCombo(''); setMostrarFormCombo(true); setIntentoCombo(false); setTouchedCombo({}) }} className="btn-primary" style={{ padding: '10px 20px', fontSize: '13px' }}>+ Crear combo</button>
                  </div>
                ) : (
                  <>
                    {!mostrarFormCombo && (
                      <button onClick={() => { setEditandoComboId(null); setNuevoCombo({ nombre: '', descripcion: '', platoIds: [], precio: '', dias: [], horaInicio: '', horaFin: '' }); setBusquedaPlatosCombo(''); setMostrarFormCombo(true); setIntentoCombo(false); setTouchedCombo({}) }} className="btn-primary" style={{ padding: '8px 14px', fontSize: '13px', marginBottom: '14px' }}>+ Crear combo</button>
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
                    <input className="input" placeholder="Nombre del combo (ej: Combo paisa)" value={nuevoCombo.nombre}
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
                      onChange={(e) => setNuevoCombo({ ...nuevoCombo, descripcion: e.target.value })} style={{ marginBottom: '8px' }} />
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
                      {platosFiltradosCombo.map(p => (
                        <div key={p.id} onClick={() => {
                          const sel = nuevoCombo.platoIds.includes(p.id)
                            ? nuevoCombo.platoIds.filter(id => id !== p.id)
                            : [...nuevoCombo.platoIds, p.id]
                          setNuevoCombo({ ...nuevoCombo, platoIds: sel })
                          setTouchedCombo(prev => ({ ...prev, platos: true }))
                        }} style={{
                          padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          borderBottom: '1px solid var(--border-light)', cursor: 'pointer',
                          background: nuevoCombo.platoIds.includes(p.id) ? 'var(--color-info-light)' : 'transparent',
                        }}>
                          <div>
                          <span style={{ fontSize: '12px' }}>{p.nombre}</span>
                          {(() => { const h = getHorarioPlato(p.id); return h ? <span style={{ fontSize: '9px', color: 'var(--color-warning)', marginLeft: '4px' }}>⏰ {formato12h(h.hora_inicio)}–{formato12h(h.hora_fin)}</span> : null })()}
                        </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>${p.precio.toLocaleString('es-CO')}</span>
                            {nuevoCombo.platoIds.includes(p.id) && <span style={{ color: 'var(--color-info)', fontSize: '12px' }}>✓</span>}
                          </div>
                        </div>
                      ))}
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
                        Ahorro: ${(precioIndividualCombo - parseInt(nuevoCombo.precio || '0')).toLocaleString('es-CO')} ({Math.round(((precioIndividualCombo - parseInt(nuevoCombo.precio || '0')) / precioIndividualCombo) * 100)}% descuento)
                      </div>
                    )}
                    {nuevoCombo.platoIds.length > 0 && (() => {
                      const platosConHorario = nuevoCombo.platoIds.map(id => ({ id, horario: getHorarioPlato(id) })).filter(p => p.horario)
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
                      <button onClick={() => { setMostrarFormCombo(false); setIntentoCombo(false); setTouchedCombo({}); setNuevoCombo({ nombre: '', descripcion: '', platoIds: [], precio: '', dias: [], horaInicio: '', horaFin: '' }); setBusquedaPlatosCombo(''); setEditandoComboId(null) }} className="btn-outline" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>Cancelar</button>
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
                          <span style={{ fontSize: '14px', fontWeight: 500 }}>${combo.precio.toLocaleString('es-CO')}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', textDecoration: 'line-through' }}>${combo.precioIndividual.toLocaleString('es-CO')}</span>
                          <span className="badge badge-success">Ahorras ${(combo.precioIndividual - combo.precio).toLocaleString('es-CO')}</span>
                        </div>
                        {((combo.dias && combo.dias.length > 0) || (combo.horario_inicio && combo.horario_fin)) && (
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                            {combo.dias && combo.dias.length > 0 && (
                              <span>{formatDiasShort(combo.dias)}</span>
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
                            platoIds: combo.platosIds || [],
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
                    <button onClick={() => { setEditandoPromoId(null); setNuevaPromo({ nombre: '', descripcion: '', tipo: '', valor: '', dias: [], platoIds: [] }); setBusquedaPlatosPromo(''); setMostrarFormPromo(true); setIntentoPromo(false); setTouchedPromo({}) }} className="btn-primary" style={{ padding: '10px 20px', fontSize: '13px' }}>+ Crear promo</button>
                  </div>
                ) : (
                  <>
                    {!mostrarFormPromo && (
                      <button onClick={() => { setEditandoPromoId(null); setNuevaPromo({ nombre: '', descripcion: '', tipo: '', valor: '', dias: [], platoIds: [] }); setBusquedaPlatosPromo(''); setMostrarFormPromo(true); setIntentoPromo(false); setTouchedPromo({}) }} className="btn-primary" style={{ padding: '8px 14px', fontSize: '13px', marginBottom: '14px' }}>+ Crear promo</button>
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
                    <input className="input" placeholder="Nombre (ej: Happy Hour)" value={nuevaPromo.nombre}
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
                      onChange={(e) => setNuevaPromo({ ...nuevaPromo, descripcion: e.target.value })} style={{ marginBottom: '8px' }} />

                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Tipo de promo:</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      {[
                        { id: 'dos_por_uno', label: '2x1' },
                        { id: 'descuento', label: '% Descuento' },
                        { id: 'precio_especial', label: 'Precio especial' },
                      ].map(t => (
                        <div key={t.id} onClick={() => {
                          setNuevaPromo({ ...nuevaPromo, tipo: t.id, valor: '' })
                          setTouchedPromo(prev => ({ ...prev, tipo: true, valor: false }))
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
                    {nuevaPromo.tipo === 'precio_especial' && (
                      <input className="input" type="number" placeholder="Precio especial" value={nuevaPromo.valor}
                        onChange={(e) => setNuevaPromo({ ...nuevaPromo, valor: e.target.value })}
                        onBlur={() => setTouchedPromo(prev => ({ ...prev, valor: true }))}
                        style={{
                          marginBottom: intentoPromo && touchedPromo.valor && errores.valor ? '4px' : '8px',
                          borderColor: intentoPromo && touchedPromo.valor && errores.valor ? 'var(--color-danger)' : undefined,
                        }} />
                    )}
                    {intentoPromo && touchedPromo.valor && errores.valor && (nuevaPromo.tipo === 'descuento' || nuevaPromo.tipo === 'precio_especial') && (
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
                      {platosFiltradosPromo.map(p => (
                        <div key={p.id} onClick={() => {
                          const sel = nuevaPromo.platoIds.includes(p.id)
                            ? nuevaPromo.platoIds.filter(id => id !== p.id)
                            : [...nuevaPromo.platoIds, p.id]
                          setNuevaPromo({ ...nuevaPromo, platoIds: sel })
                          setTouchedPromo(prev => ({ ...prev, platos: true }))
                        }} style={{
                          padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          borderBottom: '1px solid var(--border-light)', cursor: 'pointer',
                          background: nuevaPromo.platoIds.includes(p.id) ? 'var(--color-info-light)' : 'transparent',
                        }}>
                          <div>
                          <span style={{ fontSize: '12px' }}>{p.nombre}</span>
                          {(() => { const h = getHorarioPlato(p.id); return h ? <span style={{ fontSize: '9px', color: 'var(--color-warning)', marginLeft: '4px' }}>⏰ {formato12h(h.hora_inicio)}–{formato12h(h.hora_fin)}</span> : null })()}
                        </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>${p.precio.toLocaleString('es-CO')}</span>
                            {nuevaPromo.platoIds.includes(p.id) && <span style={{ color: 'var(--color-info)', fontSize: '12px' }}>✓</span>}
                          </div>
                        </div>
                      ))}
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
                        .map(id => todosPlatos.find(p => p.id === id))
                        .filter(Boolean) as typeof todosPlatos

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
                            platosSeleccionados.map(plato => {
                              const original = plato.precio
                              let final = 0
                              let detalle = ''

                              if (nuevaPromo.tipo === 'descuento') {
                                const valorNum = parseInt(nuevaPromo.valor)
                                final = Math.round(original * (1 - valorNum / 100))
                                detalle = `-${valorNum}%`
                              } else if (nuevaPromo.tipo === 'precio_especial') {
                                final = parseInt(nuevaPromo.valor)
                                const ahorro = original - final
                                detalle = ahorro > 0
                                  ? `ahorro $${ahorro.toLocaleString('es-CO')}`
                                  : ahorro < 0
                                    ? `+$${Math.abs(ahorro).toLocaleString('es-CO')}`
                                    : 'sin cambio'
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
                                    {plato.nombre}:
                                  </span>
                                  <span style={{ flexShrink: 0 }}>
                                    <span style={{ textDecoration: 'line-through', color: 'var(--text-tertiary)', fontSize: '11px' }}>
                                      ${original.toLocaleString('es-CO')}
                                    </span>
                                    {' → '}
                                    <span style={{ fontWeight: 500 }}>
                                      ${final.toLocaleString('es-CO')}
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
                      const platosConHorario = nuevaPromo.platoIds.map(id => ({ id, horario: getHorarioPlato(id) })).filter(p => p.horario)
                      if (platosConHorario.length === 0) return null
                      const horarios = platosConHorario.map(p => `${p.horario!.hora_inicio}–${p.horario!.hora_fin}`)
                      return (
                        <div style={{ fontSize: '11px', color: 'var(--color-warning)', background: 'var(--color-warning-light)', padding: '8px 10px', borderRadius: '6px', marginBottom: '8px' }}>
                          ⚠ Esta promo incluye platos con horario restringido ({horarios.join(', ')}). La promo solo será visible cuando todos los platos estén activos.
                        </div>
                      )
                    })()}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={editandoPromoId ? actualizarPromo : agregarPromo} disabled={guardandoPromo || guardadoPromo} className="btn-primary"
                        style={{
                          flex: 1, padding: '10px', fontSize: '13px',
                          opacity: valido ? 1 : 0.5,
                          cursor: valido ? 'pointer' : 'default',
                          ...(valido ? {} : { transform: 'none', boxShadow: 'none' }),
                        }}>{guardandoPromo ? 'Guardando...' : guardadoPromo ? '✓ Guardado' : editandoPromoId ? 'Guardar cambios' : 'Crear'}</button>
                      <button onClick={() => { setMostrarFormPromo(false); setIntentoPromo(false); setTouchedPromo({}); setNuevaPromo({ nombre: '', descripcion: '', tipo: '', valor: '', dias: [], platoIds: [] }); setBusquedaPlatosPromo(''); setEditandoPromoId(null) }} className="btn-outline" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>Cancelar</button>
                    </div>
                  </div>
                  )
                })()}

                {promos.map((promo: any) => (
                  <div key={promo.id} className="card" style={{ padding: '14px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 500 }}>{promo.nombre}</div>
                        {promo.descripcion && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{promo.descripcion}</div>}
                        {promo.platos && promo.platos.length > 0 && (
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>Aplica en: {promo.platos.join(', ')}</div>
                        )}
                        <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                          <span className="badge badge-warning">{promo.tipo === 'dos_por_uno' ? '2x1' : promo.tipo === 'descuento' ? `${promo.valor}% off` : `$${parseInt(promo.valor || '0').toLocaleString('es-CO')}`}</span>
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
                          const platoIds = promo.platosIds || []
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
            {subTab === 'plato-dia' && (() => {
              const errores = validarPlatoDia(platoDiaConfig, {
                activo: platoGanadorActivo,
                platoId: platoGanadorConfig.platoId,
              })
              const valido = Object.keys(errores).length === 0
              return (
              <div style={{ padding: '14px 20px' }}>
                <div className="card" style={{ padding: '14px', marginBottom: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Configurar plato del día</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Selecciona un plato:</div>
                  {(() => {
                    const platoDiaErrorVisible = !!(
                      (intentoPlatoDia && touchedPlatoDia.platoId && errores.platoId) ||
                      (platoDiaConfig.platoId && platoGanadorActivo && platoGanadorConfig.platoId === platoDiaConfig.platoId)
                    )
                    return (
                      <>
                        <div style={{ marginBottom: platoDiaErrorVisible ? '4px' : '8px' }}>
                          <Select
                            className="input"
                            value={platoDiaConfig.platoId}
                            onChange={(v) => {
                              setPlatoDiaConfig({ ...platoDiaConfig, platoId: v })
                              setTouchedPlatoDia(prev => ({ ...prev, platoId: true }))
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
                  {platoDiaConfig.platoId && (() => {
                    const h = getHorarioPlato(platoDiaConfig.platoId)
                    if (!h) return null
                    return (
                      <div style={{ fontSize: '11px', color: 'var(--color-warning)', background: 'var(--color-warning-light)', padding: '8px 10px', borderRadius: '6px', marginBottom: '8px' }}>
                        ⚠ Este plato pertenece a una categoría visible solo de {formato12h(h.hora_inicio)} a {formato12h(h.hora_fin)}. El plato del día solo se mostrará en ese horario.
                      </div>
                    )
                  })()}
                  <input className="input" type="number" placeholder="Precio especial" value={platoDiaConfig.precioEspecial}
                    onChange={(e) => setPlatoDiaConfig({ ...platoDiaConfig, precioEspecial: e.target.value })}
                    onBlur={() => setTouchedPlatoDia(prev => ({ ...prev, precioEspecial: true }))}
                    style={{
                      marginBottom: intentoPlatoDia && touchedPlatoDia.precioEspecial && errores.precioEspecial ? '4px' : '8px',
                      borderColor: intentoPlatoDia && touchedPlatoDia.precioEspecial && errores.precioEspecial ? 'var(--color-danger)' : undefined,
                    }} />
                  {intentoPlatoDia && touchedPlatoDia.precioEspecial && errores.precioEspecial && (
                    <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>
                      {errores.precioEspecial}
                    </div>
                  )}
                  {(() => {
                    const platoSeleccionado = categorias
                      .flatMap(c => c.platos)
                      .find(p => p.id === platoDiaConfig.platoId)

                    if (!platoSeleccionado) return null

                    const precioEspNum = parseInt(platoDiaConfig.precioEspecial || '0')
                    if (precioEspNum <= 0) return null

                    if (precioEspNum >= platoSeleccionado.precio) {
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
                          ⚠️ El precio especial es igual o mayor al precio original (${platoSeleccionado.precio.toLocaleString('es-CO')}). ¿Es correcto?
                        </div>
                      )
                    }
                    return null
                  })()}
                  <div style={{ marginBottom: '12px' }}>
                    <label className="label">Horario del plato del día</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                      <TimePicker
                        value={platoDiaConfig.horaInicio}
                        onChange={(v) => setPlatoDiaConfig({ ...platoDiaConfig, horaInicio: v })}
                      />
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>—</span>
                      <TimePicker
                        value={platoDiaConfig.horaFin}
                        onChange={(v) => setPlatoDiaConfig({ ...platoDiaConfig, horaFin: v })}
                      />
                    </div>
                    <TimeRangeHelper
                      start={platoDiaConfig.horaInicio}
                      end={platoDiaConfig.horaFin}
                      verb="Disponible"
                    />
                  </div>

                  {platoDiaConfig.platoId && platoDiaConfig.precioEspecial && (
                    <div style={{
                      background: 'var(--color-accent-light)', borderRadius: '8px', padding: '12px', marginBottom: '10px',
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-accent)', marginBottom: '4px' }}>Vista previa</div>
                      <div style={{ fontSize: '14px', fontWeight: 500 }}>
                        {todosPlatos.find(p => p.id === platoDiaConfig.platoId)?.nombre}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'line-through' }}>
                          ${todosPlatos.find(p => p.id === platoDiaConfig.platoId)?.precio.toLocaleString('es-CO')}
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-accent)' }}>
                          ${parseInt(platoDiaConfig.precioEspecial).toLocaleString('es-CO')}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {formato12h(platoDiaConfig.horaInicio)} — {formato12h(platoDiaConfig.horaFin)}
                      </div>
                    </div>
                  )}

                  <button onClick={guardarPlatoDia} disabled={guardandoPlatoDia || guardadoPlatoDia} className="btn-primary"
                    style={{
                      width: '100%', padding: '12px', fontSize: '13px',
                      opacity: valido ? 1 : 0.5,
                      cursor: valido ? 'pointer' : 'default',
                      ...(valido ? {} : { transform: 'none', boxShadow: 'none' }),
                    }}>
                    {guardandoPlatoDia ? 'Guardando...' : guardadoPlatoDia ? '✓ Guardado' : platoDiaActivo ? 'Actualizar plato del día' : 'Guardar plato del día'}
                  </button>
                  {platoDiaActivo && (
                    <button onClick={desactivarPlatoDia} className="btn-outline" style={{ width: '100%', padding: '12px', fontSize: '13px', marginTop: '8px', color: 'var(--color-danger)' }}>
                      Desactivar plato del día
                    </button>
                  )}
                </div>
              </div>
              )
            })()}

            {/* === PLATO GANADOR === */}
            {subTab === 'plato-ganador' && (() => {
              const errores = validarPlatoGanador(platoGanadorConfig, {
                activo: platoDiaActivo,
                platoId: platoDiaConfig.platoId,
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
                (intentoGanador && touchedGanador.platoId && errores.platoId) ||
                (platoGanadorConfig.platoId && platoDiaActivo && platoDiaConfig.platoId === platoGanadorConfig.platoId)
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
                      value={platoGanadorConfig.titulo}
                      onChange={(v) => {
                        setPlatoGanadorConfig({ ...platoGanadorConfig, titulo: v })
                        setTouchedGanador(prev => ({ ...prev, titulo: true }))
                      }}
                      options={tituloOptions}
                      placeholder="Recomendado del chef"
                    />
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Selecciona el plato:</div>
                  <div style={{ marginBottom: platoGanadorErrorVisible ? '4px' : '10px' }}>
                    <Select
                      className="input"
                      value={platoGanadorConfig.platoId}
                      onChange={(v) => {
                        setPlatoGanadorConfig({ ...platoGanadorConfig, platoId: v })
                        setTouchedGanador(prev => ({ ...prev, platoId: true }))
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
                  {platoGanadorConfig.platoId && (() => {
                    const h = getHorarioPlato(platoGanadorConfig.platoId)
                    if (!h) return null
                    return (
                      <div style={{ fontSize: '11px', color: 'var(--color-warning)', background: 'var(--color-warning-light)', padding: '8px 10px', borderRadius: '6px', marginBottom: '10px' }}>
                        ⚠ Este plato pertenece a una categoría visible solo de {formato12h(h.hora_inicio)} a {formato12h(h.hora_fin)}. El plato ganador solo se mostrará en ese horario.
                      </div>
                    )
                  })()}

                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Descripción especial (opcional):</div>
                  <div style={{ position: 'relative', marginBottom: '10px' }}>
                    <input className="input" placeholder="Ej: Nuestro plato insignia desde 2020"
                      value={platoGanadorConfig.descripcion}
                      onChange={(e) => { if (e.target.value.length <= 100) setPlatoGanadorConfig({ ...platoGanadorConfig, descripcion: e.target.value }) }}
                      style={{ paddingRight: '50px' }} />
                    <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: platoGanadorConfig.descripcion.length > 80 ? 'var(--color-warning)' : 'var(--text-tertiary)' }}>
                      {platoGanadorConfig.descripcion.length}/100
                    </span>
                  </div>

                  {platoGanadorConfig.platoId && (
                    <div style={{ background: 'var(--color-warning-light)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-warning)', marginBottom: '6px' }}>Vista previa</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '14px' }}>⭐</span>
                        <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-warning)' }}>{platoGanadorConfig.titulo.toUpperCase()}</span>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 500 }}>
                        {todosPlatos.find(p => p.id === platoGanadorConfig.platoId)?.nombre}
                      </div>
                      {platoGanadorConfig.descripcion && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', fontStyle: 'italic' }}>
                          "{platoGanadorConfig.descripcion}"
                        </div>
                      )}
                      <div style={{ fontSize: '13px', fontWeight: 500, marginTop: '4px' }}>
                        ${todosPlatos.find(p => p.id === platoGanadorConfig.platoId)?.precio.toLocaleString('es-CO')}
                      </div>
                    </div>
                  )}

                  <button onClick={guardarPlatoGanador} disabled={guardandoGanador || guardadoGanador} className="btn-primary"
                    style={{
                      width: '100%', padding: '12px', fontSize: '13px',
                      opacity: valido ? 1 : 0.5,
                      cursor: valido ? 'pointer' : 'default',
                      ...(valido ? {} : { transform: 'none', boxShadow: 'none' }),
                    }}>
                    {guardandoGanador ? 'Guardando...' : guardadoGanador ? '✓ Guardado' : platoGanadorActivo ? 'Actualizar plato ganador' : 'Guardar plato ganador'}
                  </button>
                  {platoGanadorActivo && (
                    <button onClick={desactivarPlatoGanador} className="btn-outline" style={{ width: '100%', padding: '12px', fontSize: '13px', marginTop: '8px', color: 'var(--color-danger)' }}>
                      Desactivar plato ganador
                    </button>
                  )}
                </div>
              </div>
              )
            })()}

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

            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
              Vinculadas a {cascadeWarning.combosCount} {cascadeWarning.combosCount === 1 ? 'combo' : 'combos'} y{' '}
              {cascadeWarning.destacadosCount} {cascadeWarning.destacadosCount === 1 ? 'destacado' : 'destacados'}.
            </div>

            <div style={{ fontSize: '12px', color: 'var(--color-danger)', marginBottom: '16px' }}>
              Si continuás, esas vinculaciones se eliminarán automáticamente.
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  const cb = cascadeWarning.onConfirm
                  setCascadeWarning(null)
                  cb()
                }}
                className="btn-primary"
                style={{ flex: 1, padding: '10px', fontSize: '13px', background: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
              >
                Sí, continuar
              </button>
              <button
                onClick={() => {
                  const cb = cascadeWarning.onCancel
                  setCascadeWarning(null)
                  cb()
                }}
                className="btn-outline"
                style={{ flex: 1, padding: '10px', fontSize: '13px' }}
              >
                Cancelar
              </button>
            </div>
          </Modal>
        )}

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