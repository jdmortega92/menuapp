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
  const [sorpresaPlatos, setSorpresaPlatos] = useState<typeof todosLosPlatos>([])
  const [mostrarSorpresa, setMostrarSorpresa] = useState(false)

  const restaurante = {
    nombre: 'La Parrilla de Juan',
    tipo: 'Restaurante',
    ciudad: 'Medellín',
    whatsapp: '3001234567',
    color_principal: '#C0392B',
    tema: 'claro',
    logo_url: null,
    foto_portada_url: null,
    descripcion: 'El mejor sabor paisa desde 1998.',
    horario: 'Lun-Sáb 11am — 9pm · Dom 11am — 4pm',
  }

  const config = {
    whatsapp_activo: true,
    combos_activo: true,
    promos_activo: true,
    plato_dia_activo: true,
    calificaciones_activo: true,
    sorprendeme_activo: true,
  }

  const platoDia = {
    id: 'p5', nombre: 'Ajiaco', precio: 16000, precioEspecial: 12000,
    descripcion: 'Pollo, papa criolla, guascas, mazorca. Receta tradicional bogotana.', horaFin: '3:00 pm',
  }

  const categorias = [
    {
      id: 'c1', nombre: 'Platos fuertes',
      platos: [
        { id: 'p1', nombre: 'Bandeja paisa', precio: 18000, descripcion: 'Frijoles, arroz, carne, chicharrón, huevo, tajada, arepa', disponible: true, estrellas: 4.8, resenas: 24, foto_url: null },
        { id: 'p2', nombre: 'Arroz con pollo', precio: 15000, descripcion: 'Arroz, pollo desmechado, verduras, papa criolla', disponible: true, estrellas: 4.5, resenas: 18, foto_url: null },
        { id: 'p3', nombre: 'Cazuela de frijoles', precio: 14000, descripcion: 'Frijoles rojos, arroz, chicharrón, aguacate', disponible: true, estrellas: 4.2, resenas: 12, foto_url: null },
        { id: 'p4', nombre: 'Churrasco', precio: 22000, descripcion: 'Carne a la brasa con papas y ensalada', disponible: false, estrellas: 4.9, resenas: 31, foto_url: null },
      ],
    },
    {
      id: 'c2', nombre: 'Sopas',
      platos: [
        { id: 'p5', nombre: 'Ajiaco', precio: 16000, descripcion: 'Pollo, papa criolla, guascas, mazorca', disponible: true, estrellas: 4.7, resenas: 15, foto_url: null },
        { id: 'p6', nombre: 'Sancocho de res', precio: 15000, descripcion: 'Res, yuca, plátano, papa, cilantro', disponible: true, estrellas: 4.4, resenas: 9, foto_url: null },
      ],
    },
    {
      id: 'c3', nombre: 'Bebidas',
      platos: [
        { id: 'p7', nombre: 'Limonada de coco', precio: 6000, descripcion: 'Limonada con leche de coco y hielo', disponible: true, estrellas: 4.6, resenas: 20, foto_url: null },
        { id: 'p8', nombre: 'Jugo natural', precio: 5000, descripcion: 'Fruta fresca del día', disponible: true, estrellas: 4.3, resenas: 8, foto_url: null },
        { id: 'p9', nombre: 'Agua panela con limón', precio: 3500, descripcion: 'Panela artesanal con limón', disponible: true, estrellas: 4.1, resenas: 5, foto_url: null },
      ],
    },
    {
      id: 'c4', nombre: 'Postres',
      platos: [
        { id: 'p10', nombre: 'Arroz con leche', precio: 5000, descripcion: 'Receta de la abuela con canela', disponible: true, estrellas: 4.5, resenas: 11, foto_url: null },
        { id: 'p11', nombre: 'Natilla', precio: 4500, descripcion: 'Natilla artesanal con coco rallado', disponible: true, estrellas: 4.0, resenas: 6, foto_url: null },
      ],
    },
  ]

  const color = restaurante.color_principal
  const todosLosPlatos = categorias.flatMap(c => c.platos)

  const categoriasFiltradas = busqueda.trim()
    ? categorias.map(cat => ({ ...cat, platos: cat.platos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.descripcion?.toLowerCase().includes(busqueda.toLowerCase())) })).filter(cat => cat.platos.length > 0)
    : categorias

  function agregarAlPedido(platoId: string) { setPedido({ ...pedido, [platoId]: (pedido[platoId] || 0) + 1 }) }
  function quitarDelPedido(platoId: string) {
    const cantidad = (pedido[platoId] || 0) - 1
    if (cantidad <= 0) { const nuevo = { ...pedido }; delete nuevo[platoId]; setPedido(nuevo) }
    else { setPedido({ ...pedido, [platoId]: cantidad }) }
  }

  const itemsPedido = Object.entries(pedido).map(([id, cantidad]) => ({ plato: todosLosPlatos.find(p => p.id === id)!, cantidad })).filter(i => i.plato)
  const totalPedido = itemsPedido.reduce((sum, i) => sum + i.plato.precio * i.cantidad, 0)
  const totalProductos = itemsPedido.reduce((sum, i) => sum + i.cantidad, 0)

  function sorprendeme() {
    const disponibles = todosLosPlatos.filter(p => p.disponible)
    if (disponibles.length < 3) return
    const shuffled = [...disponibles].sort(() => Math.random() - 0.5)
    setSorpresaPlatos(shuffled.slice(0, 3))
    setMostrarSorpresa(true)
  }

  function pedirPorWhatsApp() {
    const lineas = itemsPedido.map(i => `- ${i.cantidad} ${i.plato.nombre} $${(i.plato.precio * i.cantidad).toLocaleString('es-CO')}`)
    let mensaje = `Hola! Vi tu menú en ${restaurante.nombre} y quiero pedir:\n${lineas.join('\n')}`
    if (nota) mensaje += `\nNota: ${nota}`
    mensaje += `\nTotal: $${totalPedido.toLocaleString('es-CO')}`
    window.open(`https://wa.me/57${restaurante.whatsapp}?text=${encodeURIComponent(mensaje)}`, '_blank')
  }

  // Componente para selector cantidad
  function SelectorCantidad({ platoId }: { platoId: string }) {
    const cantidad = pedido[platoId] || 0
    if (cantidad > 0) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div onClick={() => quitarDelPedido(platoId)} style={{ width: '26px', height: '26px', borderRadius: '50%', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', cursor: 'pointer', color: 'var(--text-secondary)' }}>-</div>
          <span style={{ fontSize: '14px', fontWeight: 500, minWidth: '16px', textAlign: 'center' }}>{cantidad}</span>
          <div onClick={() => agregarAlPedido(platoId)} style={{ width: '26px', height: '26px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', cursor: 'pointer' }}>+</div>
        </div>
      )
    }
    return (
      <div onClick={() => agregarAlPedido(platoId)} style={{ width: '26px', height: '26px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', cursor: 'pointer' }}>+</div>
    )
  }

  return (
    <div style={{ background: restaurante.tema === 'oscuro' ? '#1A1A18' : '#FDFBF7', minHeight: '100vh' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto', paddingBottom: totalProductos > 0 ? '140px' : '20px' }}>

        {/* Banner */}
        <div style={{
          height: restaurante.foto_portada_url ? '160px' : '100px',
          background: restaurante.foto_portada_url ? `url(${restaurante.foto_portada_url}) center/cover` : `linear-gradient(135deg, ${color} 0%, ${color}CC 100%)`,
          position: 'relative', display: 'flex', alignItems: 'flex-end',
        }}>
          <div style={{ position: 'absolute', inset: 0, background: restaurante.foto_portada_url ? 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)' : `linear-gradient(to top, ${restaurante.tema === 'oscuro' ? 'rgba(26,26,24,1)' : 'rgba(253,251,247,1)'} 0%, transparent 80%)` }} />
          <div style={{ position: 'relative', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '12px', flexShrink: 0, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 600, color: color, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
              {restaurante.nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: '17px', fontWeight: 600, color: restaurante.foto_portada_url ? 'white' : 'var(--text-primary)' }}>{restaurante.nombre}</div>
              <div style={{ fontSize: '12px', color: restaurante.foto_portada_url ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)' }}>{restaurante.tipo} · {restaurante.ciudad}</div>
            </div>
          </div>
        </div>

        {/* Buscador */}
        <div style={{ padding: '12px 16px 8px' }}>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en el menú..."
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-light)', borderRadius: '8px', fontSize: '13px', fontFamily: 'var(--font-body)', background: 'var(--bg-secondary)', outline: 'none', color: 'var(--text-primary)' }} />
          {busqueda.trim() && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{categoriasFiltradas.reduce((s, c) => s + c.platos.length, 0)} resultados</span>
              <span onClick={() => setBusqueda('')} style={{ fontSize: '11px', color: color, cursor: 'pointer' }}>Limpiar</span>
            </div>
          )}
        </div>

        {/* Filtros (sin Sorpréndeme) */}
        <div style={{ padding: '4px 16px 10px', display: 'flex', gap: '6px', overflowX: 'auto' }}>
          <div onClick={() => setCategoriaAbierta(categoriaAbierta ? null : 'open')}
            style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 500, background: color, color: 'white', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Categorías ↓
          </div>
          {config.combos_activo && (
            <div style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '11px', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Combos</div>
          )}
          {config.promos_activo && (
            <div style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '11px', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Promos</div>
          )}
        </div>

        {/* Dropdown categorías */}
        {categoriaAbierta && (
          <div style={{ padding: '0 16px 10px' }}>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
              {categorias.map((cat, i) => (
                <div key={cat.id} onClick={() => { setCategoriaAbierta(null); document.getElementById(cat.id)?.scrollIntoView({ behavior: 'smooth' }) }}
                  style={{ padding: '10px 14px', fontSize: '13px', cursor: 'pointer', borderBottom: i < categorias.length - 1 ? '1px solid var(--border-light)' : 'none', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{cat.nombre}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{cat.platos.filter(p => p.disponible).length} platos</span>
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
                <SelectorCantidad platoId={platoDia.id} />
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
              transition: 'all 0.2s',
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
                <div key={plato.id} style={{
                  background: 'var(--bg-secondary)', borderRadius: '8px', padding: '10px',
                  display: 'flex', gap: '10px', marginBottom: '6px', border: '1px solid var(--border-light)',
                }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '8px', flexShrink: 0, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 500, color: color }}>{plato.nombre.charAt(0)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{plato.nombre}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{plato.descripcion}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>${plato.precio.toLocaleString('es-CO')}</span>
                      <SelectorCantidad platoId={plato.id} />
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
                <div style={{ width: '64px', height: '64px', borderRadius: '8px', flexShrink: 0, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 500, color: color }}>{plato.nombre.charAt(0)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{plato.nombre}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{plato.descripcion}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>${plato.precio.toLocaleString('es-CO')}</span>
                      {config.calificaciones_activo && <span style={{ fontSize: '10px', color: '#F2A623' }}>★ {plato.estrellas}</span>}
                    </div>
                    {plato.disponible ? <SelectorCantidad platoId={plato.id} /> : <span style={{ fontSize: '10px', color: 'var(--color-danger)', fontWeight: 500 }}>Agotado</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Bandeja flotante */}
        {totalProductos > 0 && (
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
            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 70,
              background: 'var(--bg-secondary)', borderRadius: '16px 16px 0 0',
              maxHeight: '80vh', overflowY: 'auto', animation: 'slideUp 0.3s ease',
            }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '16px', fontWeight: 500 }}>Tu pedido</span>
                <span onClick={() => setMostrarPedido(false)} style={{ fontSize: '18px', color: 'var(--text-tertiary)', cursor: 'pointer' }}>✕</span>
              </div>

              {esQR && (
                <div style={{ padding: '12px 20px', background: 'var(--color-info-light)', fontSize: '12px', color: 'var(--color-info)' }}>
                  Mesa {qrMesa?.replace('mesa', '')} · Muéstrale este resumen al mesero
                </div>
              )}

              <div style={{ padding: '16px 20px' }}>
                {itemsPedido.map((item) => (
                  <div key={item.plato.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 0', borderBottom: '1px solid var(--border-light)',
                  }}>
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
                  <input value={nota} onChange={(e) => setNota(e.target.value)}
                    placeholder={esQR ? 'Nota para el mesero (opcional)' : 'Nota para el restaurante (opcional)'}
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

        {/* Powered by */}
        {!busqueda.trim() && totalProductos === 0 && (
          <div style={{ textAlign: 'center', padding: '20px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
            Menú creado con <span style={{ fontWeight: 500 }}>MenuApp</span>
          </div>
        )}

      </div>
    </div>
  )
}