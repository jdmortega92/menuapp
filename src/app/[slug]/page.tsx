'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function MenuPublicoPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = params.slug as string
  const qrMesa = searchParams.get('qr')
  const esQR = !!qrMesa

  const [busqueda, setBusqueda] = useState('')
  const [categoriaAbierta, setCategoriaAbierta] = useState<string | null>(null)
  const [pedido, setPedido] = useState<Record<string, number>>({})
  const [preciosPromo, setPreciosPromo] = useState<Record<string, { precioUnitario: number; etiqueta: string }>>({})
  const [nota, setNota] = useState('')
  const [mostrarPedido, setMostrarPedido] = useState(false)
  const [mostrarSorpresa, setMostrarSorpresa] = useState(false)
  const [mostrarMenu, setMostrarMenu] = useState(esQR)
  const [platoDetalle, setPlatoDetalle] = useState<string | null>(null)
  const [platoCalificar, setPlatoCalificar] = useState<string | null>(null)
  const [calEstrellas, setCalEstrellas] = useState(0)
  const [calTags, setCalTags] = useState<string[]>([])
  const [calComentario, setCalComentario] = useState('')
  const [calEnviada, setCalEnviada] = useState(false)

  const [restaurante, setRestaurante] = useState<any>(null)
  const [config, setConfig] = useState<any>(null)
  const [categorias, setCategorias] = useState<any[]>([])
  const [platoDia, setPlatoDia] = useState<any>(null)
  const [cargando, setCargando] = useState(true)
  const [horariosRest, setHorariosRest] = useState<any[]>([])
  const [combosPublico, setCombosPublico] = useState<any[]>([])
  const [promosPublico, setPromosPublico] = useState<any[]>([])
  const [mostrarPromos, setMostrarPromos] = useState(false)
  const [promoDetalle, setPromoDetalle] = useState<any>(null)
  const [promoSeleccion, setPromoSeleccion] = useState<string[]>([])
  const [mostrarCombos, setMostrarCombos] = useState(false)

  useEffect(() => {
    async function cargar() {
      const supabase = createClient()

      // Buscar restaurante por slug
      const { data: rest } = await supabase
        .from('restaurantes')
        .select('*')
        .eq('slug', slug)
        .single()

      if (!rest) { setCargando(false); return }

      // Registrar visita al menú (fecha Colombia UTC-5)
      const fechaColombia = new Date(new Date().getTime() - 5 * 60 * 60 * 1000).toISOString().split('T')[0]
      const { error: visitaErr } = await supabase.from('visitas_menu').insert({
        restaurante_id: rest.id,
        origen: esQR ? 'qr' : 'enlace',
        mesa: qrMesa || null,
        fecha: fechaColombia,
      })
      

      // Horarios
      const { data: horariosData } = await supabase
        .from('horarios')
        .select('*')
        .eq('restaurante_id', rest.id)

      if (horariosData && horariosData.length > 0) {
        setHorariosRest(horariosData)
      }
      setRestaurante(rest)

      // Config
      const { data: conf } = await supabase
        .from('config_restaurante')
        .select('*')
        .eq('restaurante_id', rest.id)
        .maybeSingle()

      if (conf) setConfig(conf)


      // Categorías y platos
      const { data: cats } = await supabase
        .from('categorias')
        .select('*')
        .eq('restaurante_id', rest.id)
        .order('orden', { ascending: true })

      const { data: platos } = await supabase
        .from('platos')
        .select('*')
        .eq('restaurante_id', rest.id)
        .order('orden', { ascending: true })

      if (cats && platos) {
        setCategorias(cats.map(cat => ({
          id: cat.id, nombre: cat.nombre,
          platos: platos
            .filter((p: any) => p.categoria_id === cat.id)
            .map((p: any) => ({
              id: p.id, nombre: p.nombre, precio: p.precio,
              descripcion: p.descripcion || '', disponible: p.disponible,
              foto_url: p.foto_url || null,
              estrellas: 0, resenas: 0,
            })),
        })))
      }

      // Plato del día
      const { data: pd } = await supabase
        .from('plato_del_dia')
        .select('*, platos(*)')
        .eq('restaurante_id', rest.id)
        .eq('activo', true)
        .maybeSingle()

      if (pd?.platos) {
        setPlatoDia({
          id: pd.platos.id, nombre: pd.platos.nombre,
          precio: pd.platos.precio, precioEspecial: pd.precio_especial,
          descripcion: pd.platos.descripcion, horaFin: pd.horario_fin || '15:00',
        })
      }
      // Combos
      const { data: combosData } = await supabase
        .from('combos')
        .select('*, combo_platos(plato_id, platos(nombre, precio))')
        .eq('restaurante_id', rest.id)
        .eq('activo', true)

      if (combosData) {
        setCombosPublico(combosData.map((c: any) => ({
          id: c.id,
          nombre: c.nombre,
          descripcion: c.descripcion,
          precio: c.precio,
          precioIndividual: c.precio_individual,
          platos: c.combo_platos?.map((cp: any) => cp.platos?.nombre || 'Plato') || [],
        })))
      }

      // Promos
      const { data: promosData } = await supabase
        .from('promos')
        .select('*, promo_platos(plato_id, platos(nombre))')
        .eq('restaurante_id', rest.id)
        .eq('activo', true)

      if (promosData) {
        setPromosPublico(promosData.map((p: any) => ({
          id: p.id,
          nombre: p.nombre,
          tipo: p.tipo,
          valor: p.valor,
          dias: p.dias || [],
          platos: p.promo_platos?.map((pp: any) => pp.platos?.nombre || 'Plato') || [],
          platosIds: p.promo_platos?.map((pp: any) => pp.plato_id) || [],
        })))
      }

      setCargando(false)
    }
    cargar()
  }, [slug])
  useEffect(() => {
    if (!platoDetalle || !restaurante) return
    setResenasReales([])
    // Registrar vista del plato
    const supabaseVista = createClient()
    const fechaCOL = new Date(new Date().getTime() - 5 * 60 * 60 * 1000).toISOString().split('T')[0]
    supabaseVista.from('vistas_platos').insert({
      plato_id: platoDetalle,
      restaurante_id: restaurante.id,
      fecha: fechaCOL,
    }).then(({ error }: any) => {
      
    })
    const supabase = createClient()
    supabase.from('calificaciones')
      .select('*')
      .eq('plato_id', platoDetalle)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }: any) => {
        if (data) setResenasReales(data)
        else setResenasReales([])
      })
  }, [platoDetalle, restaurante])

  const color = restaurante?.color_principal || '#E85D24'
  const planRest = restaurante?.plan || 'gratis'
  const esProPublico = planRest === 'pro'
  const esBasicoPublico = planRest === 'basico' || planRest === 'pro'
  const todosLosPlatos = [
    ...categorias.flatMap((c: any) => c.platos),
    ...combosPublico.map((c: any) => ({ id: c.id, nombre: c.nombre, precio: c.precio, descripcion: c.descripcion || '', disponible: true, foto_url: null })),
  ]

  const categoriasFiltradas = busqueda.trim()
    ? categorias.map((cat: any) => ({ ...cat, platos: cat.platos.filter((p: any) => p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.descripcion?.toLowerCase().includes(busqueda.toLowerCase())) })).filter((cat: any) => cat.platos.length > 0)
    : categorias

  function agregarAlPedido(platoId: string) { setPedido({ ...pedido, [platoId]: (pedido[platoId] || 0) + 1 }) }
  function quitarDelPedido(platoId: string) {
    const c = (pedido[platoId] || 0) - 1
    if (c <= 0) { const n = { ...pedido }; delete n[platoId]; setPedido(n) } else { setPedido({ ...pedido, [platoId]: c }) }
  }

  const itemsPedido = Object.entries(pedido).map(([id, cantidad]) => {
    const plato = todosLosPlatos.find((p: any) => p.id === id)
    const promo = preciosPromo[id]
    return { plato: plato!, cantidad, promo }
  }).filter(i => i.plato)
  const totalPedido = itemsPedido.reduce((sum, i) => sum + (i.promo ? i.promo.precioUnitario : i.plato.precio) * i.cantidad, 0)
  const totalProductos = itemsPedido.reduce((sum, i) => sum + i.cantidad, 0)

  const [sorpresaPlatos, setSorpresaPlatos] = useState<typeof todosLosPlatos>([])
  function sorprendeme() {
    const d = todosLosPlatos.filter((p: any) => p.disponible)
    if (d.length < 3) return
    setSorpresaPlatos([...d].sort(() => Math.random() - 0.5).slice(0, 3))
    setMostrarSorpresa(true)
  }

  function pedirPorWhatsApp() {
    // Registrar pedido
    const supabasePedido = createClient()
    supabasePedido.from('pedidos_whatsapp').insert({
      restaurante_id: restaurante.id,
      origen: esQR ? 'qr' : 'enlace',
      mesa: qrMesa || null,
      fecha: new Date(new Date().getTime() - 5 * 60 * 60 * 1000).toISOString().split('T')[0],
      total: totalPedido,
      nota: nota || null,
      productos: itemsPedido.map(i => ({ nombre: i.plato.nombre, cantidad: i.cantidad, precio: i.plato.precio })),
    }).then(({ error }: any) => {
      
    })
    const lineas = itemsPedido.map(i => {
      const precioUnit = i.promo ? i.promo.precioUnitario : i.plato.precio
      const etiqueta = i.promo ? ` (${i.promo.etiqueta})` : ''
      return `- ${i.cantidad} ${i.plato.nombre}${etiqueta} $${(precioUnit * i.cantidad).toLocaleString('es-CO')}`
    })
    let msg = `Hola! Vi tu menú en ${restaurante.nombre} y quiero pedir:\n${lineas.join('\n')}`
    if (nota) msg += `\nNota: ${nota}`
    msg += `\nTotal: $${totalPedido.toLocaleString('es-CO')}`
    window.open(`https://wa.me/57${restaurante.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  function Qty({ id }: { id: string }) {
    const c = pedido[id] || 0
    return c > 0 ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div onClick={(e) => { e.stopPropagation(); quitarDelPedido(id) }} style={{ width: '26px', height: '26px', borderRadius: '50%', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', cursor: 'pointer', color: 'var(--text-secondary)' }}>-</div>
        <span style={{ fontSize: '14px', fontWeight: 500, minWidth: '16px', textAlign: 'center' }}>{c}</span>
        <div onClick={(e) => { e.stopPropagation(); agregarAlPedido(id) }} style={{ width: '26px', height: '26px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', cursor: 'pointer' }}>+</div>
      </div>
    ) : (
      <div onClick={(e) => { e.stopPropagation(); agregarAlPedido(id) }} style={{ width: '26px', height: '26px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', cursor: 'pointer' }}>+</div>
    )
  }

  const [resenasReales, setResenasReales] = useState<any[]>([])
  
  if (cargando) {
    return (
      <div style={{ background: '#FDFBF7', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 500, fontFamily: 'var(--font-display)' }}>Menu<span style={{ color: '#E85D24' }}>App</span></div>
          <div style={{ fontSize: '13px', color: '#999', marginTop: '8px' }}>Cargando menú...</div>
        </div>
      </div>
    )
  }

  if (!restaurante) {
    return (
      <div style={{ background: '#FDFBF7', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🍽️</div>
          <div style={{ fontSize: '18px', fontWeight: 500 }}>Restaurante no encontrado</div>
          <div style={{ fontSize: '13px', color: '#999', marginTop: '8px' }}>Verifica el enlace e intenta de nuevo</div>
        </div>
      </div>
    )
  }
  return (
    <div style={{ background: '#FDFBF7', minHeight: '100vh' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto', paddingBottom: totalProductos > 0 ? '140px' : '20px' }}>
        {/* Presentación del restaurante (solo enlace web) */}
        {!mostrarMenu && (
          <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Portada */}
            <div style={{
              height: '240px',
              background: restaurante.banner_url ? `url(${restaurante.banner_url}) center/cover` : `linear-gradient(135deg, ${color} 0%, ${color}AA 50%, ${color}66 100%)`,
              position: 'relative', display: 'flex', alignItems: 'flex-end',
            }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%)' }} />
              <div style={{ position: 'relative', padding: '20px', width: '100%' }}>
                <div style={{
                  width: '64px', height: '64px', borderRadius: '16px', background: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '22px', fontWeight: 600, color: color, marginBottom: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)', overflow: 'hidden',
                }}>
                  {restaurante.logo_url ? (
                    <img src={restaurante.logo_url} alt={restaurante.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : restaurante.nombre.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ fontSize: '24px', fontWeight: 600, color: 'white', marginBottom: '4px' }}>{restaurante.nombre}</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)' }}>{restaurante.tipo} · {restaurante.ciudad}</div>
              </div>
            </div>

            {/* Info */}
            <div style={{ padding: '20px', flex: 1 }}>
              {/* Descripción */}
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>
                {restaurante?.descripcion || ''}
              </div>

              {/* Horario */}
              {horariosRest.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Horario</div>
                  <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: '10px', overflow: 'hidden' }}>
                    {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((dia: string, i: number) => {
                      const h = horariosRest.find((x: any) => x.dia === dia)
                      if (!h) return null
                      return (
                        <div key={dia} style={{
                          padding: '10px 14px', display: 'flex', justifyContent: 'space-between',
                          borderBottom: i < 6 ? '1px solid var(--border-light)' : 'none',
                          fontSize: '13px',
                        }}>
                          <span>{dia}</span>
                          <span style={{ color: h.cerrado ? 'var(--color-danger)' : 'var(--text-secondary)' }}>
                            {h.cerrado ? 'Cerrado' : `${h.hora_apertura} — ${h.hora_cierre}`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Dirección */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Ubicación</div>
                {restaurante.direccion && (
                  <div onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(restaurante.direccion + ', ' + restaurante.ciudad)}`, '_blank')}
                    style={{
                      background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
                      borderRadius: '10px', padding: '14px', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                    <div>
                      <div style={{ fontSize: '13px' }}>{restaurante.direccion}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{restaurante.ciudad}</div>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--color-info)' }}>Ver mapa →</span>
                  </div>
                )}
              </div>

              {/* WhatsApp info */}
              {config?.whatsapp_activo && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
                    borderRadius: '10px', padding: '14px', display: 'flex', alignItems: 'center', gap: '10px',
                  }}>
                    <span style={{ fontSize: '20px' }}>💬</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>Pedidos por WhatsApp</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Arma tu pedido en el menú y envíalo directo</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Botón ver menú */}
              <div onClick={() => setMostrarMenu(true)} style={{
                background: color, color: 'white', borderRadius: '14px',
                padding: '16px', textAlign: 'center', fontSize: '16px', fontWeight: 500,
                cursor: 'pointer', boxShadow: `0 4px 20px ${color}40`,
              }}>
                Ver menú
              </div>

              {/* Powered by */}
              <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                Menú creado con <span style={{ fontWeight: 500 }}>MenuApp</span>
              </div>
            </div>
          </div>
        )}
        {mostrarMenu && (<>
        {/* Banner */}
        <div style={{ height: '100px', background: restaurante.banner_url ? `url(${restaurante.banner_url}) center/cover` : `linear-gradient(135deg, ${color} 0%, ${color}CC 100%)`, position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(253,251,247,1) 0%, transparent 80%)' }} />
          <div style={{ position: 'relative', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '12px', flexShrink: 0, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 600, color: color, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
              {restaurante.logo_url ? (
                <img src={restaurante.logo_url} alt={restaurante.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : restaurante.nombre.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: '17px', fontWeight: 600 }}>{restaurante.nombre}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{restaurante.tipo} · {restaurante.ciudad}</div>
            </div>
          </div>
        </div>

        {/* Buscador */}
        <div style={{ padding: '12px 16px 8px' }}>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en el menú..."
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-light)', borderRadius: '8px', fontSize: '13px', fontFamily: 'var(--font-body)', background: 'var(--bg-secondary)', outline: 'none' }} />
          {busqueda.trim() && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{categoriasFiltradas.reduce((s, c) => s + c.platos.length, 0)} resultados</span>
              <span onClick={() => setBusqueda('')} style={{ fontSize: '11px', color: color, cursor: 'pointer' }}>Limpiar</span>
            </div>
          )}
        </div>

        {/* Filtros */}
        <div style={{ padding: '4px 16px 10px', display: 'flex', gap: '6px', overflowX: 'auto' }}>
          <div onClick={() => setCategoriaAbierta(categoriaAbierta ? null : 'open')} style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 500, background: color, color: 'white', cursor: 'pointer', whiteSpace: 'nowrap' }}>Categorías ↓</div>
          {esProPublico && config?.combos_activo && combosPublico.length > 0 && <div onClick={() => setMostrarCombos(!mostrarCombos)} style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '11px', border: mostrarCombos ? 'none' : '1px solid var(--border-light)', color: mostrarCombos ? 'white' : 'var(--text-secondary)', background: mostrarCombos ? color : 'var(--bg-secondary)', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s' }}>Combos</div>}
          {esProPublico && config?.promos_activo && promosPublico.length > 0 && <div onClick={() => setMostrarPromos(!mostrarPromos)} style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '11px', border: mostrarPromos ? 'none' : '1px solid var(--border-light)', color: mostrarPromos ? 'white' : 'var(--text-secondary)', background: mostrarPromos ? color : 'var(--bg-secondary)', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s' }}>Promos</div>}
        </div>

        {/* Dropdown categorías */}
        {categoriaAbierta && (
          <div style={{ padding: '0 16px 10px' }}>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
              {categorias.map((cat: any, i: number) => (
                <div key={cat.id} onClick={() => { setCategoriaAbierta(null); document.getElementById(cat.id)?.scrollIntoView({ behavior: 'smooth' }) }}
                  style={{ padding: '10px 14px', fontSize: '13px', cursor: 'pointer', borderBottom: i < categorias.length - 1 ? '1px solid var(--border-light)' : 'none', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{cat.nombre}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{cat.platos.filter((p: any) => p.disponible).length}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plato del día */}
        {esProPublico && config?.plato_dia_activo && platoDia && !busqueda.trim() && (
          <div style={{ padding: '0 16px 10px' }}>
            <div style={{ background: `${color}10`, border: `1px solid ${color}30`, borderRadius: '10px', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 500, color: color }}>⏰ PLATO DEL DÍA</span>
                <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Hasta las {platoDia.horaFin}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>{platoDia.nombre}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{platoDia.descripcion}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'line-through' }}>${platoDia.precio.toLocaleString('es-CO')}</span>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: color }}>${platoDia.precioEspecial.toLocaleString('es-CO')}</span>
                  </div>
                </div>
                <Qty id={platoDia.id} />
              </div>
            </div>
          </div>
        )}

        {/* Sorpréndeme botón */}
        {config?.sorprendeme_activo && !busqueda.trim() && (
          <div style={{ padding: '0 16px 10px' }}>
            <div onClick={sorprendeme} style={{
              border: mostrarSorpresa ? `1px solid ${color}` : '1px dashed var(--border-medium)',
              borderRadius: '10px', padding: '12px', textAlign: 'center', cursor: 'pointer',
              background: mostrarSorpresa ? `${color}08` : 'transparent',
            }}>
              <span style={{ fontSize: '13px', color: mostrarSorpresa ? color : 'var(--text-secondary)' }}>
                🎲 {mostrarSorpresa ? 'Generar otra combinación' : 'Sorpréndeme — ¿No sabes qué pedir?'}
              </span>
            </div>
          </div>
        )}

        {/* Sorpréndeme resultado */}
        {mostrarSorpresa && (
          <div style={{ padding: '0 16px 14px' }}>
            <div style={{ background: `${color}08`, border: `1px solid ${color}20`, borderRadius: '10px', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: color }}>🎲 Tu combinación</span>
                <span onClick={() => setMostrarSorpresa(false)} style={{ fontSize: '11px', color: 'var(--text-tertiary)', cursor: 'pointer' }}>✕ Cerrar</span>
              </div>
              {sorpresaPlatos.map((plato: any) => (
                <div key={plato.id} onClick={() => setPlatoDetalle(plato.id)} style={{
                  background: 'var(--bg-secondary)', borderRadius: '8px', padding: '10px',
                  display: 'flex', gap: '10px', marginBottom: '6px', border: '1px solid var(--border-light)', cursor: 'pointer',
                }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '8px', flexShrink: 0, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 500, color: color, overflow: 'hidden' }}>
                    {plato.foto_url ? (
                      <img src={plato.foto_url} alt={plato.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : plato.nombre.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{plato.nombre}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{plato.descripcion}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>${plato.precio.toLocaleString('es-CO')}</span>
                      <Qty id={plato.id} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Combos */}
        {esProPublico && mostrarCombos && combosPublico.length > 0 && !busqueda.trim() && (
          <div id="combos-section" style={{ padding: '0 16px', marginBottom: '14px' }}>
            <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px', paddingTop: '4px' }}>🍱 Combos</div>
            {combosPublico.map((combo: any) => (
              <div key={combo.id} style={{
                background: 'var(--bg-secondary)', border: `1px solid ${color}30`,
                borderRadius: '10px', padding: '12px', marginBottom: '8px',
              }}>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>{combo.nombre}</div>
                {combo.descripcion && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{combo.descripcion}</div>}
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{combo.platos.join(' + ')}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 500, color: color }}>${combo.precio.toLocaleString('es-CO')}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'line-through' }}>${combo.precioIndividual.toLocaleString('es-CO')}</span>
                    <span style={{ fontSize: '11px', color: 'var(--color-green)', fontWeight: 500 }}>-${(combo.precioIndividual - combo.precio).toLocaleString('es-CO')}</span>
                  </div>
                  <Qty id={combo.id} />
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Promos */}
        {mostrarPromos && promosPublico.length > 0 && !busqueda.trim() && (
          <div style={{ padding: '0 16px', marginBottom: '14px' }}>
            <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px', paddingTop: '4px' }}>🏷️ Promociones</div>
            {promosPublico.map((promo: any) => {
              const diasTexto = promo.dias.map((d: string) => {
                const nombres: Record<string, string> = { lun: 'Lunes', mar: 'Martes', mie: 'Miércoles', jue: 'Jueves', vie: 'Viernes', sab: 'Sábado', dom: 'Domingo' }
                return nombres[d] || d
              }).join(', ')
              return (
                <div key={promo.id} onClick={() => { setPromoDetalle(promo); setPromoSeleccion([]) }} style={{
                  background: 'var(--bg-secondary)', border: `1px solid ${color}30`,
                  borderRadius: '10px', padding: '12px', marginBottom: '8px', cursor: 'pointer',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>{promo.nombre}</div>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'white', background: color, padding: '3px 10px', borderRadius: '12px' }}>
                      {promo.tipo === 'dos_por_uno' ? '2x1' : promo.tipo === 'descuento' ? `${promo.valor}% OFF` : `$${parseInt(promo.valor || '0').toLocaleString('es-CO')}`}
                    </span>
                  </div>
                  {promo.platos && promo.platos.length > 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>Aplica en: {promo.platos.join(', ')}</div>
                  )}
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{diasTexto}</div>
                  <div style={{ fontSize: '11px', color: color, marginTop: '6px', fontWeight: 500 }}>Toca para ver platos →</div>
                </div>
              )
            })}
          </div>
        )}

        {/* Modal detalle promo */}
        {promoDetalle && (() => {
          const platosPromo = categorias.flatMap((c: any) => c.platos).filter((p: any) => 
            promoDetalle.platosIds ? promoDetalle.platosIds.includes(p.id) : promoDetalle.platos?.includes(p.nombre)
          )

          function agregarPromoAlPedido() {
            if (promoSeleccion.length === 0) return
            const nuevoPedido = { ...pedido }
            const nuevosPrecios = { ...preciosPromo }

            promoSeleccion.forEach(platoId => {
              const plato = platosPromo.find((p: any) => p.id === platoId)
              if (!plato) return

              if (promoDetalle.tipo === 'dos_por_uno') {
                // 2x1: agrega 2 unidades, cobra solo 1
                nuevoPedido[platoId] = (nuevoPedido[platoId] || 0) + 2
                nuevosPrecios[platoId] = { precioUnitario: Math.round(plato.precio / 2), etiqueta: '2x1' }
              } else if (promoDetalle.tipo === 'descuento') {
                const precioDesc = Math.round(plato.precio * (1 - (promoDetalle.valor || 0) / 100))
                nuevoPedido[platoId] = (nuevoPedido[platoId] || 0) + 1
                nuevosPrecios[platoId] = { precioUnitario: precioDesc, etiqueta: `${promoDetalle.valor}% OFF` }
              } else if (promoDetalle.tipo === 'precio_especial') {
                nuevoPedido[platoId] = (nuevoPedido[platoId] || 0) + 1
                nuevosPrecios[platoId] = { precioUnitario: promoDetalle.valor, etiqueta: 'Precio especial' }
              }
            })

            setPedido(nuevoPedido)
            setPreciosPromo(nuevosPrecios)
            setPromoDetalle(null)
          }

          return (
            <>
              <div onClick={() => setPromoDetalle(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60 }} />
              <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 70, background: 'var(--bg-secondary)', borderRadius: '16px 16px 0 0', maxHeight: '80vh', overflowY: 'auto', animation: 'slideUp 0.3s ease' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '16px', fontWeight: 500 }}>{promoDetalle.nombre}</span>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'white', background: color, padding: '2px 8px', borderRadius: '10px', marginLeft: '8px' }}>
                      {promoDetalle.tipo === 'dos_por_uno' ? '2x1' : promoDetalle.tipo === 'descuento' ? `${promoDetalle.valor}% OFF` : `$${parseInt(promoDetalle.valor || '0').toLocaleString('es-CO')}`}
                    </span>
                  </div>
                  <span onClick={() => setPromoDetalle(null)} style={{ fontSize: '18px', color: 'var(--text-tertiary)', cursor: 'pointer' }}>✕</span>
                </div>

                <div style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    {promoDetalle.tipo === 'dos_por_uno' && 'Selecciona un plato y lleva 2 por el precio de 1'}
                    {promoDetalle.tipo === 'descuento' && `Selecciona los platos con ${promoDetalle.valor}% de descuento`}
                    {promoDetalle.tipo === 'precio_especial' && `Platos a precio especial de $${parseInt(promoDetalle.valor || '0').toLocaleString('es-CO')}`}
                  </div>

                  {platosPromo.map((plato: any) => {
                    const seleccionado = promoSeleccion.includes(plato.id)
                    const maxSeleccion = promoDetalle.tipo === 'dos_por_uno' ? 1 : platosPromo.length
                    const puedeSeleccionar = seleccionado || promoSeleccion.length < maxSeleccion

                    return (
                      <div key={plato.id} onClick={() => {
                        if (seleccionado) {
                          setPromoSeleccion(promoSeleccion.filter(id => id !== plato.id))
                        } else if (puedeSeleccionar) {
                          if (promoDetalle.tipo === 'dos_por_uno') {
                            setPromoSeleccion([plato.id])
                          } else {
                            setPromoSeleccion([...promoSeleccion, plato.id])
                          }
                        }
                      }} style={{
                        padding: '12px', borderRadius: '10px', marginBottom: '8px', cursor: puedeSeleccionar || seleccionado ? 'pointer' : 'default',
                        border: seleccionado ? `2px solid ${color}` : '1px solid var(--border-light)',
                        background: seleccionado ? `${color}08` : 'var(--bg-primary)',
                        opacity: !puedeSeleccionar && !seleccionado ? 0.4 : 1,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                            {plato.foto_url ? (
                              <img src={plato.foto_url} alt={plato.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : <span style={{ fontSize: '16px', color: color }}>{plato.nombre.charAt(0)}</span>}
                          </div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 500 }}>{plato.nombre}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                              {promoDetalle.tipo === 'dos_por_uno' ? (
                                <>
                                  <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'line-through' }}>${(plato.precio * 2).toLocaleString('es-CO')}</span>
                                  <span style={{ fontSize: '13px', fontWeight: 500, color: color }}>${plato.precio.toLocaleString('es-CO')}</span>
                                  <span style={{ fontSize: '10px', color: 'var(--color-green)', fontWeight: 500 }}>× 2 unidades</span>
                                </>
                              ) : promoDetalle.tipo === 'descuento' ? (
                                <>
                                  <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'line-through' }}>${plato.precio.toLocaleString('es-CO')}</span>
                                  <span style={{ fontSize: '13px', fontWeight: 500, color: color }}>${Math.round(plato.precio * (1 - (promoDetalle.valor || 0) / 100)).toLocaleString('es-CO')}</span>
                                </>
                              ) : (
                                <>
                                  <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'line-through' }}>${plato.precio.toLocaleString('es-CO')}</span>
                                  <span style={{ fontSize: '13px', fontWeight: 500, color: color }}>${parseInt(promoDetalle.valor || '0').toLocaleString('es-CO')}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div style={{
                          width: '24px', height: '24px', borderRadius: '50%',
                          border: seleccionado ? 'none' : '2px solid var(--border-light)',
                          background: seleccionado ? color : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {seleccionado && <span style={{ color: 'white', fontSize: '14px' }}>✓</span>}
                        </div>
                      </div>
                    )
                  })}

                  {promoSeleccion.length > 0 && (
                    <div onClick={agregarPromoAlPedido} style={{
                      background: color, color: 'white', borderRadius: '12px',
                      padding: '16px', textAlign: 'center', fontSize: '15px',
                      fontWeight: 500, cursor: 'pointer', marginTop: '12px',
                    }}>
                      Agregar al pedido
                    </div>
                  )}
                </div>
              </div>
            </>
          )
        })()}
        {/* Categorías y platos */}
        {categoriasFiltradas.map((cat: any) => (
          <div key={cat.id} id={cat.id} style={{ padding: '0 16px', marginBottom: '14px' }}>
            <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px', paddingTop: '4px' }}>{cat.nombre}</div>
            {cat.platos.map((plato: any) => (
              <div key={plato.id} style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
                borderRadius: '10px', padding: '10px', display: 'flex', gap: '10px',
                marginBottom: '8px', opacity: plato.disponible ? 1 : 0.4,
              }}>
                <div onClick={() => plato.disponible && setPlatoDetalle(plato.id)} style={{
                  width: '64px', height: '64px', borderRadius: '8px', flexShrink: 0, cursor: plato.disponible ? 'pointer' : 'default',
                  background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 500, color: color,
                  overflow: 'hidden',
                }}>
                  {esBasicoPublico && plato.foto_url ? (
                    <img src={plato.foto_url} alt={plato.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : plato.nombre.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div onClick={() => plato.disponible && setPlatoDetalle(plato.id)} style={{ cursor: plato.disponible ? 'pointer' : 'default' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{plato.nombre}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{plato.descripcion}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>${plato.precio.toLocaleString('es-CO')}</span>
                      {config?.calificaciones_activo && <span style={{ fontSize: '10px', color: '#F2A623' }}>★ {plato.estrellas}</span>}
                    </div>
                    {plato.disponible ? <Qty id={plato.id} /> : <span style={{ fontSize: '10px', color: 'var(--color-danger)', fontWeight: 500 }}>Agotado</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Bandeja flotante */}
        {totalProductos > 0 && !mostrarPedido && !platoDetalle && (
          <div onClick={() => setMostrarPedido(true)} style={{
            position: 'fixed', bottom: '16px', left: '16px', right: '16px', maxWidth: '468px', margin: '0 auto',
            background: 'var(--text-primary)', borderRadius: '14px', padding: '14px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            zIndex: 40, cursor: 'pointer', boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
          }}>
            <div style={{ color: 'white' }}>
              <div style={{ fontSize: '14px', fontWeight: 500 }}>{totalProductos} producto{totalProductos > 1 ? 's' : ''}</div>
              <div style={{ fontSize: '10px', opacity: 0.6 }}>{itemsPedido.map(i => `${i.cantidad} ${i.plato.nombre}`).join(' + ')}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: 'white', fontWeight: 500 }}>${totalPedido.toLocaleString('es-CO')}</span>
              <div style={{ background: 'white', color: 'var(--text-primary)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600 }}>Ver pedido</div>
            </div>
          </div>
        )}

        {/* Modal ver pedido */}
        {mostrarPedido && (
          <>
            <div onClick={() => setMostrarPedido(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60 }} />
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 70, background: 'var(--bg-secondary)', borderRadius: '16px 16px 0 0', maxHeight: '80vh', overflowY: 'auto', animation: 'slideUp 0.3s ease' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '16px', fontWeight: 500 }}>Tu pedido</span>
                <span onClick={() => setMostrarPedido(false)} style={{ fontSize: '18px', color: 'var(--text-tertiary)', cursor: 'pointer' }}>✕</span>
              </div>
              {esQR && <div style={{ padding: '12px 20px', background: 'var(--color-info-light)', fontSize: '12px', color: 'var(--color-info)' }}>Mesa {qrMesa?.replace('mesa', '')} · Muéstrale este resumen al mesero</div>}
              <div style={{ padding: '16px 20px' }}>
                {itemsPedido.map((item: any) => (
                  <div key={item.plato.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>{item.plato.nombre}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {item.promo ? (
                          <><span style={{ textDecoration: 'line-through', marginRight: '4px' }}>${item.plato.precio.toLocaleString('es-CO')}</span><span style={{ color: color, fontWeight: 500 }}>${item.promo.precioUnitario.toLocaleString('es-CO')} c/u</span> <span style={{ fontSize: '10px', color: 'var(--color-green)' }}>({item.promo.etiqueta})</span></>
                        ) : `$${item.plato.precio.toLocaleString('es-CO')} c/u`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div onClick={() => quitarDelPedido(item.plato.id)} style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', cursor: 'pointer' }}>-</div>
                      <span style={{ fontSize: '14px', fontWeight: 500, minWidth: '16px', textAlign: 'center' }}>{item.cantidad}</span>
                      <div onClick={() => agregarAlPedido(item.plato.id)} style={{ width: '24px', height: '24px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', cursor: 'pointer' }}>+</div>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 500, minWidth: '70px', textAlign: 'right' }}>${((item.promo ? item.promo.precioUnitario : item.plato.precio) * item.cantidad).toLocaleString('es-CO')}</div>
                  </div>
                ))}
                <div style={{ marginTop: '14px' }}>
                  <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder={esQR ? 'Nota para el mesero (opcional)' : 'Nota para el restaurante (opcional)'}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-light)', borderRadius: '8px', fontSize: '13px', fontFamily: 'var(--font-body)', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '15px', fontWeight: 500 }}>Total</span>
                  <span style={{ fontSize: '20px', fontWeight: 500 }}>${totalPedido.toLocaleString('es-CO')}</span>
                </div>
                {esQR ? (
                  <div style={{ marginTop: '16px', textAlign: 'center' }}>
                    <div style={{ background: 'var(--text-primary)', color: 'white', borderRadius: '12px', padding: '16px', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}>Mostrar al mesero</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '8px' }}>El mesero tomará tu pedido desde esta pantalla</div>
                  </div>
                ) : config?.whatsapp_activo ? (
                  <div style={{ marginTop: '16px', textAlign: 'center' }}>
                    <div onClick={pedirPorWhatsApp} style={{ background: '#25D366', color: 'white', borderRadius: '12px', padding: '16px', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}>Pedir por WhatsApp</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '8px' }}>Se abrirá WhatsApp con tu pedido listo</div>
                  </div>
                ) : (
                  <div style={{ marginTop: '16px', textAlign: 'center' }}>
                    <div style={{ background: 'var(--text-primary)', color: 'white', borderRadius: '12px', padding: '16px', fontSize: '15px', fontWeight: 500 }}>Muestra este resumen en caja</div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        {/* Modal calificar plato */}
        {platoCalificar && (() => {
          const plato = todosLosPlatos.find((p: any) => p.id === platoCalificar)
          if (!plato) return null
          const tagsDisponibles = [
            { id: 'buena_porcion', label: 'Buena porción' },
            { id: 'buen_sabor', label: 'Buen sabor' },
            { id: 'buena_presentacion', label: 'Buena presentación' },
            { id: 'buen_precio', label: 'Buen precio' },
            { id: 'rapido', label: 'Rápido' },
            { id: 'fresco', label: 'Fresco' },
          ]
          const textoEstrellas = ['', 'Malo', 'Regular', 'Bueno', 'Muy bueno', 'Excelente']

          function toggleTag(id: string) {
            setCalTags(calTags.includes(id) ? calTags.filter(t => t !== id) : [...calTags, id])
          }

          async function enviarCalificacion() {
            if (calEstrellas === 0) return
            const supabase = createClient()
            await supabase.from('calificaciones').insert({
              plato_id: plato.id,
              restaurante_id: restaurante.id,
              estrellas: calEstrellas,
              tags: calTags,
              comentario: calComentario || null,
            })
            setCalEnviada(true)
            setTimeout(() => { setPlatoCalificar(null); setCalEnviada(false) }, 2000)
          }

          if (calEnviada) {
            return (
              <>
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60 }} />
                <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 70, background: 'var(--bg-secondary)', borderRadius: '16px 16px 0 0', padding: '40px 20px', textAlign: 'center', animation: 'slideUp 0.3s ease' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>✓</div>
                  <div style={{ fontSize: '18px', fontWeight: 500, marginBottom: '6px' }}>¡Gracias!</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Tu calificación ayuda a otros comensales</div>
                </div>
              </>
            )
          }

          return (
            <>
              <div onClick={() => setPlatoCalificar(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60 }} />
              <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 70, background: 'var(--bg-secondary)', borderRadius: '16px 16px 0 0', maxHeight: '85vh', overflowY: 'auto', animation: 'slideUp 0.3s ease' }}>

                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '16px', fontWeight: 500 }}>Calificar plato</span>
                  <span onClick={() => setPlatoCalificar(null)} style={{ fontSize: '18px', color: 'var(--text-tertiary)', cursor: 'pointer' }}>✕</span>
                </div>

                <div style={{ padding: '16px 20px' }}>

                  {/* Plato que va a calificar */}
                  <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '12px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 500, color: color, flexShrink: 0, overflow: 'hidden' }}>
                      {plato.foto_url ? (
                        <img src={plato.foto_url} alt={plato.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : plato.nombre.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 500 }}>{plato.nombre}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{restaurante.nombre}</div>
                    </div>
                  </div>

                  {/* Estrellas */}
                  <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '12px' }}>¿Qué te pareció?</div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '8px' }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <span key={n} onClick={() => setCalEstrellas(n)} style={{
                          fontSize: '36px', cursor: 'pointer',
                          color: n <= calEstrellas ? '#F2A623' : 'var(--border-light)',
                          transition: 'transform 0.15s',
                          transform: n <= calEstrellas ? 'scale(1.1)' : 'scale(1)',
                        }}>★</span>
                      ))}
                    </div>
                    {calEstrellas > 0 && <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{textoEstrellas[calEstrellas]}</div>}
                  </div>

                  {/* Tags rápidos */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>¿Qué destacas? (opcional)</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {tagsDisponibles.map(tag => (
                        <div key={tag.id} onClick={() => toggleTag(tag.id)} style={{
                          padding: '8px 14px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                          background: calTags.includes(tag.id) ? 'var(--text-primary)' : 'var(--bg-secondary)',
                          color: calTags.includes(tag.id) ? 'white' : 'var(--text-secondary)',
                          border: calTags.includes(tag.id) ? '1px solid var(--text-primary)' : '1px solid var(--border-light)',
                          transition: 'all 0.15s',
                        }}>{tag.label}</div>
                      ))}
                    </div>
                  </div>

                  {/* Comentario */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Comentario (opcional)</div>
                    <div style={{ position: 'relative' }}>
                      <textarea value={calComentario} onChange={(e) => { if (e.target.value.length <= 200) setCalComentario(e.target.value) }}
                        placeholder="Cuéntanos más sobre tu experiencia..."
                        style={{
                          width: '100%', padding: '12px', border: '1px solid var(--border-light)', borderRadius: '10px',
                          fontSize: '13px', fontFamily: 'var(--font-body)', outline: 'none', resize: 'none', minHeight: '80px',
                        }} />
                      <span style={{ position: 'absolute', right: '12px', bottom: '8px', fontSize: '10px', color: calComentario.length > 180 ? 'var(--color-warning)' : 'var(--text-tertiary)' }}>
                        {calComentario.length}/200
                      </span>
                    </div>
                  </div>

                  {/* Enviar */}
                  <div onClick={enviarCalificacion} style={{
                    background: calEstrellas > 0 ? 'var(--text-primary)' : 'var(--border-light)',
                    color: calEstrellas > 0 ? 'white' : 'var(--text-tertiary)',
                    borderRadius: '12px', padding: '16px', textAlign: 'center',
                    fontSize: '15px', fontWeight: 500, cursor: calEstrellas > 0 ? 'pointer' : 'default',
                    marginBottom: '12px',
                  }}>
                    Enviar calificación
                  </div>

                  <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    Tu reseña es anónima y ayuda a otros comensales
                  </div>
                </div>
              </div>
            </>
          )
        })()}
        {/* Modal detalle plato */}
        {platoDetalle && (() => {
          const plato = todosLosPlatos.find((p: any) => p.id === platoDetalle)
          if (!plato) return null
          const cantidadActual = pedido[plato.id] || 0
          const cantidadMostrar = cantidadActual || 1

          
          return (
            <>
              <div onClick={() => setPlatoDetalle(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60 }} />
              <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 70, background: 'var(--bg-secondary)', borderRadius: '16px 16px 0 0', maxHeight: '85vh', overflowY: 'auto', animation: 'slideUp 0.3s ease' }}>
                {/* Foto grande */}
                <div style={{ height: '200px', background: `${color}15`, borderRadius: '16px 16px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                  {esBasicoPublico && plato.foto_url ? (
                    <img src={plato.foto_url} alt={plato.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '60px', fontWeight: 500, color: color, opacity: 0.3 }}>{plato.nombre.charAt(0)}</span>
                  )}
                  <div onClick={() => setPlatoDetalle(null)} style={{ position: 'absolute', top: '12px', right: '12px', width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '16px', cursor: 'pointer' }}>✕</div>
                </div>

                <div style={{ padding: '16px 20px' }}>
                  {/* Nombre y calificación */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 500 }}>{plato.nombre}</div>
                    {config?.calificaciones_activo && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '13px', color: '#F2A623' }}>★</span>
                        <span style={{ fontSize: '14px', fontWeight: 500 }}>{plato.estrellas}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>({plato.resenas})</span>
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>{plato.descripcion}</div>
                  <div style={{ fontSize: '22px', fontWeight: 500, marginBottom: '16px' }}>${plato.precio.toLocaleString('es-CO')}</div>

                  {/* Reseñas */}
                  {config?.calificaciones_activo && (
                    <>
                      <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Reseñas {resenasReales.length > 0 ? `(${resenasReales.length})` : ''}</div>
                      {resenasReales.length > 0 ? (
                        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '10px', overflow: 'hidden', marginBottom: '14px' }}>
                          {resenasReales.map((r: any, i: number) => (
                            <div key={i} style={{ padding: '12px 14px', borderBottom: i < resenasReales.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <div style={{ fontSize: '11px', color: '#F2A623' }}>{'★'.repeat(r.estrellas)}{'☆'.repeat(5 - r.estrellas)}</div>
                                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                                  {new Date(r.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                                </div>
                              </div>
                              {r.tags && r.tags.length > 0 && (
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                  {r.tags.map((t: string, ti: number) => (
                                    <span key={ti} style={{ fontSize: '10px', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)' }}>{t}</span>
                                  ))}
                                </div>
                              )}
                              {r.comentario && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{r.comentario}</div>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '16px', textAlign: 'center', marginBottom: '14px' }}>
                          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Aún no hay reseñas. ¡Sé el primero!</div>
                        </div>
                      )}
                      <div onClick={() => { setPlatoCalificar(plato.id); setPlatoDetalle(null); setCalEstrellas(0); setCalTags([]); setCalComentario(''); setCalEnviada(false) }} style={{ border: '1px dashed var(--border-medium)', borderRadius: '10px', padding: '14px', textAlign: 'center', cursor: 'pointer', marginBottom: '16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 500 }}>Calificar este plato</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Comparte tu experiencia</div>
                      </div>
                    </>
                  )}
                      

                  {/* Agregar al pedido */}
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '10px 14px' }}>
                      <div onClick={() => { if (cantidadActual > 0) quitarDelPedido(plato.id) }} style={{
                        width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--border-light)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', cursor: 'pointer',
                        color: cantidadActual > 0 ? 'var(--text-secondary)' : 'var(--border-light)',
                      }}>-</div>
                      <span style={{ fontSize: '16px', fontWeight: 500, minWidth: '20px', textAlign: 'center' }}>{cantidadMostrar}</span>
                      <div onClick={() => agregarAlPedido(plato.id)} style={{ width: '28px', height: '28px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '16px', cursor: 'pointer' }}>+</div>
                    </div>
                    <div onClick={() => { if (cantidadActual === 0) agregarAlPedido(plato.id); setPlatoDetalle(null) }} style={{
                      flex: 1, background: color, color: 'white', borderRadius: '10px',
                      padding: '14px', textAlign: 'center', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
                    }}>
                      Agregar ${(cantidadMostrar * plato.precio).toLocaleString('es-CO')}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )
        })()}

        {/* Powered by */}
        {!busqueda.trim() && totalProductos === 0 && (
          <div style={{ textAlign: 'center', padding: '20px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
            Menú creado con <span style={{ fontWeight: 500 }}>MenuApp</span>
          </div>
        )}
        </>)}
      </div>
    </div>
  )
}