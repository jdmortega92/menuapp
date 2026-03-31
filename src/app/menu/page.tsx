'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Plato {
  id: string; nombre: string; precio: number; descripcion: string; disponible: boolean; foto_url: string | null
}
interface Categoria {
  id: string; nombre: string; orden: number; platos: Plato[]
}

export default function MiMenuPage() {
  const router = useRouter()
  const [tabActiva, setTabActiva] = useState<'platos' | 'combos'>('platos')
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

  const MAX_DESC = 150

  const [categorias, setCategorias] = useState<Categoria[]>([
    {
      id: '1', nombre: 'Platos fuertes', orden: 0,
      platos: [
        { id: 'p1', nombre: 'Bandeja paisa', precio: 18000, descripcion: 'Frijoles, arroz, carne, chicharrón, huevo', disponible: true, foto_url: null },
        { id: 'p2', nombre: 'Arroz con pollo', precio: 15000, descripcion: 'Arroz, pollo desmechado, verduras', disponible: false, foto_url: null },
        { id: 'p3', nombre: 'Cazuela de frijoles', precio: 14000, descripcion: 'Frijoles rojos, arroz, chicharrón, aguacate', disponible: true, foto_url: null },
      ],
    },
    {
      id: '2', nombre: 'Bebidas', orden: 1,
      platos: [
        { id: 'p4', nombre: 'Limonada de coco', precio: 6000, descripcion: 'Limonada con leche de coco y hielo', disponible: true, foto_url: null },
        { id: 'p5', nombre: 'Jugo natural', precio: 5000, descripcion: 'Fruta fresca del día', disponible: true, foto_url: null },
      ],
    },
  ])

  // ── Categorías ──
  function agregarCategoria() {
    if (!nuevaCategoria.trim()) return
    setCategorias([...categorias, { id: Date.now().toString(), nombre: nuevaCategoria, orden: categorias.length, platos: [] }])
    setNuevaCategoria('')
    setMostrarFormCategoria(false)
  }
  function eliminarCategoria(id: string) {
    setCategorias(categorias.filter(c => c.id !== id))
    setMenuCategoria(null)
  }
  function renombrarCategoria(id: string) {
    if (!nombreEditCategoria.trim()) return
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
  function agregarPlato(categoriaId: string) {
    if (!nuevoPlato.nombre.trim() || !nuevoPlato.precio) return
    setCategorias(categorias.map(cat => {
      if (cat.id === categoriaId) {
        return { ...cat, platos: [...cat.platos, {
          id: Date.now().toString(), nombre: nuevoPlato.nombre,
          precio: parseInt(nuevoPlato.precio), descripcion: nuevoPlato.descripcion,
          disponible: true, foto_url: null,
        }] }
      }
      return cat
    }))
    setNuevoPlato({ nombre: '', precio: '', descripcion: '' })
    setMostrarFormPlato(null)
  }
  function toggleDisponible(categoriaId: string, platoId: string) {
    setCategorias(categorias.map(cat => {
      if (cat.id === categoriaId) {
        return { ...cat, platos: cat.platos.map(p => p.id === platoId ? { ...p, disponible: !p.disponible } : p) }
      }
      return cat
    }))
  }
  function eliminarPlato(categoriaId: string, platoId: string) {
    setCategorias(categorias.map(cat => {
      if (cat.id === categoriaId) {
        return { ...cat, platos: cat.platos.filter(p => p.id !== platoId) }
      }
      return cat
    }))
    if (platoExpandido === platoId) setPlatoExpandido(null)
  }
  function guardarEdicionPlato(categoriaId: string, platoId: string) {
    if (!editPlato.nombre.trim() || !editPlato.precio) return
    setCategorias(categorias.map(cat => {
      if (cat.id === categoriaId) {
        return { ...cat, platos: cat.platos.map(p => p.id === platoId ? {
          ...p, nombre: editPlato.nombre, precio: parseInt(editPlato.precio), descripcion: editPlato.descripcion,
        } : p) }
      }
      return cat
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

  return (
    <div style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto', paddingBottom: '80px' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: 500 }}>Mi menú</div>
          <button onClick={() => tabActiva === 'platos' ? setMostrarFormCategoria(true) : null}
            className="btn-primary" style={{ padding: '8px 14px', fontSize: '13px' }}>
            {tabActiva === 'platos' ? '+ Categoría' : '+ Combo'}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ padding: '12px 20px 0', display: 'flex' }}>
          {['platos', 'combos'].map((tab) => (
            <div key={tab} onClick={() => setTabActiva(tab as 'platos' | 'combos')}
              style={{
                flex: 1, padding: '10px', textAlign: 'center', fontSize: '13px', cursor: 'pointer',
                fontWeight: tabActiva === tab ? 500 : 400,
                color: tabActiva === tab ? 'var(--color-info)' : 'var(--text-tertiary)',
                borderBottom: `2px solid ${tabActiva === tab ? 'var(--color-info)' : 'var(--border-light)'}`,
              }}>
              {tab === 'platos' ? 'Platos' : 'Combos / Promos'}
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
                      }}>{plato.nombre.charAt(0)}</div>
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
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏷️</div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>Combos y promos</div>
            <div style={{ fontSize: '13px' }}>Próximamente</div>
          </div>
        )}

        {/* Bottom nav */}
        <div style={{
          display: 'flex', borderTop: '1px solid var(--border-light)',
          background: 'var(--bg-secondary)', position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
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