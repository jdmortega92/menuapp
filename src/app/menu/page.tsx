'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks'
import { createClient } from '@/lib/supabase-browser'
import Cropper from 'react-easy-crop'
import TimePicker from '@/components/ui/TimePicker'

interface Plato {
  id: string; nombre: string; precio: number; descripcion: string; disponible: boolean; foto_url: string | null
}
interface Categoria {
  id: string; nombre: string; orden: number; platos: Plato[]; hora_inicio?: string | null; hora_fin?: string | null
}

// Helper: formatea "HH:MM" o "HH:MM:SS" a "H:MM a.m./p.m."
function formato12h(hora: string | null | undefined): string {
  if (!hora) return ''
  const partes = hora.split(':')
  const h24 = parseInt(partes[0])
  const mm = (partes[1] || '00').padStart(2, '0')
  if (isNaN(h24)) return hora
  const esPM = h24 >= 12
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  return `${h12}:${mm} ${esPM ? 'p.m.' : 'a.m.'}`
}

export default function MiMenuPage() {
  const router = useRouter()
  const { usuario, restaurante: rest, cargando: cargandoAuth } = useAuth()
  const plan = (rest?.plan || 'gratis') as string
  const esPro = plan === 'pro'
  const esBasico = plan === 'basico' || plan === 'pro'
  const [cargandoMenu, setCargandoMenu] = useState(true)
  const [tabActiva, setTabActiva] = useState<'platos' | 'combos' | 'sorprendeme'>('platos')
  const [busqueda, setBusqueda] = useState('')
  const [mostrarFormCategoria, setMostrarFormCategoria] = useState(false)
  const [nuevaCategoria, setNuevaCategoria] = useState('')
  const [mostrarFormPlato, setMostrarFormPlato] = useState<string | null>(null)
  const [nuevoPlato, setNuevoPlato] = useState({ nombre: '', precio: '', descripcion: '' })
  const [menuCategoria, setMenuCategoria] = useState<string | null>(null)
  const [editandoCategoria, setEditandoCategoria] = useState<string | null>(null)
  const [nombreEditCategoria, setNombreEditCategoria] = useState('')
  const [platoExpandido, setPlatoExpandido] = useState<string | null>(null)
  const [editPlato, setEditPlato] = useState({ nombre: '', precio: '', descripcion: '' })
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
  const [nuevoCombo, setNuevoCombo] = useState({ nombre: '', descripcion: '', platoIds: [] as string[], precio: '' })
  const [nuevaPromo, setNuevaPromo] = useState({ nombre: '', descripcion: '', tipo: '', valor: '', dias: [] as string[], platoIds: [] as string[] })
  const [platoDiaConfig, setPlatoDiaConfig] = useState({ platoId: '', precioEspecial: '', horaInicio: '11:00', horaFin: '15:00' })
  const [guardandoPlatoDia, setGuardandoPlatoDia] = useState(false)
  const [platoDiaActivo, setPlatoDiaActivo] = useState(false)
  const [sorprendemeCatsMenu, setSorprendemeCatsMenu] = useState<string[]>([])
  const [platoGanadorConfig, setPlatoGanadorConfig] = useState({ platoId: '', titulo: 'Recomendado del chef', descripcion: '' })
  const [platoGanadorActivo, setPlatoGanadorActivo] = useState(false)
  const [guardandoGanador, setGuardandoGanador] = useState(false)
  const [horarioCategoria, setHorarioCategoria] = useState<string | null>(null)
  const [avisoHorario, setAvisoHorario] = useState<string[]>([])
  const [confirmarHorario, setConfirmarHorario] = useState(false)
  const [horarioCatInicio, setHorarioCatInicio] = useState('')
  const [horarioCatFin, setHorarioCatFin] = useState('')

  const [combos, setCombos] = useState<any[]>([])
  const [promos, setPromos] = useState<any[]>([])

  // Helper: obtener horario de la categoría de un plato
  function getHorarioPlato(platoId: string): { hora_inicio: string; hora_fin: string } | null {
    for (const cat of categorias) {
      if (cat.platos.some(p => p.id === platoId)) {
        if (cat.hora_inicio && cat.hora_fin) {
          return { hora_inicio: cat.hora_inicio, hora_fin: cat.hora_fin }
        }
        return null
      }
    }
    return null
  }

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
      const promoPlatos = categorias.flatMap(c => c.platos).filter(p => promo.platos?.includes(p.nombre))
      if (promoPlatos.some(p => platosIds.includes(p.id))) {
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

    // Si tiene horario nuevo, revisar afectados
    if (horarioCatInicio && horarioCatFin && !confirmarHorario) {
      const afectados = detectarAfectados(horarioCategoria)
      if (afectados.length > 0) {
        setAvisoHorario(afectados)
        return
      }
    }

    const supabase = createClient()
    await supabase.from('categorias').update({
      hora_inicio: horarioCatInicio || null,
      hora_fin: horarioCatFin || null,
    }).eq('id', horarioCategoria)
    setCategorias(categorias.map(c => c.id === horarioCategoria ? { ...c, hora_inicio: horarioCatInicio || null, hora_fin: horarioCatFin || null } : c))
    setHorarioCategoria(null)
    setAvisoHorario([])
    setConfirmarHorario(false)
  }
  
  async function actualizarSorprendemeCats(nuevas: string[]) {
    setSorprendemeCatsMenu(nuevas)
    if (!rest?.id) return
    const supabase = createClient()
    await supabase.from('config_restaurante').update({ sorprendeme_categorias: nuevas }).eq('restaurante_id', rest.id)
  }
  
  async function guardarPlatoDia() {
    if (!platoDiaConfig.platoId || !platoDiaConfig.precioEspecial || !rest?.id) return
    setGuardandoPlatoDia(true)
    const supabase = createClient()
    const fechaColombia = new Date(new Date().getTime() - 5 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Desactivar cualquier plato del día anterior
    await supabase.from('plato_del_dia').update({ activo: false }).eq('restaurante_id', rest.id)

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
    setGuardandoPlatoDia(false)
  }

  async function guardarPlatoGanador() {
    if (!platoGanadorConfig.platoId || !platoGanadorConfig.titulo || !rest?.id) return
    setGuardandoGanador(true)
    const supabase = createClient()

    await supabase.from('plato_ganador').update({ activo: false }).eq('restaurante_id', rest.id)

    await supabase.from('plato_ganador').insert({
      restaurante_id: rest.id,
      plato_id: platoGanadorConfig.platoId,
      titulo: platoGanadorConfig.titulo,
      descripcion: platoGanadorConfig.descripcion || null,
      activo: true,
    })

    setPlatoGanadorActivo(true)
    setGuardandoGanador(false)
  }

  async function desactivarPlatoGanador() {
    if (!rest?.id) return
    const supabase = createClient()
    await supabase.from('plato_ganador').update({ activo: false }).eq('restaurante_id', rest.id)
    setPlatoGanadorActivo(false)
    setPlatoGanadorConfig({ platoId: '', titulo: 'Recomendado del chef', descripcion: '' })
  }
  
  async function desactivarPlatoDia() {
    if (!rest?.id) return
    const supabase = createClient()
    await supabase.from('plato_del_dia').update({ activo: false }).eq('restaurante_id', rest.id)
    setPlatoDiaActivo(false)
    setPlatoDiaConfig({ platoId: '', precioEspecial: '', horaInicio: '11:00', horaFin: '15:00' })
  }

  async function agregarPromo() {
    if (!nuevaPromo.nombre || !nuevaPromo.tipo || nuevaPromo.dias.length === 0 || nuevaPromo.platoIds.length === 0 || !rest?.id) return
    const supabase = createClient()

    const { data: promoData, error } = await supabase.from('promos').insert({
      restaurante_id: rest.id,
      nombre: nuevaPromo.nombre,
      tipo: nuevaPromo.tipo,
      valor: nuevaPromo.valor ? parseInt(nuevaPromo.valor) : null,
      dias: nuevaPromo.dias,
      activo: true,
    }).select().single()

    if (error || !promoData) { alert('Error al crear promo'); return }

    // Insertar platos de la promo
    await supabase.from('promo_platos').insert(
      nuevaPromo.platoIds.map(platoId => ({ promo_id: promoData.id, plato_id: platoId }))
    )

    const platosNombres = nuevaPromo.platoIds.map(id => categorias.flatMap(c => c.platos).find(p => p.id === id)?.nombre || '')
    setPromos([...promos, {
      id: promoData.id, nombre: promoData.nombre, tipo: promoData.tipo,
      valor: promoData.valor?.toString() || '', dias: promoData.dias || [], activo: true,
      platos: platosNombres, descripcion: nuevaPromo.descripcion,
    }])
    setNuevaPromo({ nombre: '', descripcion: '', tipo: '', valor: '', dias: [], platoIds: [] })
    setMostrarFormPromo(false)
  }
  async function togglePromo(id: string) {
    const promo = promos.find(p => p.id === id)
    if (!promo) return
    const supabase = createClient()
    await supabase.from('promos').update({ activo: !promo.activo }).eq('id', id)
    setPromos(promos.map(p => p.id === id ? { ...p, activo: !p.activo } : p))
  }
  async function eliminarPromo(id: string) {
    const supabase = createClient()
    await supabase.from('promo_platos').delete().eq('promo_id', id)
    await supabase.from('promos').delete().eq('id', id)
    setPromos(promos.filter(p => p.id !== id))
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

    setCategorias(categorias.map(c => {
      if (c.id === cropModal.categoriaId) {
        return { ...c, platos: c.platos.map(p => p.id === cropModal.platoId ? { ...p, foto_url } : p) }
      }
      return c
    }))
    setSubiendoFoto(false)
  }

  const [categorias, setCategorias] = useState<Categoria[]>([])
  // Cargar categorías y platos de Supabase
  useEffect(() => {
    if (!rest?.id) return

    async function cargar() {
      const supabase = createClient()

      const { data: cats } = await supabase
        .from('categorias')
        .select('*')
        .eq('restaurante_id', rest!.id)
        .order('orden', { ascending: true })

      const { data: platos } = await supabase
        .from('platos')
        .select('*')
        .eq('restaurante_id', rest!.id)
        .order('orden', { ascending: true })

      if (cats) {
        const categoriasConPlatos = cats.map(cat => ({
          id: cat.id,
          nombre: cat.nombre,
          orden: cat.orden,
          hora_inicio: cat.hora_inicio || null,
          hora_fin: cat.hora_fin || null,
          platos: (platos || [])
            .filter(p => p.categoria_id === cat.id)
            .map(p => ({
              id: p.id,
              nombre: p.nombre,
              precio: p.precio,
              descripcion: p.descripcion || '',
              disponible: p.disponible,
              foto_url: p.foto_url,
            })),
        }))
        setCategorias(categoriasConPlatos)
      }
      // Cargar plato del día
      const { data: pdData } = await supabase
        .from('plato_del_dia')
        .select('*')
        .eq('restaurante_id', rest!.id)
        .eq('activo', true)
        .maybeSingle()

      if (pdData) {
        setPlatoDiaConfig({
          platoId: pdData.plato_id || '',
          precioEspecial: pdData.precio_especial?.toString() || '',
          horaInicio: pdData.horario_inicio || '11:00',
          horaFin: pdData.horario_fin || '15:00',
        })
        setPlatoDiaActivo(true)
      }
      // Cargar combos
      const { data: combosData } = await supabase
        .from('combos')
        .select('*, combo_platos(plato_id)')
        .eq('restaurante_id', rest!.id)

      if (combosData) {
        const combosConNombres = combosData.map((c: any) => ({
          id: c.id,
          nombre: c.nombre,
          precio: c.precio,
          precioIndividual: c.precio_individual,
          activo: c.activo,
          platosIds: c.combo_platos?.map((cp: any) => cp.plato_id) || [],
          platos: c.combo_platos?.map((cp: any) => {
            const plato = (platos || []).find((p: any) => p.id === cp.plato_id)
            return plato?.nombre || 'Plato'
          }) || [],
        }))
        setCombos(combosConNombres)
      }
      // Cargar promos
      const { data: promosData } = await supabase
        .from('promos')
        .select('*, promo_platos(plato_id)')
        .eq('restaurante_id', rest!.id)

      if (promosData) {
        setPromos(promosData.map((p: any) => ({
          id: p.id,
          nombre: p.nombre,
          tipo: p.tipo,
          valor: p.valor?.toString() || '',
          dias: p.dias || [],
          activo: p.activo,
          platos: p.promo_platos?.map((pp: any) => {
            const plato = (platos || []).find((pl: any) => pl.id === pp.plato_id)
            return plato?.nombre || 'Plato'
          }) || [],
        })))
      }
    // Cargar config sorpréndeme
      const { data: confData } = await supabase
        .from('config_restaurante')
        .select('sorprendeme_categorias')
        .eq('restaurante_id', rest!.id)
        .maybeSingle()

      if (confData?.sorprendeme_categorias) {
        setSorprendemeCatsMenu(confData.sorprendeme_categorias)
      }
    // Cargar plato ganador
      const { data: pgData } = await supabase
        .from('plato_ganador')
        .select('*')
        .eq('restaurante_id', rest!.id)
        .eq('activo', true)
        .maybeSingle()

      if (pgData) {
        setPlatoGanadorConfig({
          platoId: pgData.plato_id || '',
          titulo: pgData.titulo || 'Recomendado del chef',
          descripcion: pgData.descripcion || '',
        })
        setPlatoGanadorActivo(true)
      }
      setCargandoMenu(false)
    }

    cargar()
  }, [rest?.id])

  // Proteger ruta
  useEffect(() => {
    if (!cargandoAuth && !usuario) {
      router.push('/login')
    }
  }, [cargandoAuth, usuario, router])
  const precioIndividualCombo = nuevoCombo.platoIds.reduce((sum, id) => {
    const plato = categorias.flatMap(c => c.platos).find(p => p.id === id)
    return sum + (plato?.precio || 0)
  }, 0)
  async function agregarCombo() {
    if (!nuevoCombo.nombre || nuevoCombo.platoIds.length < 2 || !nuevoCombo.precio || !rest?.id) return
    const supabase = createClient()

    const { data: comboData, error } = await supabase.from('combos').insert({
      restaurante_id: rest.id,
      nombre: nuevoCombo.nombre,
      descripcion: nuevoCombo.descripcion || null,
      precio: parseInt(nuevoCombo.precio),
      precio_individual: precioIndividualCombo,
      activo: true,
    }).select().single()

    if (error || !comboData) { alert('Error al crear combo'); return }

    // Insertar platos del combo
    await supabase.from('combo_platos').insert(
      nuevoCombo.platoIds.map(platoId => ({ combo_id: comboData.id, plato_id: platoId }))
    )

    const platosNombres = nuevoCombo.platoIds.map(id => categorias.flatMap(c => c.platos).find(p => p.id === id)?.nombre || '')
    setCombos([...combos, {
      id: comboData.id, nombre: comboData.nombre, platos: platosNombres,
      precio: comboData.precio, precioIndividual: comboData.precio_individual, activo: true,
      platosIds: nuevoCombo.platoIds,
    }])
    setNuevoCombo({ nombre: '', descripcion: '', platoIds: [], precio: '' })
    setMostrarFormCombo(false)
  }
  async function toggleCombo(id: string) {
    const combo = combos.find(c => c.id === id)
    if (!combo) return
    const supabase = createClient()
    await supabase.from('combos').update({ activo: !combo.activo }).eq('id', id)
    setCombos(combos.map(c => c.id === id ? { ...c, activo: !c.activo } : c))
  }
  async function eliminarCombo(id: string) {
    const supabase = createClient()
    await supabase.from('combo_platos').delete().eq('combo_id', id)
    await supabase.from('combos').delete().eq('id', id)
    setCombos(combos.filter(c => c.id !== id))
  }

  // ── Categorías ──
  async function agregarCategoria() {
    if (!nuevaCategoria.trim() || !rest?.id) return
    const supabase = createClient()
    const { data, error } = await supabase
      .from('categorias')
      .insert({ restaurante_id: rest.id, nombre: nuevaCategoria, orden: categorias.length })
      .select()
      .single()

    if (data) {
      setCategorias([...categorias, { id: data.id, nombre: data.nombre, orden: data.orden, platos: [] }])
    }
    setNuevaCategoria('')
    setMostrarFormCategoria(false)
  }
  async function eliminarCategoria(id: string) {
    const supabase = createClient()
    await supabase.from('platos').delete().eq('categoria_id', id)
    await supabase.from('categorias').delete().eq('id', id)
    setCategorias(categorias.filter(c => c.id !== id))
    setMenuCategoria(null)
  }
  async function renombrarCategoria(id: string) {
    if (!nombreEditCategoria.trim()) return
    const supabase = createClient()
    await supabase.from('categorias').update({ nombre: nombreEditCategoria }).eq('id', id)
    setCategorias(categorias.map(c => c.id === id ? { ...c, nombre: nombreEditCategoria } : c))
    setEditandoCategoria(null)
    setNombreEditCategoria('')
  }
  function moverCategoria(id: string, direccion: 'arriba' | 'abajo') {
    const idx = categorias.findIndex(c => c.id === id)
    if (direccion === 'arriba' && idx > 0) {
      const nueva = [...categorias]
      ;[nueva[idx - 1], nueva[idx]] = [nueva[idx], nueva[idx - 1]]
      setCategorias(nueva)
    }
    if (direccion === 'abajo' && idx < categorias.length - 1) {
      const nueva = [...categorias]
      ;[nueva[idx], nueva[idx + 1]] = [nueva[idx + 1], nueva[idx]]
      setCategorias(nueva)
    }
  }

  // ── Platos ──
  async function agregarPlato(categoriaId: string) {
    if (!nuevoPlato.nombre.trim() || !nuevoPlato.precio || !rest?.id) return
    const supabase = createClient()
    const cat = categorias.find(c => c.id === categoriaId)
    const { data, error } = await supabase
      .from('platos')
      .insert({
        restaurante_id: rest.id,
        categoria_id: categoriaId,
        nombre: nuevoPlato.nombre,
        precio: parseInt(nuevoPlato.precio),
        descripcion: nuevoPlato.descripcion,
        disponible: true,
        orden: cat ? cat.platos.length : 0,
      })
      .select()
      .single()

    if (data) {
      setCategorias(categorias.map(c => {
        if (c.id === categoriaId) {
          return { ...c, platos: [...c.platos, {
            id: data.id, nombre: data.nombre, precio: data.precio,
            descripcion: data.descripcion || '', disponible: data.disponible, foto_url: data.foto_url,
          }] }
        }
        return c
      }))
    }
    setNuevoPlato({ nombre: '', precio: '', descripcion: '' })
    setMostrarFormPlato(null)
  }
  async function toggleDisponible(categoriaId: string, platoId: string) {
    const cat = categorias.find(c => c.id === categoriaId)
    const plato = cat?.platos.find(p => p.id === platoId)
    if (!plato) return
    const supabase = createClient()
    await supabase.from('platos').update({ disponible: !plato.disponible }).eq('id', platoId)
    setCategorias(categorias.map(c => {
      if (c.id === categoriaId) {
        return { ...c, platos: c.platos.map(p => p.id === platoId ? { ...p, disponible: !p.disponible } : p) }
      }
      return c
    }))
  }
  async function eliminarPlato(categoriaId: string, platoId: string) {
    const supabase = createClient()
    await supabase.from('platos').delete().eq('id', platoId)
    setCategorias(categorias.map(c => {
      if (c.id === categoriaId) {
        return { ...c, platos: c.platos.filter(p => p.id !== platoId) }
      }
      return c
    }))
    if (platoExpandido === platoId) setPlatoExpandido(null)
  }
  async function guardarEdicionPlato(categoriaId: string, platoId: string) {
    if (!editPlato.nombre.trim() || !editPlato.precio) return
    const supabase = createClient()
    await supabase.from('platos').update({
      nombre: editPlato.nombre,
      precio: parseInt(editPlato.precio),
      descripcion: editPlato.descripcion,
    }).eq('id', platoId)
    setCategorias(categorias.map(c => {
      if (c.id === categoriaId) {
        return { ...c, platos: c.platos.map(p => p.id === platoId ? {
          ...p, nombre: editPlato.nombre, precio: parseInt(editPlato.precio), descripcion: editPlato.descripcion,
        } : p) }
      }
      return c
    }))
    setPlatoExpandido(null)
  }
  function moverPlato(categoriaId: string, platoId: string, direccion: 'arriba' | 'abajo') {
    setCategorias(categorias.map(cat => {
      if (cat.id === categoriaId) {
        const idx = cat.platos.findIndex(p => p.id === platoId)
        if (direccion === 'arriba' && idx > 0) {
          const nueva = [...cat.platos]
          ;[nueva[idx - 1], nueva[idx]] = [nueva[idx], nueva[idx - 1]]
          return { ...cat, platos: nueva }
        }
        if (direccion === 'abajo' && idx < cat.platos.length - 1) {
          const nueva = [...cat.platos]
          ;[nueva[idx], nueva[idx + 1]] = [nueva[idx + 1], nueva[idx]]
          return { ...cat, platos: nueva }
        }
      }
      return cat
    }))
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
              <button onClick={() => setMostrarFormCategoria(true)}
                className="btn-primary" style={{ padding: '10px 16px', fontSize: '13px' }}>
                + Categoría
              </button>
            </div>

            {/* Form nueva categoría */}
            {mostrarFormCategoria && (
              <div style={{ padding: '0 20px', marginBottom: '14px' }}>
                <div className="card" style={{ padding: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Nueva categoría</div>
                  <input className="input" placeholder="Ej: Postres" value={nuevaCategoria}
                    onChange={(e) => setNuevaCategoria(e.target.value)} autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && agregarCategoria()} style={{ marginBottom: '10px' }} />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={agregarCategoria} className="btn-primary" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>Crear</button>
                    <button onClick={() => setMostrarFormCategoria(false)} className="btn-outline" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>Cancelar</button>
                  </div>
                </div>
              </div>
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
                {editandoCategoria === cat.id ? (
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    <input className="input" value={nombreEditCategoria} onChange={(e) => setNombreEditCategoria(e.target.value)}
                      autoFocus onKeyDown={(e) => e.key === 'Enter' && renombrarCategoria(cat.id)} style={{ flex: 1 }} />
                    <button onClick={() => renombrarCategoria(cat.id)} className="btn-primary" style={{ padding: '8px 14px', fontSize: '12px' }}>OK</button>
                    <button onClick={() => setEditandoCategoria(null)} className="btn-outline" style={{ padding: '8px 14px', fontSize: '12px' }}>✕</button>
                  </div>
                ) : (
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
                      {(cat as any).hora_inicio && (cat as any).hora_fin && (
                        <span style={{ fontSize: '10px', color: 'var(--color-info)', background: 'var(--color-info-light)', padding: '2px 6px', borderRadius: '4px' }}>
                          {formato12h((cat as any).hora_inicio)}–{formato12h((cat as any).hora_fin)}
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
                      <div onClick={() => { setNombreEditCategoria(cat.nombre); setEditandoCategoria(cat.id); setMenuCategoria(null) }}
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
                {mostrarFormPlato === cat.id && (
                  <div className="card" style={{ padding: '14px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Nuevo plato en {cat.nombre}</div>
                    <input className="input" placeholder="Nombre del plato" value={nuevoPlato.nombre}
                      onChange={(e) => setNuevoPlato({ ...nuevoPlato, nombre: e.target.value })} autoFocus style={{ marginBottom: '8px' }} />
                    <input className="input" type="number" placeholder="Precio (ej: 18000)" value={nuevoPlato.precio}
                      onChange={(e) => setNuevoPlato({ ...nuevoPlato, precio: e.target.value })} style={{ marginBottom: '8px' }} />
                    <div style={{ position: 'relative', marginBottom: '10px' }}>
                      <input className="input" placeholder="Descripción (opcional)" value={nuevoPlato.descripcion}
                        onChange={(e) => { if (e.target.value.length <= MAX_DESC) setNuevoPlato({ ...nuevoPlato, descripcion: e.target.value }) }}
                        style={{ paddingRight: '50px' }} />
                      <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                        fontSize: '10px', color: nuevoPlato.descripcion.length > MAX_DESC - 20 ? 'var(--color-warning)' : 'var(--text-tertiary)' }}>
                        {nuevoPlato.descripcion.length}/{MAX_DESC}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                      📷 Podrás agregar foto después de crear el plato
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => agregarPlato(cat.id)} className="btn-primary" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>Agregar</button>
                      <button onClick={() => setMostrarFormPlato(null)} className="btn-outline" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>Cancelar</button>
                    </div>
                  </div>
                )}

                {/* Platos */}
                {cat.platos.map((plato, pIdx) => (
                  <div key={plato.id} className="card" style={{ marginBottom: '8px', opacity: plato.disponible ? 1 : 0.5, overflow: 'hidden' }}>

                    {/* Vista normal del plato */}
                    <div
                      onClick={() => {
                        if (platoExpandido === plato.id) { setPlatoExpandido(null) }
                        else { setPlatoExpandido(plato.id); setEditPlato({ nombre: plato.nombre, precio: plato.precio.toString(), descripcion: plato.descripcion || '' }) }
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
                          ${plato.precio.toLocaleString('es-CO')}
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
                      <div style={{
                        padding: '0 12px 14px', borderTop: '1px solid var(--border-light)',
                        paddingTop: '14px', animation: 'fadeInUp 0.2s ease',
                      }}>
                        <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '10px' }}>Editar plato</div>
                        <input className="input" placeholder="Nombre" value={editPlato.nombre}
                          onChange={(e) => setEditPlato({ ...editPlato, nombre: e.target.value })} style={{ marginBottom: '8px' }} />
                        <input className="input" type="number" placeholder="Precio" value={editPlato.precio}
                          onChange={(e) => setEditPlato({ ...editPlato, precio: e.target.value })} style={{ marginBottom: '8px' }} />
                        <div style={{ position: 'relative', marginBottom: '10px' }}>
                          <input className="input" placeholder="Descripción" value={editPlato.descripcion}
                            onChange={(e) => { if (e.target.value.length <= MAX_DESC) setEditPlato({ ...editPlato, descripcion: e.target.value }) }}
                            style={{ paddingRight: '50px' }} />
                          <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                            fontSize: '10px', color: editPlato.descripcion.length > MAX_DESC - 20 ? 'var(--color-warning)' : 'var(--text-tertiary)' }}>
                            {editPlato.descripcion.length}/{MAX_DESC}
                          </span>
                        </div>
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
                          <button onClick={() => guardarEdicionPlato(cat.id, plato.id)} className="btn-primary" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>Guardar</button>
                          <button onClick={() => setPlatoExpandido(null)} className="btn-outline" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>Cancelar</button>
                        </div>
                      </div>
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
                {combos.length === 0 && !mostrarFormCombo ? (
                  <div style={{ textAlign: 'center', padding: '30px 0' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🍱</div>
                    <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Sin combos</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Crea paquetes de platos con descuento</div>
                    <button onClick={() => setMostrarFormCombo(true)} className="btn-primary" style={{ padding: '10px 20px', fontSize: '13px' }}>+ Crear combo</button>
                  </div>
                ) : (
                  <>
                    {!mostrarFormCombo && (
                      <button onClick={() => setMostrarFormCombo(true)} className="btn-primary" style={{ padding: '8px 14px', fontSize: '13px', marginBottom: '14px' }}>+ Crear combo</button>
                    )}
                  </>
                )}

                {mostrarFormCombo && (
                  <div className="card" style={{ padding: '14px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Nuevo combo</div>
                    <input className="input" placeholder="Nombre del combo (ej: Combo paisa)" value={nuevoCombo.nombre}
                      onChange={(e) => setNuevoCombo({ ...nuevoCombo, nombre: e.target.value })} style={{ marginBottom: '8px' }} />
                    <input className="input" placeholder="Descripción (opcional)" value={nuevoCombo.descripcion || ''}
                      onChange={(e) => setNuevoCombo({ ...nuevoCombo, descripcion: e.target.value })} style={{ marginBottom: '8px' }} />  
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Selecciona los platos:</div>
                    <div style={{ maxHeight: '160px', overflowY: 'auto', marginBottom: '8px' }}>
                      {categorias.flatMap(c => c.platos).map(p => (
                        <div key={p.id} onClick={() => {
                          const sel = nuevoCombo.platoIds.includes(p.id)
                            ? nuevoCombo.platoIds.filter(id => id !== p.id)
                            : [...nuevoCombo.platoIds, p.id]
                          setNuevoCombo({ ...nuevoCombo, platoIds: sel })
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
                    <input className="input" type="number" placeholder="Precio del combo" value={nuevoCombo.precio}
                      onChange={(e) => setNuevoCombo({ ...nuevoCombo, precio: e.target.value })} style={{ marginBottom: '8px' }} />
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
                      <button onClick={agregarCombo} className="btn-primary" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>Crear</button>
                      <button onClick={() => setMostrarFormCombo(false)} className="btn-outline" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>Cancelar</button>
                    </div>
                  </div>
                )}

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
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div onClick={() => toggleCombo(combo.id)} style={{
                          width: '36px', height: '20px', borderRadius: '10px',
                          background: combo.activo ? 'var(--color-info)' : 'var(--border-light)',
                          position: 'relative', cursor: 'pointer',
                        }}>
                          <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'white', position: 'absolute', top: '2px', left: combo.activo ? '18px' : '2px', transition: 'left 0.2s' }} />
                        </div>
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
                {promos.length === 0 && !mostrarFormPromo ? (
                  <div style={{ textAlign: 'center', padding: '30px 0' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏷️</div>
                    <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Sin promociones</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Crea ofertas para atraer más clientes</div>
                    <button onClick={() => setMostrarFormPromo(true)} className="btn-primary" style={{ padding: '10px 20px', fontSize: '13px' }}>+ Crear promo</button>
                  </div>
                ) : (
                  <>
                    {!mostrarFormPromo && (
                      <button onClick={() => setMostrarFormPromo(true)} className="btn-primary" style={{ padding: '8px 14px', fontSize: '13px', marginBottom: '14px' }}>+ Crear promo</button>
                    )}
                  </>
                )}

                {mostrarFormPromo && (
                  <div className="card" style={{ padding: '14px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Nueva promoción</div>
                    <input className="input" placeholder="Nombre (ej: Happy Hour)" value={nuevaPromo.nombre}
                      onChange={(e) => setNuevaPromo({ ...nuevaPromo, nombre: e.target.value })} style={{ marginBottom: '8px' }} />
                    <input className="input" placeholder="Descripción (ej: Bebidas al 2x1 los viernes)" value={nuevaPromo.descripcion}
                      onChange={(e) => setNuevaPromo({ ...nuevaPromo, descripcion: e.target.value })} style={{ marginBottom: '8px' }} />
                    
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Tipo de promo:</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      {[
                        { id: 'dos_por_uno', label: '2x1' },
                        { id: 'descuento', label: '% Descuento' },
                        { id: 'precio_especial', label: 'Precio especial' },
                      ].map(t => (
                        <div key={t.id} onClick={() => setNuevaPromo({ ...nuevaPromo, tipo: t.id })} style={{
                          padding: '7px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                          background: nuevaPromo.tipo === t.id ? 'var(--text-primary)' : 'var(--bg-secondary)',
                          color: nuevaPromo.tipo === t.id ? 'white' : 'var(--text-secondary)',
                          border: nuevaPromo.tipo === t.id ? 'none' : '1px solid var(--border-light)',
                        }}>{t.label}</div>
                      ))}
                    </div>
                    {nuevaPromo.tipo === 'descuento' && (
                      <input className="input" type="number" placeholder="Porcentaje (ej: 20)" value={nuevaPromo.valor}
                        onChange={(e) => setNuevaPromo({ ...nuevaPromo, valor: e.target.value })} style={{ marginBottom: '8px' }} />
                    )}
                    {nuevaPromo.tipo === 'precio_especial' && (
                      <input className="input" type="number" placeholder="Precio especial" value={nuevaPromo.valor}
                        onChange={(e) => setNuevaPromo({ ...nuevaPromo, valor: e.target.value })} style={{ marginBottom: '8px' }} />
                    )}

                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Platos en esta promo:</div>
                    <div style={{ maxHeight: '160px', overflowY: 'auto', marginBottom: '10px', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                      {categorias.flatMap(c => c.platos).map(p => (
                        <div key={p.id} onClick={() => {
                          const sel = nuevaPromo.platoIds.includes(p.id)
                            ? nuevaPromo.platoIds.filter(id => id !== p.id)
                            : [...nuevaPromo.platoIds, p.id]
                          setNuevaPromo({ ...nuevaPromo, platoIds: sel })
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

                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Días activos:</div>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                      {['L', 'M', 'Mi', 'J', 'V', 'S', 'D'].map((d, i) => {
                        const dias = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
                        const sel = nuevaPromo.dias.includes(dias[i])
                        return (
                          <div key={d} onClick={() => {
                            setNuevaPromo({ ...nuevaPromo, dias: sel ? nuevaPromo.dias.filter(x => x !== dias[i]) : [...nuevaPromo.dias, dias[i]] })
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
                      <button onClick={agregarPromo} className="btn-primary" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>Crear</button>
                      <button onClick={() => setMostrarFormPromo(false)} className="btn-outline" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>Cancelar</button>
                    </div>
                  </div>
                )}

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
                        <span onClick={() => eliminarPromo(promo.id)} style={{ fontSize: '12px', color: 'var(--color-danger)', cursor: 'pointer' }}>✕</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* === PLATO DEL DÍA === */}
            {subTab === 'plato-dia' && (
              <div style={{ padding: '14px 20px' }}>
                <div className="card" style={{ padding: '14px', marginBottom: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Configurar plato del día</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Selecciona un plato:</div>
                  <select className="input" value={platoDiaConfig.platoId}
                    onChange={(e) => setPlatoDiaConfig({ ...platoDiaConfig, platoId: e.target.value })}
                    style={{ appearance: 'none', marginBottom: '8px' }}>
                    <option value="">Seleccionar plato</option>
                    {categorias.flatMap(c => c.platos).map(p => (
                      <option key={p.id} value={p.id}>{p.nombre} — ${p.precio.toLocaleString('es-CO')}{(() => { const h = getHorarioPlato(p.id); return h ? ` (⏰ ${h.hora_inicio}–${h.hora_fin})` : '' })()}</option>
                    ))}
                  </select>
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
                    onChange={(e) => setPlatoDiaConfig({ ...platoDiaConfig, precioEspecial: e.target.value })} style={{ marginBottom: '8px' }} />
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
                  </div>

                  {platoDiaConfig.platoId && platoDiaConfig.precioEspecial && (
                    <div style={{
                      background: 'var(--color-accent-light)', borderRadius: '8px', padding: '12px', marginBottom: '10px',
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-accent)', marginBottom: '4px' }}>Vista previa</div>
                      <div style={{ fontSize: '14px', fontWeight: 500 }}>
                        {categorias.flatMap(c => c.platos).find(p => p.id === platoDiaConfig.platoId)?.nombre}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'line-through' }}>
                          ${categorias.flatMap(c => c.platos).find(p => p.id === platoDiaConfig.platoId)?.precio.toLocaleString('es-CO')}
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

                  <button onClick={guardarPlatoDia} className="btn-primary" style={{ width: '100%', padding: '12px', fontSize: '13px' }}>
                    {guardandoPlatoDia ? 'Guardando...' : platoDiaActivo ? 'Actualizar plato del día' : 'Guardar plato del día'}
                  </button>
                  {platoDiaActivo && (
                    <button onClick={desactivarPlatoDia} className="btn-outline" style={{ width: '100%', padding: '12px', fontSize: '13px', marginTop: '8px', color: 'var(--color-danger)' }}>
                      Desactivar plato del día
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* === PLATO GANADOR === */}
            {subTab === 'plato-ganador' && (
              <div style={{ padding: '14px 20px' }}>
                <div className="card" style={{ padding: '14px', marginBottom: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Plato ganador</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                    Destaca un plato especial de tu restaurante. Aparecerá con un badge dorado en el menú.
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Título del reconocimiento:</div>
                  <select className="input" value={platoGanadorConfig.titulo}
                    onChange={(e) => setPlatoGanadorConfig({ ...platoGanadorConfig, titulo: e.target.value })}
                    style={{ appearance: 'none', marginBottom: '10px' }}>
                    <option value="Recomendado del chef">Recomendado del chef</option>
                    <option value="Favorito de los clientes">Favorito de los clientes</option>
                    <option value="Plato estrella">Plato estrella</option>
                    <option value="Especialidad de la casa">Especialidad de la casa</option>
                    <option value="El más pedido">El más pedido</option>
                  </select>

                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Selecciona el plato:</div>
                  <select className="input" value={platoGanadorConfig.platoId}
                    onChange={(e) => setPlatoGanadorConfig({ ...platoGanadorConfig, platoId: e.target.value })}
                    style={{ appearance: 'none', marginBottom: '10px' }}>
                    <option value="">Seleccionar plato</option>
                    {categorias.flatMap(c => c.platos).map(p => (
                      <option key={p.id} value={p.id}>{p.nombre} — ${p.precio.toLocaleString('es-CO')}</option>
                    ))}
                  </select>
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
                        {categorias.flatMap(c => c.platos).find(p => p.id === platoGanadorConfig.platoId)?.nombre}
                      </div>
                      {platoGanadorConfig.descripcion && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', fontStyle: 'italic' }}>
                          "{platoGanadorConfig.descripcion}"
                        </div>
                      )}
                      <div style={{ fontSize: '13px', fontWeight: 500, marginTop: '4px' }}>
                        ${categorias.flatMap(c => c.platos).find(p => p.id === platoGanadorConfig.platoId)?.precio.toLocaleString('es-CO')}
                      </div>
                    </div>
                  )}

                  <button onClick={guardarPlatoGanador} className="btn-primary" style={{ width: '100%', padding: '12px', fontSize: '13px' }}>
                    {guardandoGanador ? 'Guardando...' : platoGanadorActivo ? 'Actualizar plato ganador' : 'Guardar plato ganador'}
                  </button>
                  {platoGanadorActivo && (
                    <button onClick={desactivarPlatoGanador} className="btn-outline" style={{ width: '100%', padding: '12px', fontSize: '13px', marginTop: '8px', color: 'var(--color-danger)' }}>
                      Desactivar plato ganador
                    </button>
                  )}
                </div>
              </div>
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
            <>
              <div onClick={() => { setHorarioCategoria(null); setAvisoHorario([]); setConfirmarHorario(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60 }} />
              <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 70, maxWidth: '500px', minWidth: '320px', margin: '0 auto', background: 'var(--bg-secondary)', borderRadius: '16px 16px 0 0', padding: '20px', animation: 'slideUp 0.3s ease', maxHeight: '80vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <span style={{ fontSize: '16px', fontWeight: 500 }}>Horario de "{cat?.nombre}"</span>
                  <span onClick={() => { setHorarioCategoria(null); setAvisoHorario([]); setConfirmarHorario(false) }} style={{ fontSize: '18px', color: 'var(--text-tertiary)', cursor: 'pointer' }}>✕</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                  Define en qué horario esta categoría es visible en el menú. Déjalo vacío para que se muestre siempre.
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label className="label">Horario de visibilidad</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                    <TimePicker
                      value={horarioCatInicio}
                      onChange={(v) => { setHorarioCatInicio(v); setAvisoHorario([]); setConfirmarHorario(false) }}
                    />
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>—</span>
                    <TimePicker
                      value={horarioCatFin}
                      onChange={(v) => { setHorarioCatFin(v); setAvisoHorario([]); setConfirmarHorario(false) }}
                    />
                  </div>
                </div>
                {horarioCatInicio && horarioCatFin && avisoHorario.length === 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--color-info)', marginBottom: '14px', background: 'var(--color-info-light)', padding: '10px', borderRadius: '8px' }}>
                    "{cat?.nombre}" será visible de {formato12h(horarioCatInicio)} a {formato12h(horarioCatFin)}
                  </div>
                )}
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
                  {avisoHorario.length > 0 ? (
                    <>
                      <button onClick={() => { setConfirmarHorario(true); setTimeout(() => guardarHorarioCategoria(), 50) }} className="btn-primary" style={{ flex: 1, padding: '12px', fontSize: '13px' }}>
                        Entendido, guardar
                      </button>
                      <button onClick={() => { setAvisoHorario([]); setConfirmarHorario(false) }} className="btn-outline" style={{ flex: 1, padding: '12px', fontSize: '13px' }}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={guardarHorarioCategoria} className="btn-primary" style={{ flex: 1, padding: '12px', fontSize: '13px' }}>Guardar</button>
                      <button onClick={() => {
                        setHorarioCatInicio('')
                        setHorarioCatFin('')
                        setAvisoHorario([])
                      }} className="btn-outline" style={{ padding: '12px 16px', fontSize: '13px' }}>Limpiar</button>
                    </>
                  )}
                </div>
              </div>
            </>
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
        {/* Bottom nav */}
        <div style={{
          display: 'flex', borderTop: '1px solid var(--border-light)',
          background: 'var(--bg-secondary)', position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
          maxWidth: '500px', minWidth: '320px', margin: '0 auto',
        }}>
          {[
            { icon: '◉', label: 'Inicio', href: '/dashboard', active: false },
            { icon: '≡', label: 'Menú', href: '/menu', active: true },
            { icon: '◻', label: 'QR', href: '/qr', active: false },
            { icon: '⊙', label: 'Config', href: '/config', active: false },
          ].map((item, i) => (
            <div key={i} onClick={() => router.push(item.href)} style={{
              flex: 1, padding: '10px', textAlign: 'center', cursor: 'pointer',
              color: item.active ? 'var(--color-info)' : 'var(--text-tertiary)',
              fontWeight: item.active ? 500 : 400,
            }}>
              <div style={{ fontSize: '16px', marginBottom: '2px' }}>{item.icon}</div>
              <div style={{ fontSize: '10px' }}>{item.label}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}