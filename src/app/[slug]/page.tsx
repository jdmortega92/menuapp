'use client'

import { useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

export default function MenuPublicoPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = params.slug as string
  const qrMesa = searchParams.get('qr')
  const esQR = !!qrMesa

  const [busqueda, setBusqueda] = useState('')
  const [categoriaAbierta, setCategoriaAbierta] = useState<string | null>(null)
  const [pedido, setPedido] = useState<Record<string, number>>({})
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

  const restaurante = {
    nombre: 'La Parrilla de Juan', tipo: 'Restaurante', ciudad: 'Medellín',
    whatsapp: '3001234567', color_principal: '#C0392B', tema: 'claro',
    logo_url: null, foto_portada_url: null,
    descripcion: 'El mejor sabor paisa desde 1998.',
  }

  const config = {
    whatsapp_activo: true, combos_activo: true, promos_activo: true,
    plato_dia_activo: true, calificaciones_activo: true, sorprendeme_activo: true,
  }

  const platoDia = {
    id: 'p5', nombre: 'Ajiaco', precio: 16000, precioEspecial: 12000,
    descripcion: 'Pollo, papa criolla, guascas, mazorca. Receta tradicional bogotana.', horaFin: '3:00 pm',
  }

  const categorias = [
    { id: 'c1', nombre: 'Platos fuertes', platos: [
      { id: 'p1', nombre: 'Bandeja paisa', precio: 18000, descripcion: 'Frijoles, arroz, carne, chicharrón, huevo, tajada, arepa', disponible: true, estrellas: 4.8, resenas: 24 },
      { id: 'p2', nombre: 'Arroz con pollo', precio: 15000, descripcion: 'Arroz, pollo desmechado, verduras, papa criolla', disponible: true, estrellas: 4.5, resenas: 18 },
      { id: 'p3', nombre: 'Cazuela de frijoles', precio: 14000, descripcion: 'Frijoles rojos, arroz, chicharrón, aguacate', disponible: true, estrellas: 4.2, resenas: 12 },
      { id: 'p4', nombre: 'Churrasco', precio: 22000, descripcion: 'Carne a la brasa con papas y ensalada', disponible: false, estrellas: 4.9, resenas: 31 },
    ]},
    { id: 'c2', nombre: 'Sopas', platos: [
      { id: 'p5', nombre: 'Ajiaco', precio: 16000, descripcion: 'Pollo, papa criolla, guascas, mazorca', disponible: true, estrellas: 4.7, resenas: 15 },
      { id: 'p6', nombre: 'Sancocho de res', precio: 15000, descripcion: 'Res, yuca, plátano, papa, cilantro', disponible: true, estrellas: 4.4, resenas: 9 },
    ]},
    { id: 'c3', nombre: 'Bebidas', platos: [
      { id: 'p7', nombre: 'Limonada de coco', precio: 6000, descripcion: 'Limonada con leche de coco y hielo', disponible: true, estrellas: 4.6, resenas: 20 },
      { id: 'p8', nombre: 'Jugo natural', precio: 5000, descripcion: 'Fruta fresca del día', disponible: true, estrellas: 4.3, resenas: 8 },
      { id: 'p9', nombre: 'Agua panela con limón', precio: 3500, descripcion: 'Panela artesanal con limón', disponible: true, estrellas: 4.1, resenas: 5 },
    ]},
    { id: 'c4', nombre: 'Postres', platos: [
      { id: 'p10', nombre: 'Arroz con leche', precio: 5000, descripcion: 'Receta de la abuela con canela', disponible: true, estrellas: 4.5, resenas: 11 },
      { id: 'p11', nombre: 'Natilla', precio: 4500, descripcion: 'Natilla artesanal con coco rallado', disponible: true, estrellas: 4.0, resenas: 6 },
    ]},
  ]

  const color = restaurante.color_principal
  const todosLosPlatos = categorias.flatMap(c => c.platos)

  const categoriasFiltradas = busqueda.trim()
    ? categorias.map(cat => ({ ...cat, platos: cat.platos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.descripcion?.toLowerCase().includes(busqueda.toLowerCase())) })).filter(cat => cat.platos.length > 0)
    : categorias

  function agregarAlPedido(platoId: string) { setPedido({ ...pedido, [platoId]: (pedido[platoId] || 0) + 1 }) }
  function quitarDelPedido(platoId: string) {
    const c = (pedido[platoId] || 0) - 1
    if (c <= 0) { const n = { ...pedido }; delete n[platoId]; setPedido(n) } else { setPedido({ ...pedido, [platoId]: c }) }
  }

  const itemsPedido = Object.entries(pedido).map(([id, cantidad]) => ({ plato: todosLosPlatos.find(p => p.id === id)!, cantidad })).filter(i => i.plato)
  const totalPedido = itemsPedido.reduce((sum, i) => sum + i.plato.precio * i.cantidad, 0)
  const totalProductos = itemsPedido.reduce((sum, i) => sum + i.cantidad, 0)

  const [sorpresaPlatos, setSorpresaPlatos] = useState<typeof todosLosPlatos>([])
  function sorprendeme() {
    const d = todosLosPlatos.filter(p => p.disponible)
    if (d.length < 3) return
    setSorpresaPlatos([...d].sort(() => Math.random() - 0.5).slice(0, 3))
    setMostrarSorpresa(true)
  }

  function pedirPorWhatsApp() {
    const lineas = itemsPedido.map(i => `- ${i.cantidad} ${i.plato.nombre} $${(i.plato.precio * i.cantidad).toLocaleString('es-CO')}`)
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

  const resenasDemo = [
    { estrellas: 5, comentario: 'Excelente porción, muy completa', tiempo: 'Hace 2 horas' },
    { estrellas: 4, comentario: 'Muy buena, le pondría más aguacate', tiempo: 'Ayer' },
    { estrellas: 5, comentario: 'La mejor del barrio, siempre vengo por ella', tiempo: 'Hace 3 días' },
  ]

  return (
    <div style={{ background: '#FDFBF7', minHeight: '100vh' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto', paddingBottom: totalProductos > 0 ? '140px' : '20px' }}>
        {/* Presentación del restaurante (solo enlace web) */}
        {!mostrarMenu && (
          <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Portada */}
            <div style={{
              height: '240px', background: `linear-gradient(135deg, ${color} 0%, ${color}AA 50%, ${color}66 100%)`,
              position: 'relative', display: 'flex', alignItems: 'flex-end',
            }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%)' }} />
              <div style={{ position: 'relative', padding: '20px', width: '100%' }}>
                <div style={{
                  width: '64px', height: '64px', borderRadius: '16px', background: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '22px', fontWeight: 600, color: color, marginBottom: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                }}>
                  {restaurante.nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ fontSize: '24px', fontWeight: 600, color: 'white', marginBottom: '4px' }}>{restaurante.nombre}</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)' }}>{restaurante.tipo} · {restaurante.ciudad}</div>
              </div>
            </div>

            {/* Info */}
            <div style={{ padding: '20px', flex: 1 }}>
              {/* Descripción */}
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>
                {restaurante.descripcion}
              </div>

              {/* Horario */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Horario</div>
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: '10px', overflow: 'hidden' }}>
                  {[
                    { dia: 'Lunes a Viernes', hora: '11:00 am — 9:00 pm' },
                    { dia: 'Sábado', hora: '11:00 am — 10:00 pm' },
                    { dia: 'Domingo', hora: '11:00 am — 4:00 pm' },
                  ].map((h, i) => (
                    <div key={i} style={{
                      padding: '10px 14px', display: 'flex', justifyContent: 'space-between',
                      borderBottom: i < 2 ? '1px solid var(--border-light)' : 'none',
                      fontSize: '13px',
                    }}>
                      <span>{h.dia}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{h.hora}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dirección */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Ubicación</div>
                <div style={{
                  background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
                  borderRadius: '10px', padding: '14px',
                }}>
                  <div style={{ fontSize: '13px' }}>Cra 70 #45-12, Laureles</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{restaurante.ciudad}</div>
                </div>
              </div>

              {/* WhatsApp info */}
              {config.whatsapp_activo && (
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
        <div style={{ height: '100px', background: `linear-gradient(135deg, ${color} 0%, ${color}CC 100%)`, position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(253,251,247,1) 0%, transparent 80%)' }} />
          <div style={{ position: 'relative', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '12px', flexShrink: 0, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 600, color: color, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
              {restaurante.nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
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
          {config.combos_activo && <div style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '11px', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Combos</div>}
          {config.promos_activo && <div style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '11px', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Promos</div>}
        </div>

        {/* Dropdown categorías */}
        {categoriaAbierta && (
          <div style={{ padding: '0 16px 10px' }}>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
              {categorias.map((cat, i) => (
                <div key={cat.id} onClick={() => { setCategoriaAbierta(null); document.getElementById(cat.id)?.scrollIntoView({ behavior: 'smooth' }) }}
                  style={{ padding: '10px 14px', fontSize: '13px', cursor: 'pointer', borderBottom: i < categorias.length - 1 ? '1px solid var(--border-light)' : 'none', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{cat.nombre}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{cat.platos.filter(p => p.disponible).length}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plato del día */}
        {config.plato_dia_activo && !busqueda.trim() && (
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
        {config.sorprendeme_activo && !busqueda.trim() && (
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
              {sorpresaPlatos.map((plato) => (
                <div key={plato.id} onClick={() => setPlatoDetalle(plato.id)} style={{
                  background: 'var(--bg-secondary)', borderRadius: '8px', padding: '10px',
                  display: 'flex', gap: '10px', marginBottom: '6px', border: '1px solid var(--border-light)', cursor: 'pointer',
                }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '8px', flexShrink: 0, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 500, color: color }}>{plato.nombre.charAt(0)}</div>
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

        {/* Categorías y platos */}
        {categoriasFiltradas.map((cat) => (
          <div key={cat.id} id={cat.id} style={{ padding: '0 16px', marginBottom: '14px' }}>
            <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px', paddingTop: '4px' }}>{cat.nombre}</div>
            {cat.platos.map((plato) => (
              <div key={plato.id} style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
                borderRadius: '10px', padding: '10px', display: 'flex', gap: '10px',
                marginBottom: '8px', opacity: plato.disponible ? 1 : 0.4,
              }}>
                <div onClick={() => plato.disponible && setPlatoDetalle(plato.id)} style={{
                  width: '64px', height: '64px', borderRadius: '8px', flexShrink: 0, cursor: plato.disponible ? 'pointer' : 'default',
                  background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 500, color: color,
                }}>{plato.nombre.charAt(0)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div onClick={() => plato.disponible && setPlatoDetalle(plato.id)} style={{ cursor: plato.disponible ? 'pointer' : 'default' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{plato.nombre}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{plato.descripcion}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>${plato.precio.toLocaleString('es-CO')}</span>
                      {config.calificaciones_activo && <span style={{ fontSize: '10px', color: '#F2A623' }}>★ {plato.estrellas}</span>}
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
                {itemsPedido.map((item) => (
                  <div key={item.plato.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>{item.plato.nombre}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>${item.plato.precio.toLocaleString('es-CO')} c/u</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div onClick={() => quitarDelPedido(item.plato.id)} style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', cursor: 'pointer' }}>-</div>
                      <span style={{ fontSize: '14px', fontWeight: 500, minWidth: '16px', textAlign: 'center' }}>{item.cantidad}</span>
                      <div onClick={() => agregarAlPedido(item.plato.id)} style={{ width: '24px', height: '24px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', cursor: 'pointer' }}>+</div>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 500, minWidth: '70px', textAlign: 'right' }}>${(item.plato.precio * item.cantidad).toLocaleString('es-CO')}</div>
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
                ) : config.whatsapp_activo ? (
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
          const plato = todosLosPlatos.find(p => p.id === platoCalificar)
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

          function enviarCalificacion() {
            if (calEstrellas === 0) return
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
                    <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 500, color: color, flexShrink: 0 }}>{plato.nombre.charAt(0)}</div>
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
          const plato = todosLosPlatos.find(p => p.id === platoDetalle)
          if (!plato) return null
          const cantidadActual = pedido[plato.id] || 0
          const cantidadMostrar = cantidadActual || 1
          return (
            <>
              <div onClick={() => setPlatoDetalle(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60 }} />
              <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 70, background: 'var(--bg-secondary)', borderRadius: '16px 16px 0 0', maxHeight: '85vh', overflowY: 'auto', animation: 'slideUp 0.3s ease' }}>
                {/* Foto grande */}
                <div style={{ height: '200px', background: `${color}15`, borderRadius: '16px 16px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  <span style={{ fontSize: '60px', fontWeight: 500, color: color, opacity: 0.3 }}>{plato.nombre.charAt(0)}</span>
                  <div onClick={() => setPlatoDetalle(null)} style={{ position: 'absolute', top: '12px', right: '12px', width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '16px', cursor: 'pointer' }}>✕</div>
                </div>

                <div style={{ padding: '16px 20px' }}>
                  {/* Nombre y calificación */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 500 }}>{plato.nombre}</div>
                    {config.calificaciones_activo && (
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
                  {config.calificaciones_activo && (
                    <>
                      <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Reseñas</div>
                      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '10px', overflow: 'hidden', marginBottom: '14px' }}>
                        {resenasDemo.map((r, i) => (
                          <div key={i} style={{ padding: '12px 14px', borderBottom: i < resenasDemo.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <div style={{ fontSize: '11px', color: '#F2A623' }}>{'★'.repeat(r.estrellas)}{'☆'.repeat(5 - r.estrellas)}</div>
                              <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{r.tiempo}</div>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{r.comentario}</div>
                          </div>
                        ))}
                      </div>
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