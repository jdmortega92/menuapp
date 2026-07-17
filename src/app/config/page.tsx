'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ChevronDown, Lock, ImagePlus, ArrowRight, Check } from 'lucide-react'
import Icono from '@/components/ui/Icono'
import Boton from '@/components/ui/Boton'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks'
import { useConfigRestaurante } from '@/hooks/data/useConfigRestaurante'
import { useHorarios } from '@/hooks/data/useHorarios'
import { useCategoriasYPlatos } from '@/hooks/data/useCategoriasYPlatos'
import { createClient } from '@/lib/supabase-browser'
import TimePicker from '@/components/ui/TimePicker'
import CropModal from '@/components/ui/CropModal'
import TimeRangeHelper from '@/components/ui/TimeRangeHelper'
import PasswordInput from '@/components/ui/PasswordInput'
import { isPasswordValid, getPasswordError } from '@/lib/passwordValidation'
import PhoneInput from '@/components/ui/PhoneInput'
import BottomNav from '@/components/BottomNav'

// ── Helpers del selector de color (COLOR-PICKER restyle) ──
// Luminancia percibida aproximada (sRGB ponderado) para decidir el color del
// check sobre un swatch: fondo claro -> check oscuro, fondo oscuro -> blanco.
function esColorClaro(hex: string): boolean {
  const h = hex.replace('#', '')
  if (h.length !== 6) return false
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6
}

// Valida #RRGGBB (el # inicial es opcional al teclear) y normaliza a
// '#RRGGBB' mayusculas — el formato que persiste restaurantes.color_principal.
const HEX_6 = /^#?([0-9a-fA-F]{6})$/
function normalizarHex(v: string): string | null {
  const m = v.trim().match(HEX_6)
  return m ? `#${m[1].toUpperCase()}` : null
}

export default function ConfigPage() {
  const router = useRouter()
  const { usuario, restaurante: rest, cargando: cargandoAuth, mutateRestaurante } = useAuth()
  const plan = (rest?.plan || 'gratis') as string
  const esBasico = plan === 'basico' || plan === 'pro'
  const esPro = plan === 'pro'

  const { data: configData, mutate: mutateConfig } = useConfigRestaurante(rest?.id)
  const { data: horariosData, mutate: mutateHorarios } = useHorarios(rest?.id)
  const { data: catsAndPlatosData } = useCategoriasYPlatos(rest?.id)

  const cargandoConfig = !configData || !horariosData || !catsAndPlatosData

  const categoriasDisponibles = useMemo(
    () => catsAndPlatosData?.categorias.map(c => ({ id: c.id, nombre: c.nombre })) ?? [],
    [catsAndPlatosData]
  )

  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('restaurante')
  const [ciudad, setCiudad] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [direccion, setDireccion] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [colorPrincipal, setColorPrincipal] = useState('#E85D24')
  // Borrador del campo hex (COLOR-PICKER restyle): null = espejo de
  // colorPrincipal; string = lo que el usuario esta tecleando. Se propaga a
  // colorPrincipal SOLO cuando valida (#RRGGBB) y se descarta al salir del
  // campo — sin efectos de sincronizacion.
  const [hexDraft, setHexDraft] = useState<string | null>(null)
  // El picker nativo sobrevive OCULTO como fallback ("más colores..."): el
  // camino primario es la paleta curada + el campo hex.
  const inputColorNativoRef = useRef<HTMLInputElement>(null)
  const [tema, setTema] = useState('claro')
  const [toggles, setToggles] = useState({
    whatsapp_activo: true,
    combos_activo: false,
    promos_activo: false,
    plato_dia_activo: false,
    plato_ganador_activo: false,
    calificaciones_activo: true,
    sorprendeme_activo: true,
  })
  const [email, setEmail] = useState('')
  const [horarios, setHorarios] = useState<{ dia: string; hora_apertura: string; hora_cierre: string; cerrado: boolean }[]>([
    { dia: 'Lunes', hora_apertura: '11:00', hora_cierre: '21:00', cerrado: false },
    { dia: 'Martes', hora_apertura: '11:00', hora_cierre: '21:00', cerrado: false },
    { dia: 'Miércoles', hora_apertura: '11:00', hora_cierre: '21:00', cerrado: false },
    { dia: 'Jueves', hora_apertura: '11:00', hora_cierre: '21:00', cerrado: false },
    { dia: 'Viernes', hora_apertura: '11:00', hora_cierre: '21:00', cerrado: false },
    { dia: 'Sábado', hora_apertura: '11:00', hora_cierre: '21:00', cerrado: false },
    { dia: 'Domingo', hora_apertura: '11:00', hora_cierre: '21:00', cerrado: false },
  ])
  const [guardandoHorarios, setGuardandoHorarios] = useState(false)
  const [guardadoHorarios, setGuardadoHorarios] = useState(false)
  const [mostrarConfirmarEliminar, setMostrarConfirmarEliminar] = useState(false)
  const [textoConfirmar, setTextoConfirmar] = useState('')
  const [eliminando, setEliminando] = useState(false)
  const [mostrarCambiarPass, setMostrarCambiarPass] = useState(false)
  const [nuevaPassword, setNuevaPassword] = useState('')
  const [confirmarPassword, setConfirmarPassword] = useState('')
  const [guardandoPass, setGuardandoPass] = useState(false)
  const [passGuardada, setPassGuardada] = useState(false)
  const [sorprendemeCats, setSorprendemeCats] = useState<string[]>([])
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [subiendoImagen, setSubiendoImagen] = useState(false)
  // Puntero del modal de recorte — crop/zoom/croppedAreaPixels viven en
  // components/ui/CropModal (compartido con /menu desde Fase 3).
  const [cropModal, setCropModal] = useState<{ imagen: string; tipo: 'logo' | 'banner' } | null>(null)

  // Seed form state from restaurante row + email from usuario
  useEffect(() => {
    if (!rest || !usuario) return
    setNombre(rest.nombre || '')
    setTipo(rest.tipo || 'restaurante')
    setCiudad(rest.ciudad || '')
    setWhatsapp(rest.whatsapp || '')
    setDireccion(rest.direccion || '')
    setDescripcion(rest.descripcion || '')
    setColorPrincipal(rest.color_principal || '#E85D24')
    setTema(rest.tema || 'claro')
    setEmail(usuario.email || '')
  }, [rest, usuario])

  // Seed form state from config_restaurante
  useEffect(() => {
    if (!configData) return
    setToggles({
      whatsapp_activo: configData.whatsapp_activo ?? true,
      combos_activo: configData.combos_activo ?? false,
      promos_activo: configData.promos_activo ?? false,
      plato_dia_activo: configData.plato_dia_activo ?? false,
      plato_ganador_activo: configData.plato_ganador_activo ?? false,
      calificaciones_activo: configData.calificaciones_activo ?? true,
      sorprendeme_activo: configData.sorprendeme_activo ?? true,
    })
    if (configData.sorprendeme_categorias) setSorprendemeCats(configData.sorprendeme_categorias)
  }, [configData])

  // Seed horarios local state (preserve day-of-week sort)
  useEffect(() => {
    if (!horariosData || horariosData.length === 0) return
    const diasOrden = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
    const horariosOrdenados = diasOrden.map(dia => {
      const h = horariosData.find((x) => x.dia === dia)
      return h ? { dia: h.dia, hora_apertura: h.hora_apertura, hora_cierre: h.hora_cierre, cerrado: h.cerrado }
               : { dia, hora_apertura: '11:00', hora_cierre: '21:00', cerrado: false }
    })
    setHorarios(horariosOrdenados)
  }, [horariosData])

  // Load logo/banner URLs from storage (cache-busted via ?t=Date.now() at page load)
  useEffect(() => {
    if (!rest?.id) return
    const supabase = createClient()
    ;(async () => {
      const { data: logoCheck } = await supabase.storage.from('imagenes').list(`${rest.id}`, { search: 'logo' })
      if (logoCheck && logoCheck.length > 0) {
        const { data: logoData } = supabase.storage.from('imagenes').getPublicUrl(`${rest.id}/logo.jpg`)
        setLogoUrl(logoData.publicUrl + '?t=' + Date.now())
      }
      const { data: bannerCheck } = await supabase.storage.from('imagenes').list(`${rest.id}`, { search: 'banner' })
      if (bannerCheck && bannerCheck.length > 0) {
        const { data: bannerData } = supabase.storage.from('imagenes').getPublicUrl(`${rest.id}/banner.jpg`)
        setBannerUrl(bannerData.publicUrl + '?t=' + Date.now())
      }
    })()
  }, [rest?.id])

  // Proteger ruta
  useEffect(() => {
    if (!cargandoAuth && !usuario) {
      router.push('/login')
    }
  }, [cargandoAuth, usuario, router])

  const [seccionActiva, setSeccionActiva] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  // Paleta curada (esto es DATA de producto, no tokens de UI: unicos hex
  // permitidos fuera de globals.css). 17 colores aptos para restaurante y
  // seguros en contraste sobre fondos claros — sin cian/magenta/lima puros.
  const coloresPreset = [
    { color: '#E85D24', nombre: 'Naranja' },
    { color: '#B85C38', nombre: 'Terracota' },
    { color: '#C0392B', nombre: 'Rojo' },
    { color: '#722F37', nombre: 'Vino' },
    { color: '#E91E63', nombre: 'Rosa' },
    { color: '#D4A017', nombre: 'Dorado' },
    { color: '#A87900', nombre: 'Mostaza' },
    { color: '#7B4B2A', nombre: 'Marrón' },
    { color: '#4E342E', nombre: 'Café' },
    { color: '#1B5E20', nombre: 'Verde' },
    { color: '#5C6B2F', nombre: 'Oliva' },
    { color: '#2D5A3D', nombre: 'Bosque' },
    { color: '#1565C0', nombre: 'Azul' },
    { color: '#1F3A5F', nombre: 'Azul profundo' },
    { color: '#6C63FF', nombre: 'Morado' },
    { color: '#47566A', nombre: 'Pizarra' },
    { color: '#1A1A18', nombre: 'Negro' },
  ]

  const temas = [
    { id: 'claro', nombre: 'Claro', desc: 'Minimalista, versátil', plan: 'gratis' },
    { id: 'oscuro', nombre: 'Oscuro', desc: 'Nocturno, sofisticado', plan: 'pro' },
    { id: 'natural', nombre: 'Natural', desc: 'Artesanal, cálido', plan: 'pro' },
    { id: 'premium', nombre: 'Premium', desc: 'Refinado, elegante', plan: 'pro' },
  ]

  const tiposNegocio = [
    { valor: 'restaurante', label: 'Restaurante' },
    { valor: 'cafeteria', label: 'Cafetería' },
    { valor: 'panaderia', label: 'Panadería' },
    { valor: 'bar', label: 'Bar' },
    { valor: 'comida_rapida', label: 'Comida rápida' },
    { valor: 'heladeria', label: 'Heladería' },
    { valor: 'food_truck', label: 'Food truck' },
    { valor: 'otro', label: 'Otro' },
  ]
  // recortarImagen vive en lib/imagen; la UI de recorte en components/ui/CropModal.

  function seleccionarImagen(tipo: 'logo' | 'banner', file: File) {
    if (file.size > 10 * 1024 * 1024) {
      alert('La imagen es muy grande. Máximo 10MB.')
      return
    }
    const url = URL.createObjectURL(file)
    setCropModal({ imagen: url, tipo })
  }

  // Mitad de SUBIDA del pipeline: el blob ya viene recortado por CropModal
  // (logo 400×400, banner 1200×400 — dims en las props del mount).
  async function confirmarRecorte(blob: Blob) {
    if (!cropModal || !rest?.id) return
    setSubiendoImagen(true)
    const tipo = cropModal.tipo

    setCropModal(null)

    const supabase = createClient()
    const path = `${rest.id}/${tipo}.jpg`

    const { error } = await supabase.storage
      .from('imagenes')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })

    if (error) {
      setSubiendoImagen(false)
      alert('Error al subir la imagen')
      return
    }

    const { data: urlData } = supabase.storage.from('imagenes').getPublicUrl(path)
    const url = urlData.publicUrl + '?t=' + Date.now()

    // Guardar URL en restaurante
    if (tipo === 'logo') {
      await supabase.from('restaurantes').update({ logo_url: url }).eq('id', rest.id)
      setLogoUrl(url)
    } else {
      await supabase.from('restaurantes').update({ banner_url: url }).eq('id', rest.id)
      setBannerUrl(url)
    }
    await mutateRestaurante()

    setSubiendoImagen(false)
  }

  async function cambiarPassword() {
    if (!isPasswordValid(nuevaPassword)) {
      alert(getPasswordError(nuevaPassword) || 'La contraseña no cumple los requisitos')
      return
    }
    if (nuevaPassword !== confirmarPassword) {
      alert('Las contraseñas no coinciden')
      return
    }
    setGuardandoPass(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: nuevaPassword })
    setGuardandoPass(false)
    if (error) {
      alert('Error al cambiar contraseña: ' + error.message)
      return
    }
    setPassGuardada(true)
    setNuevaPassword('')
    setConfirmarPassword('')
    setTimeout(() => { setPassGuardada(false); setMostrarCambiarPass(false) }, 3000)
  }

  async function eliminarCuenta() {
    if (textoConfirmar !== 'ELIMINAR' || !rest?.id) return
    setEliminando(true)
    const supabase = createClient()

    // Eliminar datos relacionados en orden
    await supabase.from('vistas_platos').delete().eq('restaurante_id', rest.id)
    await supabase.from('visitas_menu').delete().eq('restaurante_id', rest.id)
    await supabase.from('pedidos_whatsapp').delete().eq('restaurante_id', rest.id)
    await supabase.from('calificaciones').delete().eq('restaurante_id', rest.id)
    await supabase.from('horarios').delete().eq('restaurante_id', rest.id)
    await supabase.from('plato_del_dia').delete().eq('restaurante_id', rest.id)
    
    // Eliminar combo_platos y promos_platos primero
    const { data: combosData } = await supabase.from('combos').select('id').eq('restaurante_id', rest.id)
    if (combosData) {
      for (const c of combosData) {
        await supabase.from('combo_platos').delete().eq('combo_id', c.id)
      }
    }
    await supabase.from('combos').delete().eq('restaurante_id', rest.id)

    const { data: promosData } = await supabase.from('promos').select('id').eq('restaurante_id', rest.id)
    if (promosData) {
      for (const p of promosData) {
        await supabase.from('promo_platos').delete().eq('promo_id', p.id)
      }
    }
    await supabase.from('promos').delete().eq('restaurante_id', rest.id)

    await supabase.from('platos').delete().eq('restaurante_id', rest.id)
    await supabase.from('categorias').delete().eq('restaurante_id', rest.id)
    await supabase.from('config_restaurante').delete().eq('restaurante_id', rest.id)
    await supabase.from('referidos').delete().eq('referidor_id', rest.id)
    await supabase.from('restaurantes').delete().eq('id', rest.id)

    // Cerrar sesión
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function guardarSorprendemeCats(nuevas: string[]) {
    setSorprendemeCats(nuevas)
    if (!rest?.id) return
    const supabase = createClient()
    await supabase.from('config_restaurante').update({ sorprendeme_categorias: nuevas }).eq('restaurante_id', rest.id)
    await mutateConfig()
  }
  async function guardarHorarios() {
    if (!rest?.id) return
    setGuardandoHorarios(true)
    const supabase = createClient()

    // Borrar horarios existentes
    await supabase.from('horarios').delete().eq('restaurante_id', rest.id)

    // Insertar nuevos
    await supabase.from('horarios').insert(
      horarios.map(h => ({
        restaurante_id: rest.id,
        dia: h.dia,
        hora_apertura: h.hora_apertura,
        hora_cierre: h.hora_cierre,
        cerrado: h.cerrado,
      }))
    )
    await mutateHorarios()

    setGuardandoHorarios(false)
    setGuardadoHorarios(true)
    setTimeout(() => setGuardadoHorarios(false), 2000)
  }
  function toggleSeccion(id: string) {
    setSeccionActiva(seccionActiva === id ? null : id)
  }

  async function handleToggle(key: keyof typeof toggles) {
    const requierePro = ['combos_activo', 'promos_activo', 'plato_dia_activo', 'plato_ganador_activo'].includes(key)
    if (requierePro && !esPro) return

    const nuevoValor = !toggles[key]
    setToggles({ ...toggles, [key]: nuevoValor })

    if (rest?.id) {
      const supabase = createClient()
      await supabase.from('config_restaurante').update({ [key]: nuevoValor }).eq('restaurante_id', rest.id)
      await mutateConfig()
    }
  }

  async function guardarCambios() {
    if (!rest?.id) return
    setGuardando(true)
    const supabase = createClient()

    // Validación defensiva: si el tema requiere Pro y el usuario no es Pro, degradar a Claro
    const temaRequierePro = ['oscuro', 'natural', 'premium'].includes(tema)
    const temaFinal = (temaRequierePro && !esPro) ? 'claro' : tema

    await supabase.from('restaurantes').update({
      nombre, tipo, ciudad, whatsapp, direccion, descripcion,
      color_principal: colorPrincipal, tema: temaFinal,
    }).eq('id', rest.id)
    await mutateRestaurante()

    // Sincronizar estado local si se degradó
    if (temaFinal !== tema) setTema(temaFinal)

    setGuardando(false)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }
  if (cargandoAuth || cargandoConfig) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 500, fontFamily: 'var(--font-display)' }}>Menu<span style={{ color: 'var(--color-accent)' }}>App</span></div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>Cargando...</div>
        </div>
      </div>
    )
  }

  if (!usuario) return null
  return (
    <div style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '500px', minWidth: '320px', margin: '0 auto', paddingBottom: '80px' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px 12px' }}>
          <div style={{ fontSize: '18px', fontWeight: 500 }}>Configuración</div>
        </div>

        {/* === SECCIÓN: Datos del negocio === */}
        <div style={{ padding: '0 20px', marginBottom: '10px' }}>
          <div onClick={() => toggleSeccion('datos')} className="card" style={{ padding: '14px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>Datos del negocio</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Nombre, tipo, ciudad, WhatsApp</div>
              </div>
              <span style={{ display: 'inline-flex', color: 'var(--text-tertiary)', transition: 'transform 0.2s', transform: seccionActiva === 'datos' ? 'rotate(180deg)' : 'none' }}><Icono icono={ChevronDown} size={18} /></span>
            </div>
          </div>
          {seccionActiva === 'datos' && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '14px', animation: 'fadeInUp 0.2s ease' }}>
              <div style={{ marginBottom: '12px' }}>
                <label className="label">Nombre del negocio</label>
                <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label className="label">Tipo de negocio</label>
                <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ appearance: 'none' }}>
                  {tiposNegocio.map(t => <option key={t.valor} value={t.valor}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label className="label">Ciudad</label>
                <input className="input" value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label className="label">WhatsApp</label>
                <PhoneInput
                  value={whatsapp}
                  onChange={setWhatsapp}
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label className="label">Dirección (opcional)</label>
                <input className="input" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label className="label">Descripción del negocio</label>
                <div style={{ position: 'relative' }}>
                  <textarea className="input" value={descripcion} rows={3}
                    onChange={(e) => { if (e.target.value.length <= 200) setDescripcion(e.target.value) }}
                    style={{ resize: 'none', paddingBottom: '24px' }} />
                  <span style={{ position: 'absolute', right: '12px', bottom: '8px', fontSize: '10px', color: descripcion.length > 180 ? 'var(--color-warning)' : 'var(--text-tertiary)' }}>
                    {descripcion.length}/200
                  </span>
                </div>
              </div>
              <Boton onClick={guardarCambios} style={{ width: '100%' }}>
                {guardando ? 'Guardando...' : guardado ? <><Icono icono={Check} size={14} /> Guardado</> : 'Guardar cambios'}
              </Boton>
            </div>
          )}
        </div>

        {/* === SECCIÓN: Personalización === */}
        <div style={{ padding: '0 20px', marginBottom: '10px' }}>
          <div onClick={() => esBasico ? toggleSeccion('personalizacion') : null} className="card"
            style={{ padding: '14px', cursor: esBasico ? 'pointer' : 'default', opacity: esBasico ? 1 : 0.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 500 }}>Personalización del menú</span>
                  {!esBasico && <span className="badge badge-info">Básico</span>}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Color, tema y apariencia</div>
              </div>
              {esBasico && <span style={{ display: 'inline-flex', color: 'var(--text-tertiary)', transition: 'transform 0.2s', transform: seccionActiva === 'personalizacion' ? 'rotate(180deg)' : 'none' }}><Icono icono={ChevronDown} size={18} /></span>}
              {!esBasico && <span style={{ display: 'inline-flex', color: 'var(--text-tertiary)' }}><Icono icono={Lock} size={20} /></span>}
            </div>
          </div>
          {seccionActiva === 'personalizacion' && esBasico && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '14px', animation: 'fadeInUp 0.2s ease' }}>

              {/* Color principal — paleta curada + campo hex; el picker nativo
                  queda oculto tras "más colores..." (fallback, no camino primario) */}
              <div style={{ marginBottom: '16px' }}>
                <label className="label">Color principal</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {coloresPreset.map(c => (
                    <div key={c.color} onClick={() => { setColorPrincipal(c.color); setHexDraft(null) }} style={{
                      width: '36px', height: '36px', borderRadius: 'var(--radio-boton)', background: c.color, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: esColorClaro(c.color) ? 'var(--text-primary)' : 'white',
                      boxShadow: colorPrincipal === c.color ? `0 0 0 2px var(--bg-primary), 0 0 0 4px ${c.color}` : 'none',
                      transition: 'box-shadow 0.15s ease',
                    }} title={c.nombre}>
                      {colorPrincipal === c.color && <Icono icono={Check} size={16} />}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radio-boton)', background: colorPrincipal, border: '1px solid var(--border-light)', flexShrink: 0 }} />
                  <input
                    className="input"
                    value={hexDraft ?? colorPrincipal}
                    onChange={(e) => {
                      const v = e.target.value
                      setHexDraft(v)
                      const norm = normalizarHex(v)
                      if (norm) setColorPrincipal(norm)
                    }}
                    onBlur={() => setHexDraft(null)}
                    maxLength={7}
                    placeholder="#RRGGBB"
                    spellCheck={false}
                    aria-label="Color en formato hexadecimal"
                    style={{
                      width: '110px',
                      borderColor: hexDraft !== null && normalizarHex(hexDraft) === null ? 'var(--color-danger)' : undefined,
                    }}
                  />
                  <Boton variante="terciario" tono="neutro" tamano="sm"
                    onClick={() => inputColorNativoRef.current?.click()}
                    style={{ padding: '0 8px' }}>
                    más colores...
                  </Boton>
                  <input
                    ref={inputColorNativoRef}
                    type="color"
                    value={colorPrincipal}
                    onChange={(e) => { setColorPrincipal(normalizarHex(e.target.value) ?? colorPrincipal); setHexDraft(null) }}
                    aria-hidden="true"
                    tabIndex={-1}
                    style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
                  />
                </div>
                {hexDraft !== null && normalizarHex(hexDraft) === null && (
                  <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: '4px' }}>
                    Formato: #RRGGBB (6 dígitos hexadecimales)
                  </div>
                )}
              </div>

              {/* Vista previa del color */}
              <div style={{ marginBottom: '16px' }}>
                <label className="label">Vista previa</label>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px', alignItems: 'center' }}>
                  <div style={{ padding: '8px 16px', borderRadius: '20px', background: colorPrincipal, color: 'white', fontSize: '12px', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>Categorías <Icono icono={ChevronDown} size={12} /></div>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: colorPrincipal, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px' }}>+</div>
                  <span style={{ fontSize: '12px', color: colorPrincipal, fontWeight: 500 }}>Enlace</span>
                </div>
              </div>

              {/* Tema */}
              <div style={{ marginBottom: '16px' }}>
                <label className="label">Tema del menú</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                  {temas.map(t => {
                    const bloqueado = t.plan === 'pro' && !esPro
                    return (
                      <div
                        key={t.id}
                        onClick={() => { if (!bloqueado) setTema(t.id) }}
                        style={{
                          padding: '12px', borderRadius: 'var(--radius-sm)',
                          cursor: bloqueado ? 'not-allowed' : 'pointer',
                          opacity: bloqueado ? 0.55 : 1,
                          border: `1px solid ${tema === t.id && !bloqueado ? colorPrincipal : 'var(--border-light)'}`,
                          background: tema === t.id && !bloqueado ? `${colorPrincipal}08` : 'transparent',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 500 }}>{t.nombre}</span>
                            {t.plan === 'pro' && (
                              <span className="badge badge-warning">Pro</span>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {t.desc}
                          </div>
                          {bloqueado && (
                            <Boton
                              variante="terciario"
                              tamano="sm"
                              onClick={(e) => { e.stopPropagation(); router.push('/suscripcion') }}
                              style={{ padding: '0 8px', marginTop: '6px' }}
                            >
                              Desbloquear con Plan Pro <Icono icono={ArrowRight} size={12} />
                            </Boton>
                          )}
                        </div>
                        {bloqueado ? (
                          <span style={{ display: 'inline-flex', color: 'var(--text-tertiary)', marginLeft: '8px' }}><Icono icono={Lock} size={16} /></span>
                        ) : (
                          tema === t.id && (
                            <div style={{
                              width: '8px', height: '8px', borderRadius: '50%',
                              background: colorPrincipal, marginLeft: '8px',
                            }} />
                          )
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Preview en vivo del tema */}
                <div style={{ marginTop: '14px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Vista previa
                  </div>
                  <div className={`theme-${tema}`} style={{
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: '1px solid var(--border-light)',
                    background: 'var(--theme-bg)',
                    padding: '16px',
                    transition: 'all 0.25s ease',
                  }}>
                    {/* Banner del preview */}
                    {bannerUrl ? (
                      <div style={{
                        width: '100%',
                        aspectRatio: '3/1',
                        borderRadius: 'var(--theme-radius-image)',
                        overflow: 'hidden',
                        marginBottom: '-24px',
                      }}>
                        <img src={bannerUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    ) : (
                      <div style={{
                        width: '100%',
                        aspectRatio: '3/1',
                        borderRadius: 'var(--theme-radius-image)',
                        background: `linear-gradient(135deg, ${colorPrincipal}40, ${colorPrincipal}15)`,
                        marginBottom: '-24px',
                      }} />
                    )}

                    {/* Logo circular */}
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'var(--theme-surface)',
                      border: '3px solid var(--theme-bg)',
                      overflow: 'hidden',
                      marginLeft: '4px',
                      position: 'relative',
                      zIndex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {logoUrl ? (
                        <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{
                          fontSize: '16px',
                          fontWeight: 500,
                          color: 'var(--theme-text)',
                          fontFamily: 'var(--theme-font-display)',
                        }}>
                          {(nombre || 'TR').charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* Nombre y meta */}
                    <div style={{ marginTop: '10px', marginBottom: '12px' }}>
                      <div style={{
                        fontSize: '16px',
                        color: 'var(--theme-text)',
                        fontFamily: 'var(--theme-font-display)',
                        fontWeight: 'var(--theme-title-weight)' as any,
                        letterSpacing: 'var(--theme-title-letter-spacing)',
                        textTransform: 'var(--theme-title-transform)' as any,
                        lineHeight: 1.2,
                      }}>
                        {nombre || 'Tu Restaurante'}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: 'var(--theme-text-muted)',
                        fontFamily: 'var(--theme-font-body)',
                        marginTop: '4px',
                      }}>
                        Restaurante · {ciudad || 'Tu ciudad'}
                      </div>
                    </div>

                    {/* Tarjeta de plato ficticia */}
                    <div style={{
                      background: 'var(--theme-surface)',
                      borderRadius: 'var(--theme-radius-card)',
                      border: '1px solid var(--theme-border)',
                      padding: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      boxShadow: 'var(--theme-shadow-card)',
                    }}>
                      {/* Foto placeholder */}
                      <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: 'var(--theme-radius-image)',
                        background: `linear-gradient(135deg, ${colorPrincipal}30, ${colorPrincipal}10)`,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        fontWeight: 500,
                        color: colorPrincipal,
                      }}>
                        H
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '13px',
                          fontWeight: 500,
                          color: 'var(--theme-text)',
                          fontFamily: 'var(--theme-font-body)',
                        }}>
                          Hamburguesa Clásica
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: 'var(--theme-text-muted)',
                          fontFamily: 'var(--theme-font-body)',
                          marginTop: '2px',
                        }}>
                          $25.000
                        </div>
                      </div>
                      {/* Botón + con color del usuario */}
                      <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: colorPrincipal,
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        fontWeight: 500,
                        flexShrink: 0,
                      }}>
                        +
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '6px', textAlign: 'center' }}>
                    Así se verá tu menú con el tema seleccionado
                  </div>
                </div>
              </div>

              {/* Banner */}
              <div style={{ marginBottom: '14px' }}>
                <label className="label">Foto de portada (banner)</label>
                {bannerUrl ? (
                  <div style={{ marginTop: '6px' }}>
                    <div style={{ width: '100%', aspectRatio: '3/1', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}>
                      <img src={bannerUrl} alt="Banner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', border: '1px solid var(--border-light)', cursor: 'pointer', color: 'var(--color-accent)' }}>
                      {subiendoImagen ? 'Subiendo...' : 'Cambiar banner'}
                      <input type="file" accept="image/*" style={{ display: 'none' }} disabled={subiendoImagen}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) seleccionarImagen('banner', f) }} />
                    </label>
                  </div>
                ) : (
                  <label style={{ cursor: 'pointer', display: 'block', marginTop: '6px' }}>
                    <div style={{
                      border: '1px dashed var(--border-medium)', borderRadius: 'var(--radius-md)',
                      padding: '20px', textAlign: 'center',
                    }}>
                      <div style={{ marginBottom: '4px', color: 'var(--text-tertiary)' }}><Icono icono={ImagePlus} size={24} /></div>
                      <div style={{ fontSize: '13px', color: 'var(--color-accent)' }}>{subiendoImagen ? 'Subiendo...' : 'Subir banner'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>JPG o PNG · Máximo 10MB · Se ajusta a 1200x400</div>
                    </div>
                    <input type="file" accept="image/*" style={{ display: 'none' }} disabled={subiendoImagen}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) seleccionarImagen('banner', f) }} />
                  </label>
                )}
              </div>

              {/* Logo */}
              <div style={{ marginBottom: '14px' }}>
                <label className="label">Logo del negocio</label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '6px' }}>
                  <label style={{ cursor: 'pointer' }}>
                    <div style={{
                      width: '56px', height: '56px', borderRadius: '50%',
                      border: logoUrl ? 'none' : '1px dashed var(--border-medium)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                    }}>
                      {logoUrl ? (
                        <img src={logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ display: 'inline-flex', color: 'var(--text-tertiary)' }}><Icono icono={ImagePlus} size={20} /></span>
                      )}
                    </div>
                    <input type="file" accept="image/*" style={{ display: 'none' }} disabled={subiendoImagen}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) seleccionarImagen('logo', f) }} />
                  </label>
                  <div>
                    <label style={{ fontSize: '13px', color: 'var(--color-accent)', cursor: 'pointer' }}>
                      {subiendoImagen ? 'Subiendo...' : logoUrl ? 'Cambiar logo' : 'Subir logo'}
                      <input type="file" accept="image/*" style={{ display: 'none' }} disabled={subiendoImagen}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) seleccionarImagen('logo', f) }} />
                    </label>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Circular · Máximo 10MB · Se ajusta a 400x400</div>
                  </div>
                </div>
              </div>

              <Boton onClick={guardarCambios} style={{ width: '100%' }}>
                {guardando ? 'Guardando...' : guardado ? <><Icono icono={Check} size={14} /> Guardado</> : 'Guardar cambios'}
              </Boton>
            </div>
          )}
        </div>

        {/* === SECCIÓN: Funciones del menú === */}
        <div style={{ padding: '0 20px', marginBottom: '10px' }}>
          <div onClick={() => toggleSeccion('funciones')} className="card" style={{ padding: '14px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>Funciones del menú</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Activa o desactiva funciones</div>
              </div>
              <span style={{ display: 'inline-flex', color: 'var(--text-tertiary)', transition: 'transform 0.2s', transform: seccionActiva === 'funciones' ? 'rotate(180deg)' : 'none' }}><Icono icono={ChevronDown} size={18} /></span>
            </div>
          </div>
          {seccionActiva === 'funciones' && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '6px 0', animation: 'fadeInUp 0.2s ease' }}>
              {[
                { key: 'whatsapp_activo', label: 'Pedidos por WhatsApp', desc: 'Los clientes pueden pedir por WhatsApp', plan: 'gratis' },
                { key: 'calificaciones_activo', label: 'Calificaciones', desc: 'Los clientes pueden calificar platos', plan: 'gratis' },
                { key: 'sorprendeme_activo', label: 'Sorpréndeme', desc: 'Combinación aleatoria de platos', plan: 'gratis' },
                { key: 'combos_activo', label: 'Combos', desc: 'Paquetes de platos con descuento', plan: 'pro' },
                { key: 'promos_activo', label: 'Promociones', desc: '2x1, descuento, precio especial', plan: 'pro' },
                { key: 'plato_dia_activo', label: 'Plato del día', desc: 'Plato destacado con cuenta regresiva', plan: 'pro' },
                { key: 'plato_ganador_activo', label: 'Plato ganador', desc: 'Plato premiado o recomendado', plan: 'pro' },
              ].map((item) => {
                const bloqueado = (item.plan === 'pro' && !esPro) || (item.plan === 'basico' && !esBasico)
                return (
                  <div key={item.key} style={{
                    padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: '1px solid var(--border-light)', opacity: bloqueado ? 0.5 : 1,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px' }}>{item.label}</span>
                        {item.plan !== 'gratis' && (
                          <span className={`badge ${item.plan === 'pro' ? 'badge-warning' : 'badge-info'}`}>
                            {item.plan === 'pro' ? 'Pro' : 'Básico'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{item.desc}</div>
                    </div>
                    {bloqueado ? (
                      <span style={{ display: 'inline-flex', color: 'var(--text-tertiary)' }}><Icono icono={Lock} size={16} /></span>
                    ) : (
                      <div onClick={() => handleToggle(item.key as keyof typeof toggles)} style={{
                        width: '36px', height: '20px', borderRadius: '10px',
                        background: toggles[item.key as keyof typeof toggles] ? 'var(--color-accent)' : 'var(--border-light)',
                        position: 'relative', cursor: 'pointer', transition: 'background var(--transicion-ui)',
                      }}>
                        <div style={{
                          width: '16px', height: '16px', borderRadius: '50%', background: 'white',
                          position: 'absolute', top: '2px',
                          left: toggles[item.key as keyof typeof toggles] ? '18px' : '2px',
                          transition: 'left 0.2s',
                        }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* === SECCIÓN: Horarios === */}
        <div style={{ padding: '0 20px', marginBottom: '10px' }}>
          <div onClick={() => toggleSeccion('horarios')} className="card" style={{ padding: '14px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>Horarios</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Horario de atención del negocio</div>
              </div>
              <span style={{ display: 'inline-flex', color: 'var(--text-tertiary)', transition: 'transform 0.2s', transform: seccionActiva === 'horarios' ? 'rotate(180deg)' : 'none' }}><Icono icono={ChevronDown} size={18} /></span>
            </div>
          </div>
          {seccionActiva === 'horarios' && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '14px', animation: 'fadeInUp 0.2s ease' }}>
              {horarios.map((h, i) => (
                <div
                  key={h.dia}
                  style={{
                    padding: '14px 0',
                    borderBottom: i < 6 ? '1px solid var(--border-light)' : 'none',
                  }}
                >
                  {/* Fila superior: día + estado + toggle */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: h.cerrado ? 0 : '10px',
                  }}>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: h.cerrado ? 'var(--text-tertiary)' : 'var(--text-primary)',
                    }}>
                      {h.dia}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        color: h.cerrado ? 'var(--text-tertiary)' : 'var(--color-accent)',
                        letterSpacing: '0.3px',
                      }}>
                        {h.cerrado ? 'Cerrado' : 'Abierto'}
                      </span>
                      <div
                        onClick={() => {
                          const nuevo = [...horarios]
                          nuevo[i] = { ...nuevo[i], cerrado: !nuevo[i].cerrado }
                          setHorarios(nuevo)
                        }}
                        style={{
                          width: '36px',
                          height: '20px',
                          borderRadius: '10px',
                          background: h.cerrado ? 'var(--border-medium)' : 'var(--color-accent)',
                          position: 'relative',
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                          flexShrink: 0,
                        }}
                      >
                        <div style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          background: 'white',
                          position: 'absolute',
                          top: '2px',
                          left: h.cerrado ? '2px' : '18px',
                          transition: 'left 0.2s',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                        }} />
                      </div>
                    </div>
                  </div>

                  {/* Fila inferior: selectores de hora (solo si está abierto) */}
                  {!h.cerrado && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}>
                      <TimePicker
                        value={h.hora_apertura}
                        onChange={(v) => {
                          const nuevo = [...horarios]
                          nuevo[i] = { ...nuevo[i], hora_apertura: v }
                          setHorarios(nuevo)
                        }}
                      />
                      <span style={{
                        color: 'var(--text-tertiary)',
                        fontSize: '13px',
                      }}>—</span>
                      <TimePicker
                        value={h.hora_cierre}
                        onChange={(v) => {
                          const nuevo = [...horarios]
                          nuevo[i] = { ...nuevo[i], hora_cierre: v }
                          setHorarios(nuevo)
                        }}
                      />
                    </div>
                  )}
                  {!h.cerrado && (
                    <TimeRangeHelper start={h.hora_apertura} end={h.hora_cierre} verb="Abierto" />
                  )}
                </div>
              ))}
              <Boton onClick={guardarHorarios} style={{ width: '100%', marginTop: '14px' }}>
                {guardandoHorarios ? 'Guardando...' : guardadoHorarios ? <><Icono icono={Check} size={14} /> Guardado</> : 'Guardar horarios'}
              </Boton>
            </div>
          )}
        </div>

        {/* === SECCIÓN: Cuenta === */}
        <div style={{ padding: '0 20px', marginBottom: '10px' }}>
          <div onClick={() => toggleSeccion('cuenta')} className="card" style={{ padding: '14px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>Cuenta</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Email y contraseña</div>
              </div>
              <span style={{ display: 'inline-flex', color: 'var(--text-tertiary)', transition: 'transform 0.2s', transform: seccionActiva === 'cuenta' ? 'rotate(180deg)' : 'none' }}><Icono icono={ChevronDown} size={18} /></span>
            </div>
          </div>
          {seccionActiva === 'cuenta' && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '14px', animation: 'fadeInUp 0.2s ease' }}>
              <div style={{ marginBottom: '12px' }}>
                <label className="label">Email</label>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>{email}</div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label className="label">Contraseña</label>
                {!mostrarCambiarPass ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>••••••••</span>
                    <Boton variante="terciario" tamano="sm" onClick={() => setMostrarCambiarPass(true)} style={{ padding: '0 8px' }}>Cambiar</Boton>
                  </div>
                ) : (
                  <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: '12px' }}>
                    <div style={{ marginBottom: '12px' }}>
                      <PasswordInput
                        value={nuevaPassword}
                        onChange={setNuevaPassword}
                        placeholder="Nueva contraseña"
                        showValidation={true}
                      />
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <PasswordInput
                        value={confirmarPassword}
                        onChange={setConfirmarPassword}
                        placeholder="Confirmar nueva contraseña"
                      />
                    </div>
                    {nuevaPassword && confirmarPassword && nuevaPassword !== confirmarPassword && (
                      <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '8px' }}>Las contraseñas no coinciden</div>
                    )}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Boton onClick={cambiarPassword} disabled={!isPasswordValid(nuevaPassword) || nuevaPassword !== confirmarPassword || guardandoPass}
                        tamano="sm" style={{ flex: 1 }}>
                        {guardandoPass ? 'Guardando...' : passGuardada ? <><Icono icono={Check} size={14} /> Contraseña actualizada</> : 'Guardar nueva contraseña'}
                      </Boton>
                      <Boton variante="secundario" tamano="sm" onClick={() => { setMostrarCambiarPass(false); setNuevaPassword(''); setConfirmarPassword('') }}>Cancelar</Boton>
                    </div>
                  </div>
                )}
              </div>

              {/* Eliminar cuenta */}
              {!mostrarConfirmarEliminar ? (
                <div onClick={() => setMostrarConfirmarEliminar(true)} style={{
                  padding: '12px', background: 'var(--color-danger-light)', borderRadius: 'var(--radius-sm)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
                }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-danger)' }}>Eliminar cuenta</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-danger)', opacity: 0.7, marginTop: '2px' }}>Se perderán todos tus datos</div>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--color-danger)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>Eliminar <Icono icono={ArrowRight} size={12} /></span>
                </div>
              ) : (
                <div style={{ padding: '14px', background: 'var(--color-danger-light)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger)' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-danger)', marginBottom: '8px' }}>¿Estás seguro?</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>
                    Esta acción eliminará permanentemente tu restaurante, todos tus platos, combos, promos, calificaciones, estadísticas y configuración. No se puede deshacer.
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    Escribe <strong>ELIMINAR</strong> para confirmar:
                  </div>
                  <input className="input" value={textoConfirmar} onChange={(e) => setTextoConfirmar(e.target.value)}
                    placeholder="Escribe ELIMINAR" style={{ marginBottom: '10px' }} />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Boton variante="peligro" tamano="sm" onClick={eliminarCuenta}
                      disabled={textoConfirmar !== 'ELIMINAR' || eliminando} style={{ flex: 1 }}>
                      {eliminando ? 'Eliminando...' : 'Eliminar cuenta permanentemente'}
                    </Boton>
                    <Boton variante="secundario" tamano="sm" onClick={() => { setMostrarConfirmarEliminar(false); setTextoConfirmar('') }}>
                      Cancelar
                    </Boton>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Modal recorte de imagen */}
        {cropModal && (
          <CropModal
            imagen={cropModal.imagen}
            aspect={cropModal.tipo === 'logo' ? 1 : 3}
            cropShape={cropModal.tipo === 'logo' ? 'round' : 'rect'}
            titulo={`Ajustar ${cropModal.tipo === 'logo' ? 'logo' : 'banner'}`}
            anchoSalida={cropModal.tipo === 'logo' ? 400 : 1200}
            altoSalida={400}
            onConfirm={confirmarRecorte}
            onCancel={() => setCropModal(null)}
          />
        )}
        <BottomNav />

      </div>
    </div>
  )
}