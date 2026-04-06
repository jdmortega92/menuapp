'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks'
import { createClient } from '@/lib/supabase-browser'
import Cropper from 'react-easy-crop'

export default function ConfigPage() {
  const router = useRouter()
  const { usuario, restaurante: rest, cargando: cargandoAuth } = useAuth()
  const plan = (rest?.plan || 'gratis') as string
  const esBasico = plan === 'basico' || plan === 'pro'
  const esPro = plan === 'pro'

  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('restaurante')
  const [ciudad, setCiudad] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [direccion, setDireccion] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [colorPrincipal, setColorPrincipal] = useState('#E85D24')
  const [tema, setTema] = useState('claro')
  const [toggles, setToggles] = useState({
    whatsapp_activo: true,
    combos_activo: false,
    promos_activo: false,
    plato_dia_activo: false,
    plato_ganador_activo: false,
    calificaciones_activo: true,
    sorprendeme_activo: true,
    menu_por_horario_activo: false,
  })
  const [email, setEmail] = useState('')
  const [cargandoConfig, setCargandoConfig] = useState(true)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [subiendoImagen, setSubiendoImagen] = useState(false)
  const [cropModal, setCropModal] = useState<{ imagen: string; tipo: 'logo' | 'banner' } | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null)

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  // Cargar datos reales
  useEffect(() => {
    if (!rest?.id || !usuario) return

    async function cargar() {
      const supabase = createClient()
      setNombre(rest!.nombre || '')
      setTipo(rest!.tipo || 'restaurante')
      setCiudad(rest!.ciudad || '')
      setWhatsapp(rest!.whatsapp || '')
      setDireccion(rest!.direccion || '')
      setDescripcion(rest!.descripcion || '')
      setColorPrincipal(rest!.color_principal || '#E85D24')
      setTema(rest!.tema || 'claro')
      setEmail(usuario!.email || '')

      const { data: conf } = await supabase
        .from('config_restaurante')
        .select('*')
        .eq('restaurante_id', rest!.id)
        .single()

      if (conf) {
        setToggles({
          whatsapp_activo: conf.whatsapp_activo ?? true,
          combos_activo: conf.combos_activo ?? false,
          promos_activo: conf.promos_activo ?? false,
          plato_dia_activo: conf.plato_dia_activo ?? false,
          plato_ganador_activo: conf.plato_ganador_activo ?? false,
          calificaciones_activo: conf.calificaciones_activo ?? true,
          sorprendeme_activo: conf.sorprendeme_activo ?? true,
          menu_por_horario_activo: false,
        })
      }
      // Cargar logo y banner
      const supabase2 = createClient()
      const { data: logoCheck } = await supabase2.storage.from('imagenes').list(`${rest!.id}`, { search: 'logo' })
      if (logoCheck && logoCheck.length > 0) {
        const { data: logoData } = supabase2.storage.from('imagenes').getPublicUrl(`${rest!.id}/logo.jpg`)
        setLogoUrl(logoData.publicUrl + '?t=' + Date.now())
      }
      const { data: bannerCheck } = await supabase2.storage.from('imagenes').list(`${rest!.id}`, { search: 'banner' })
      if (bannerCheck && bannerCheck.length > 0) {
        const { data: bannerData } = supabase2.storage.from('imagenes').getPublicUrl(`${rest!.id}/banner.jpg`)
        setBannerUrl(bannerData.publicUrl + '?t=' + Date.now())
      }
      setCargandoConfig(false)
    }
    cargar()
  }, [rest?.id, usuario])

  // Proteger ruta
  useEffect(() => {
    if (!cargandoAuth && !usuario) {
      router.push('/login')
    }
  }, [cargandoAuth, usuario, router])

  const [seccionActiva, setSeccionActiva] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  const coloresPreset = [
    { color: '#E85D24', nombre: 'Naranja' },
    { color: '#C0392B', nombre: 'Rojo' },
    { color: '#1B5E20', nombre: 'Verde' },
    { color: '#1565C0', nombre: 'Azul' },
    { color: '#6C63FF', nombre: 'Morado' },
    { color: '#D4A017', nombre: 'Dorado' },
    { color: '#E91E63', nombre: 'Rosa' },
    { color: '#1A1A18', nombre: 'Negro' },
  ]

  const temas = [
    { id: 'claro', nombre: 'Claro', desc: 'Fondo blanco, texto oscuro' },
    { id: 'oscuro', nombre: 'Oscuro', desc: 'Fondo negro, texto claro' },
    { id: 'natural', nombre: 'Natural', desc: 'Tonos cálidos y tierra' },
    { id: 'premium', nombre: 'Premium', desc: 'Elegante y sofisticado' },
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
  function recortarImagen(imageSrc: string, pixelCrop: any, ancho: number, alto: number): Promise<Blob> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!
        canvas.width = ancho
        canvas.height = alto
        ctx.drawImage(img, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, ancho, alto)
        canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.85)
      }
      img.src = imageSrc
    })
  }

  function seleccionarImagen(tipo: 'logo' | 'banner', file: File) {
    if (file.size > 10 * 1024 * 1024) {
      alert('La imagen es muy grande. Máximo 10MB.')
      return
    }
    const url = URL.createObjectURL(file)
    setCropModal({ imagen: url, tipo })
    setCrop({ x: 0, y: 0 })
    setZoom(1)
  }

  async function confirmarRecorte() {
    if (!cropModal || !croppedAreaPixels || !rest?.id) return
    setSubiendoImagen(true)
    const tipo = cropModal.tipo

    const ancho = tipo === 'logo' ? 400 : 1200
    const alto = tipo === 'logo' ? 400 : 400
    const blob = await recortarImagen(cropModal.imagen, croppedAreaPixels, ancho, alto)

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

    setSubiendoImagen(false)
  }
  function toggleSeccion(id: string) {
    setSeccionActiva(seccionActiva === id ? null : id)
  }

  async function handleToggle(key: keyof typeof toggles) {
    const requierePro = ['combos_activo', 'promos_activo', 'plato_dia_activo', 'plato_ganador_activo'].includes(key)
    if (requierePro && !esPro) return
    const requiereBasico = ['menu_por_horario_activo'].includes(key)
    if (requiereBasico && !esBasico) return

    const nuevoValor = !toggles[key]
    setToggles({ ...toggles, [key]: nuevoValor })

    if (rest?.id) {
      const supabase = createClient()
      await supabase.from('config_restaurante').update({ [key]: nuevoValor }).eq('restaurante_id', rest.id)
    }
  }

  async function guardarCambios() {
    if (!rest?.id) return
    setGuardando(true)
    const supabase = createClient()

    await supabase.from('restaurantes').update({
      nombre, tipo, ciudad, whatsapp, direccion, descripcion,
      color_principal: colorPrincipal, tema,
    }).eq('id', rest.id)

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
      <div style={{ maxWidth: '500px', margin: '0 auto', paddingBottom: '80px' }}>

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
              <span style={{ color: 'var(--text-tertiary)', transition: 'transform 0.2s', transform: seccionActiva === 'datos' ? 'rotate(180deg)' : 'none' }}>▼</span>
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
                <input className="input" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
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
              <button onClick={guardarCambios} className="btn-primary" style={{ width: '100%', padding: '12px', fontSize: '13px' }}>
                {guardando ? 'Guardando...' : guardado ? '✓ Guardado' : 'Guardar cambios'}
              </button>
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
              {esBasico && <span style={{ color: 'var(--text-tertiary)', transition: 'transform 0.2s', transform: seccionActiva === 'personalizacion' ? 'rotate(180deg)' : 'none' }}>▼</span>}
              {!esBasico && <span style={{ fontSize: '20px' }}>🔒</span>}
            </div>
          </div>
          {seccionActiva === 'personalizacion' && esBasico && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '14px', animation: 'fadeInUp 0.2s ease' }}>

              {/* Color principal */}
              <div style={{ marginBottom: '16px' }}>
                <label className="label">Color principal</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {coloresPreset.map(c => (
                    <div key={c.color} onClick={() => setColorPrincipal(c.color)} style={{
                      width: '36px', height: '36px', borderRadius: '10px', background: c.color, cursor: 'pointer',
                      border: colorPrincipal === c.color ? '3px solid var(--text-primary)' : '2px solid transparent',
                      boxShadow: colorPrincipal === c.color ? '0 0 0 2px var(--bg-primary)' : 'none',
                      transition: 'all 0.15s ease',
                    }} title={c.nombre} />
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                  <input type="color" value={colorPrincipal} onChange={(e) => setColorPrincipal(e.target.value)}
                    style={{ width: '32px', height: '32px', border: 'none', padding: 0, cursor: 'pointer', borderRadius: '6px' }} />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>o elige un color personalizado</span>
                </div>
              </div>

              {/* Vista previa del color */}
              <div style={{ marginBottom: '16px' }}>
                <label className="label">Vista previa</label>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px', alignItems: 'center' }}>
                  <div style={{ padding: '8px 16px', borderRadius: '20px', background: colorPrincipal, color: 'white', fontSize: '12px', fontWeight: 500 }}>Categorías ↓</div>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: colorPrincipal, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px' }}>+</div>
                  <span style={{ fontSize: '12px', color: colorPrincipal, fontWeight: 500 }}>Enlace</span>
                </div>
              </div>

              {/* Tema */}
              <div style={{ marginBottom: '16px' }}>
                <label className="label">Tema del menú</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                  {temas.map(t => (
                    <div key={t.id} onClick={() => setTema(t.id)} style={{
                      padding: '12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      border: `1px solid ${tema === t.id ? colorPrincipal : 'var(--border-light)'}`,
                      background: tema === t.id ? `${colorPrincipal}08` : 'transparent',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 500 }}>{t.nombre}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{t.desc}</div>
                      </div>
                      {tema === t.id && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: colorPrincipal }} />}
                    </div>
                  ))}
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
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', border: '1px solid var(--border-light)', cursor: 'pointer', color: 'var(--color-info)' }}>
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
                      <div style={{ fontSize: '24px', marginBottom: '4px', color: 'var(--text-tertiary)' }}>⊕</div>
                      <div style={{ fontSize: '13px', color: 'var(--color-info)' }}>{subiendoImagen ? 'Subiendo...' : 'Subir banner'}</div>
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
                      width: '56px', height: '56px', borderRadius: '12px',
                      border: logoUrl ? 'none' : '1px dashed var(--border-medium)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                    }}>
                      {logoUrl ? (
                        <img src={logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: '20px', color: 'var(--text-tertiary)' }}>⊕</span>
                      )}
                    </div>
                    <input type="file" accept="image/*" style={{ display: 'none' }} disabled={subiendoImagen}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) seleccionarImagen('logo', f) }} />
                  </label>
                  <div>
                    <label style={{ fontSize: '13px', color: 'var(--color-info)', cursor: 'pointer' }}>
                      {subiendoImagen ? 'Subiendo...' : logoUrl ? 'Cambiar logo' : 'Subir logo'}
                      <input type="file" accept="image/*" style={{ display: 'none' }} disabled={subiendoImagen}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) seleccionarImagen('logo', f) }} />
                    </label>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Cuadrado · Máximo 10MB · Se ajusta a 400x400</div>
                  </div>
                </div>
              </div>

              <button onClick={guardarCambios} className="btn-primary" style={{ width: '100%', padding: '12px', fontSize: '13px' }}>
                {guardando ? 'Guardando...' : guardado ? '✓ Guardado' : 'Guardar cambios'}
              </button>
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
              <span style={{ color: 'var(--text-tertiary)', transition: 'transform 0.2s', transform: seccionActiva === 'funciones' ? 'rotate(180deg)' : 'none' }}>▼</span>
            </div>
          </div>
          {seccionActiva === 'funciones' && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '6px 0', animation: 'fadeInUp 0.2s ease' }}>
              {[
                { key: 'whatsapp_activo', label: 'Pedidos por WhatsApp', desc: 'Los clientes pueden pedir por WhatsApp', plan: 'gratis' },
                { key: 'calificaciones_activo', label: 'Calificaciones', desc: 'Los clientes pueden calificar platos', plan: 'gratis' },
                { key: 'sorprendeme_activo', label: 'Sorpréndeme', desc: 'Combinación aleatoria de platos', plan: 'gratis' },
                { key: 'menu_por_horario_activo', label: 'Menú por horario', desc: 'Categorías visibles por horario', plan: 'basico' },
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
                      <span style={{ fontSize: '16px' }}>🔒</span>
                    ) : (
                      <div onClick={() => handleToggle(item.key as keyof typeof toggles)} style={{
                        width: '36px', height: '20px', borderRadius: '10px',
                        background: toggles[item.key as keyof typeof toggles] ? 'var(--color-info)' : 'var(--border-light)',
                        position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
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
              <span style={{ color: 'var(--text-tertiary)', transition: 'transform 0.2s', transform: seccionActiva === 'horarios' ? 'rotate(180deg)' : 'none' }}>▼</span>
            </div>
          </div>
          {seccionActiva === 'horarios' && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '14px', animation: 'fadeInUp 0.2s ease' }}>
              {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((dia) => (
                <div key={dia} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '13px', width: '80px' }}>{dia}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <input type="time" defaultValue="11:00" style={{ border: '1px solid var(--border-light)', borderRadius: '6px', padding: '4px 6px', fontSize: '12px', fontFamily: 'var(--font-body)' }} />
                    <span>—</span>
                    <input type="time" defaultValue="21:00" style={{ border: '1px solid var(--border-light)', borderRadius: '6px', padding: '4px 6px', fontSize: '12px', fontFamily: 'var(--font-body)' }} />
                  </div>
                </div>
              ))}
              <button onClick={guardarCambios} className="btn-primary" style={{ width: '100%', padding: '12px', fontSize: '13px', marginTop: '14px' }}>
                {guardando ? 'Guardando...' : guardado ? '✓ Guardado' : 'Guardar horarios'}
              </button>
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
              <span style={{ color: 'var(--text-tertiary)', transition: 'transform 0.2s', transform: seccionActiva === 'cuenta' ? 'rotate(180deg)' : 'none' }}>▼</span>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>••••••••</span>
                  <span style={{ fontSize: '12px', color: 'var(--color-info)', cursor: 'pointer' }}>Cambiar</span>
                </div>
              </div>
              <div style={{
                padding: '12px', background: 'var(--color-danger-light)', borderRadius: 'var(--radius-sm)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-danger)' }}>Eliminar cuenta</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-danger)', opacity: 0.7, marginTop: '2px' }}>Se perderán todos tus datos</div>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--color-danger)', cursor: 'pointer' }}>Eliminar →</span>
              </div>
            </div>
          )}
        </div>
        {/* Modal recorte de imagen */}
        {cropModal && (
          <>
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 80 }} />
            <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span onClick={() => setCropModal(null)} style={{ fontSize: '14px', color: 'white', cursor: 'pointer' }}>Cancelar</span>
                <span style={{ fontSize: '15px', fontWeight: 500, color: 'white' }}>Ajustar {cropModal.tipo === 'logo' ? 'logo' : 'banner'}</span>
                <span onClick={confirmarRecorte} style={{ fontSize: '14px', color: '#4CAF50', fontWeight: 500, cursor: 'pointer' }}>Listo</span>
              </div>
              <div style={{ position: 'relative', flex: 1 }}>
                <Cropper
                  image={cropModal.imagen}
                  crop={crop}
                  zoom={zoom}
                  aspect={cropModal.tipo === 'logo' ? 1 : 3}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  cropShape={cropModal.tipo === 'logo' ? 'round' : 'rect'}
                />
              </div>
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
        }}>
          {[
            { icon: '◉', label: 'Inicio', href: '/dashboard', active: false },
            { icon: '≡', label: 'Menú', href: '/menu', active: false },
            { icon: '◻', label: 'QR', href: '/qr', active: false },
            { icon: '⊙', label: 'Config', href: '/config', active: true },
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