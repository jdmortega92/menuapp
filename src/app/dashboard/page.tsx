'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks'
import { createClient } from '@/lib/supabase-browser'

export default function DashboardPage() {
  const router = useRouter()
  const [mostrarPerfil, setMostrarPerfil] = useState(false)
  const [mostrarFiltro, setMostrarFiltro] = useState(false)
  const [filtroTiempo, setFiltroTiempo] = useState<'hoy' | 'semana' | 'mes'>('semana')

  // Datos reales de Supabase
  const { usuario, restaurante: rest, cargando } = useAuth()
  const plan = (rest?.plan || 'gratis') as 'gratis' | 'basico' | 'pro'
  const restaurante = {
    nombre: rest?.nombre || 'Mi restaurante',
    iniciales: rest?.nombre ? rest.nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'MR',
    plan: plan,
  }

  const [stats, setStats] = useState({
    escaneos: 0,
    visitas: 0,
    pedidosWhatsapp: 0,
    calificacion: 0,
    totalResenas: 0,
  })

  useEffect(() => {
    if (!rest?.id) return
    async function cargarStats() {
      const supabase = createClient()
      const hoy = new Date()
      let desde = ''
      if (filtroTiempo === 'hoy') {
        desde = hoy.toISOString().split('T')[0]
      } else if (filtroTiempo === 'semana') {
        desde = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      } else {
        desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0]
      }

      // Visitas al menú esta semana
      const { count: visitas } = await supabase
        .from('visitas_menu')
        .select('*', { count: 'exact', head: true })
        .eq('restaurante_id', rest!.id)
        .gte('fecha', desde)

      // Pedidos WhatsApp esta semana
      const { count: pedidos } = await supabase
        .from('pedidos_whatsapp')
        .select('*', { count: 'exact', head: true })
        .eq('restaurante_id', rest!.id)
        .gte('fecha', desde)

      // Calificación promedio
      const { data: calData } = await supabase
        .from('calificaciones')
        .select('estrellas')
        .eq('restaurante_id', rest!.id)

      let promedio = 0
      if (calData && calData.length > 0) {
        promedio = Math.round((calData.reduce((sum: number, c: any) => sum + c.estrellas, 0) / calData.length) * 10) / 10
      }

      // Vistas de platos esta semana
      const { count: vistasPlatos } = await supabase
        .from('vistas_platos')
        .select('*', { count: 'exact', head: true })
        .eq('restaurante_id', rest!.id)
        .gte('fecha', desde)
      // Platos más vistos
      const { data: vistasData } = await supabase
        .from('vistas_platos')
        .select('plato_id')
        .eq('restaurante_id', rest!.id)
        .gte('fecha', desde)

      if (vistasData && vistasData.length > 0) {
        const conteo: Record<string, number> = {}
        vistasData.forEach((v: any) => { conteo[v.plato_id] = (conteo[v.plato_id] || 0) + 1 })

        const { data: platosInfo } = await supabase
          .from('platos')
          .select('id, nombre')
          .eq('restaurante_id', rest!.id)

        if (platosInfo) {
          const lista = Object.entries(conteo)
            .map(([id, vistas]) => ({
              nombre: platosInfo.find((p: any) => p.id === id)?.nombre || 'Plato',
              vistas,
              pedidos: 0,
            }))
            .sort((a, b) => b.vistas - a.vistas)
            .slice(0, 5)
          setPlatosMasVistos(lista)
        }
      } else {
        setPlatosMasVistos([])
      }

      // Horarios pico
      const { data: visitasHora } = await supabase
        .from('visitas_menu')
        .select('created_at')
        .eq('restaurante_id', rest!.id)
        .gte('fecha', desde)

      if (visitasHora && visitasHora.length > 0) {
        const porHora: Record<number, number> = {}
        visitasHora.forEach((v: any) => {
          const hora = new Date(v.created_at).getHours()
          porHora[hora] = (porHora[hora] || 0) + 1
        })
        const listaHoras = Object.entries(porHora)
          .map(([hora, cantidad]) => ({
            rango: `${parseInt(hora)}:00 — ${parseInt(hora) + 1}:00`,
            escaneos: cantidad,
          }))
          .sort((a, b) => b.escaneos - a.escaneos)
          .slice(0, 3)
        setHorariosPico(listaHoras)
      } else {
        setHorariosPico([])
      }

      // Visitas por día de la semana
      const { data: visitasDia } = await supabase
        .from('visitas_menu')
        .select('fecha')
        .eq('restaurante_id', rest!.id)
        .gte('fecha', desde)

      if (visitasDia && visitasDia.length > 0) {
        const dias = ['D', 'L', 'M', 'Mi', 'J', 'V', 'S']
        const porDia: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
        visitasDia.forEach((v: any) => {
          const d = new Date(v.fecha + 'T12:00:00').getDay()
          porDia[d] = (porDia[d] || 0) + 1
        })
        setEscaneosPorDia([1, 2, 3, 4, 5, 6, 0].map(d => ({
          dia: dias[d],
          actual: porDia[d] || 0,
        })))
      } else {
        setEscaneosPorDia([])
      }

      // Últimas reseñas
      const { data: resenasData } = await supabase
        .from('calificaciones')
        .select('*, platos(nombre)')
        .eq('restaurante_id', rest!.id)
        .order('created_at', { ascending: false })
        .limit(3)

      if (resenasData && resenasData.length > 0) {
        setResenas(resenasData.map((r: any) => ({
          plato: r.platos?.nombre || 'Plato',
          estrellas: r.estrellas,
          comentario: r.comentario || '',
          tiempo: new Date(r.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }),
        })))
      } else {
        setResenas([])
      }

      // Mejor y peor día
      if (visitasDia && visitasDia.length > 0) {
        const porFecha: Record<string, number> = {}
        visitasDia.forEach((v: any) => { porFecha[v.fecha] = (porFecha[v.fecha] || 0) + 1 })
        const fechas = Object.entries(porFecha).sort((a, b) => b[1] - a[1])
        if (fechas.length > 0) {
          setMejorDia({ dia: new Date(fechas[0][0] + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric' }), cantidad: fechas[0][1] })
          setPeorDia({ dia: new Date(fechas[fechas.length - 1][0] + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric' }), cantidad: fechas[fechas.length - 1][1] })
        }
      } else {
        setMejorDia(null)
        setPeorDia(null)
      }

      setStats({
        escaneos: visitas || 0,
        visitas: vistasPlatos || 0,
        pedidosWhatsapp: pedidos || 0,
        calificacion: promedio,
        totalResenas: calData?.length || 0,
      })
    }
    cargarStats()
  }, [rest?.id, filtroTiempo])

  const [platosMasVistos, setPlatosMasVistos] = useState<any[]>([])
  const [horariosPico, setHorariosPico] = useState<any[]>([])
  const [escaneosPorDia, setEscaneosPorDia] = useState<any[]>([])
  const [resenas, setResenas] = useState<any[]>([])
  const [mejorDia, setMejorDia] = useState<{ dia: string; cantidad: number } | null>(null)
  const [peorDia, setPeorDia] = useState<{ dia: string; cantidad: number } | null>(null)

  const esBasico = plan === 'basico' || plan === 'pro'
  const esPro = plan === 'pro'

  

  const maxEscaneo = escaneosPorDia.length > 0 ? Math.max(...escaneosPorDia.map((d: any) => d.actual), 1) : 1

  useEffect(() => {
    if (!cargando && !usuario) {
      router.push('/login')
    }
  }, [cargando, usuario, router])

  if (cargando) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 500, fontFamily: 'var(--font-display)' }}>Menu<span style={{ color: 'var(--color-accent)' }}>App</span></div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>Cargando...</div>
        </div>
      </div>
    )
  }

  if (!usuario) {
    return null
  }
  return (
    <div style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto', paddingBottom: '80px' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Bienvenido</div>
            <div style={{ fontSize: '18px', fontWeight: 500 }}>{restaurante.nombre}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              fontSize: '10px', fontWeight: 500, padding: '3px 8px', borderRadius: '4px',
              background: esPro ? 'var(--color-warning-light)' : esBasico ? 'var(--color-info-light)' : 'var(--bg-tertiary)',
              color: esPro ? 'var(--color-warning)' : esBasico ? 'var(--color-info)' : 'var(--text-secondary)',
            }}>
              {esPro ? 'Pro' : esBasico ? 'Básico' : 'Gratis'}
            </div>
            <div
              onClick={() => setMostrarPerfil(!mostrarPerfil)}
              style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: 'var(--color-info)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 500, color: 'white', cursor: 'pointer',
                overflow: 'hidden',
              }}
            >
              {rest?.logo_url ? (
                <img src={rest.logo_url} alt={restaurante.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : restaurante.iniciales}
            </div>
          </div>
        </div>

        {/* Dropdown perfil */}
        {mostrarPerfil && (
          <>
            <div onClick={() => setMostrarPerfil(false)} style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 60,
            }} />
            <div style={{
              position: 'absolute', right: '20px', top: '64px', zIndex: 70,
              background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)', overflow: 'hidden', width: '260px',
              boxShadow: 'var(--shadow-lg)', animation: 'scaleIn 0.2s ease',
            }}>
              <div style={{ padding: '14px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--color-info)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 500, color: 'white', overflow: 'hidden' }}>
                  {rest?.logo_url ? (
                    <img src={rest.logo_url} alt={restaurante.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : restaurante.iniciales}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{restaurante.nombre}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{usuario?.email || ''}</div>
                </div>
              </div>
              {[
                { label: 'Mi suscripción', sub: esPro ? 'Plan Pro' : esBasico ? 'Plan Básico' : 'Plan Gratis', href: '/suscripcion' },
                { label: 'Mis facturas', sub: 'Descargar y compartir', href: '/facturas' },
                { label: 'Invitar restaurantes', sub: 'Gana meses gratis', href: '/referidos' },
                { label: 'Idioma', sub: 'Español', href: '#' },
              ].map((item, i) => (
                <div key={i} onClick={() => { setMostrarPerfil(false); router.push(item.href) }} style={{
                  padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderBottom: '1px solid var(--border-light)', cursor: 'pointer',
                }}>
                  <div>
                    <div style={{ fontSize: '13px' }}>{item.label}</div>
                    <div style={{ fontSize: '11px', color: item.label === 'Invitar restaurantes' ? 'var(--color-green)' : 'var(--text-tertiary)' }}>{item.sub}</div>
                  </div>
                  <span style={{ color: 'var(--text-tertiary)' }}>→</span>
                </div>
              ))}
              <div onClick={async () => {
                setMostrarPerfil(false)
                const { cerrarSesion } = await import('@/lib/auth')
                await cerrarSesion()
                router.push('/login')
              }} style={{
                padding: '10px 14px', fontSize: '13px', color: 'var(--color-danger)', cursor: 'pointer',
              }}>
                Cerrar sesión
              </div>
            </div>
          </>
        )}

        {/* Acciones rápidas */}
        <div style={{ padding: '0 20px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            {[
              { icon: '+', label: 'Agregar plato', href: '/menu' },
              { icon: '⊘', label: 'Marcar agotado', href: '/menu' },
              { icon: '◻', label: 'Ver QR', href: '/qr' },
            ].map((a, i) => (
              <div key={i} onClick={() => router.push(a.href)} className="card" style={{
                flex: 1, padding: '12px', textAlign: 'center', cursor: 'pointer',
              }}>
                <div style={{ fontSize: '18px', marginBottom: '4px' }}>{a.icon}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{a.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Estadísticas header */}
        <div style={{ padding: '0 20px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 500 }}>Estadísticas</div>
          <div style={{ position: 'relative' }}>
              <div onClick={() => setMostrarFiltro(!mostrarFiltro)} style={{
                border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)',
                padding: '6px 12px', fontSize: '12px', color: 'var(--text-secondary)',
                background: 'var(--bg-secondary)', cursor: 'pointer',
              }}>
                {filtroTiempo === 'hoy' ? 'Hoy' : filtroTiempo === 'semana' ? 'Esta semana' : 'Este mes'} ↓
              </div>
              {mostrarFiltro && (
                <>
                  <div onClick={() => setMostrarFiltro(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
                  <div style={{
                    position: 'absolute', right: 0, top: '36px', zIndex: 70,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-sm)', overflow: 'hidden', width: '140px',
                    boxShadow: 'var(--shadow-lg)',
                  }}>
                    {[
                      { id: 'hoy', label: 'Hoy' },
                      { id: 'semana', label: 'Esta semana' },
                      { id: 'mes', label: 'Este mes' },
                    ].map((f) => (
                      <div key={f.id} onClick={() => { setFiltroTiempo(f.id as any); setMostrarFiltro(false) }}
                        style={{
                          padding: '10px 14px', fontSize: '12px', cursor: 'pointer',
                          background: filtroTiempo === f.id ? 'var(--color-info-light)' : 'transparent',
                          color: filtroTiempo === f.id ? 'var(--color-info)' : 'var(--text-primary)',
                          borderBottom: '1px solid var(--border-light)',
                        }}>
                        {f.label}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
        </div>

        {/* Números grandes */}
        <div style={{ padding: '0 20px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div className="card" style={{ flex: 1, padding: '14px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Visitas al menú</div>
              <div style={{ fontSize: '26px', fontWeight: 500, marginTop: '4px' }}>{stats.escaneos}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{filtroTiempo === 'hoy' ? 'hoy' : filtroTiempo === 'semana' ? 'esta semana' : 'este mes'}</div>
            </div>
            <div className="card" style={{ flex: 1, padding: '14px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Platos vistos</div>
              <div style={{ fontSize: '26px', fontWeight: 500, marginTop: '4px' }}>{stats.visitas}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{filtroTiempo === 'hoy' ? 'hoy' : filtroTiempo === 'semana' ? 'esta semana' : 'este mes'}</div>
            </div>
          </div>
        </div>

        {/* PRO: Embudo de conversión */}
        {esPro ? (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div className="card" style={{ padding: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '12px' }}>Embudo de conversión</div>
              {[
                { label: 'Visitaron el menú', valor: stats.escaneos, pct: 100 },
                { label: 'Vieron platos', valor: stats.visitas, pct: stats.escaneos > 0 ? Math.round((stats.visitas / stats.escaneos) * 100) : 0 },
                { label: 'Pidieron por WhatsApp', valor: stats.pedidosWhatsapp, pct: stats.escaneos > 0 ? Math.round((stats.pedidosWhatsapp / stats.escaneos) * 100) : 0 },
              ].map((item, i) => (
                <div key={i} style={{ marginBottom: i < 2 ? '10px' : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                    <span>{item.label}</span>
                    <span style={{ fontWeight: 500 }}>{item.valor} <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({item.pct}%)</span></span>
                  </div>
                  <div style={{ height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${item.pct}%`, background: i === 2 ? 'var(--color-green)' : 'var(--color-info)', borderRadius: '4px', opacity: 1 - i * 0.2 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : !esBasico ? (
          <div style={{ padding: '0 20px', marginBottom: '10px' }}>
            <div className="card" style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>
              <div style={{ fontSize: '30px', marginBottom: '6px' }}>🔒</div>
              <div style={{ fontSize: '13px', fontWeight: 500 }}>Gráfica de escaneos</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Disponible en Plan Básico</div>
            </div>
          </div>
        ) : null}

        {/* BÁSICO+: Gráfica escaneos por día */}
        {esBasico && escaneosPorDia.length > 0 && (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div className="card" style={{ padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>Visitas por día</div>
                {esPro && (
                  <div style={{ display: 'flex', gap: '10px', fontSize: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--color-info)' }} />Esta sem.</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--border-light)' }} />Anterior</div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'end', gap: '4px', height: '80px' }}>
                {escaneosPorDia.map((d, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', gap: '2px', alignItems: 'end' }}>
                    <div style={{ flex: 1, background: 'var(--color-info)', borderRadius: '2px', height: `${(d.actual / maxEscaneo) * 80}px` }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '10px', color: 'var(--text-tertiary)' }}>
                {escaneosPorDia.map((d, i) => <span key={i}>{d.dia}</span>)}
              </div>
            </div>
          </div>
        )}

        {/* Pedidos WhatsApp + Calificación */}
        {esPro ? (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div className="card" style={{ flex: 1, padding: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Pedidos WhatsApp</div>
                <div style={{ fontSize: '26px', fontWeight: 500, marginTop: '4px' }}>{stats.pedidosWhatsapp}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{filtroTiempo === 'hoy' ? 'hoy' : filtroTiempo === 'semana' ? 'esta semana' : 'este mes'}</div>
              </div>
              <div className="card" style={{ flex: 1, padding: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Calificación promedio</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: '4px' }}>
                  <div style={{ fontSize: '26px', fontWeight: 500 }}>{stats.calificacion}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>/5</div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>de {stats.totalResenas} reseñas</div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '0 20px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div className="card" style={{ flex: 1, padding: '16px', textAlign: 'center', opacity: 0.5 }}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>🔒</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Pedidos WhatsApp</div>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Plan Pro</div>
              </div>
              <div className="card" style={{ flex: 1, padding: '16px', textAlign: 'center', opacity: 0.5 }}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>🔒</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Calificación promedio</div>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Plan Pro</div>
              </div>
            </div>
          </div>
        )}

        {/* BÁSICO+: Platos más vistos */}
        {esBasico && platosMasVistos.length > 0 ? (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div className="card" style={{ padding: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '12px' }}>
                {esPro ? 'Platos: vistas vs pedidos' : 'Platos más vistos'}
              </div>
              {platosMasVistos.map((p: any, i: number) => (
                <div key={i} style={{ marginBottom: i < platosMasVistos.length - 1 ? '10px' : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginBottom: '4px' }}>
                    <span style={{ color: esPro && p.vistas > 15 && p.pedidos < 3 ? 'var(--color-danger)' : 'var(--text-primary)' }}>{p.nombre}</span>
                    <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
                      <span style={{ color: 'var(--color-info)' }}>{p.vistas} vistas</span>
                      {esPro && <span style={{ color: p.pedidos < 3 && p.vistas > 15 ? 'var(--color-danger)' : 'var(--color-green)' }}>{p.pedidos} pedidos</span>}
                    </div>
                  </div>
                  <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(p.vistas / platosMasVistos[0].vistas) * 100}%`, background: 'var(--color-info)', borderRadius: '3px', opacity: 1 - i * 0.2 }} />
                  </div>
                  {esPro && (
                    <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden', marginTop: '3px' }}>
                      <div style={{ height: '100%', width: `${(p.pedidos / platosMasVistos[0].vistas) * 100}%`, background: p.pedidos < 3 && p.vistas > 15 ? 'var(--color-danger)' : 'var(--color-green)', borderRadius: '3px' }} />
                    </div>
                  )}
                  {esPro && p.vistas > 15 && p.pedidos < 3 && (
                    <div style={{ fontSize: '10px', color: 'var(--color-danger)', marginTop: '4px' }}>Muchas vistas, pocos pedidos — revisar precio o foto</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: '0 20px', marginBottom: '10px' }}>
            <div className="card" style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>
              <div style={{ fontSize: '30px', marginBottom: '6px' }}>🔒</div>
              <div style={{ fontSize: '13px', fontWeight: 500 }}>Platos más vistos</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Disponible en Plan Básico</div>
            </div>
          </div>
        )}

        {/* BÁSICO+: Horarios pico */}
        {esBasico && horariosPico.length > 0 ? (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div className="card" style={{ padding: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '12px' }}>Horarios con más visitas</div>
              {horariosPico.map((h: any, i: number) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0', borderBottom: i < horariosPico.length - 1 ? '1px solid var(--border-light)' : 'none',
                }}>
                  <span style={{ fontSize: '13px' }}>{h.rango}</span>
                  <span style={{ fontSize: '12px', fontWeight: 500 }}>{h.escaneos}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: '0 20px', marginBottom: '10px' }}>
            <div className="card" style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>
              <div style={{ fontSize: '30px', marginBottom: '6px' }}>🔒</div>
              <div style={{ fontSize: '13px', fontWeight: 500 }}>Horarios pico</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Disponible en Plan Básico</div>
            </div>
          </div>
        )}

        {/* PRO: Mejores y peores días */}
        {esPro && mejorDia && peorDia && (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div className="card" style={{ flex: 1, padding: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Mejor día</div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>{mejorDia.dia}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-green)', marginTop: '2px' }}>{mejorDia.cantidad} visitas</div>
              </div>
              <div className="card" style={{ flex: 1, padding: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Peor día</div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>{peorDia.dia}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-danger)', marginTop: '2px' }}>{peorDia.cantidad} visitas</div>
              </div>
            </div>
          </div>
        )}

        {/* PRO: Últimas reseñas */}
        {esPro && resenas.length > 0 && (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div className="card" style={{ padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>Últimas reseñas</div>
                <span style={{ fontSize: '12px', color: 'var(--color-info)', cursor: 'pointer' }}>Ver todas →</span>
              </div>
              {resenas.map((r, i) => (
                <div key={i} style={{ padding: '10px 0', borderBottom: i < resenas.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 500 }}>{r.plato}</span>
                    <div style={{ fontSize: '11px', color: 'var(--color-warning)' }}>{'★'.repeat(r.estrellas)}{'☆'.repeat(5 - r.estrellas)}</div>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{r.comentario}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{r.tiempo}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PRO: Descargar reporte */}
        {esPro && (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div style={{
              background: 'var(--text-primary)', borderRadius: 'var(--radius-md)',
              padding: '14px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', cursor: 'pointer',
            }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--bg-secondary)' }}>Descargar reporte</div>
                <div style={{ fontSize: '11px', color: 'var(--bg-secondary)', opacity: 0.6, marginTop: '2px' }}>PDF · {filtroTiempo === 'hoy' ? 'Hoy' : filtroTiempo === 'semana' ? 'Esta semana' : 'Este mes'}</div>
              </div>
              <span style={{ fontSize: '16px', color: 'var(--bg-secondary)' }}>↓</span>
            </div>
          </div>
        )}

        {/* Upsell (gratis o básico) */}
        {!esPro && (
          <div style={{ padding: '0 20px', marginBottom: '16px' }}>
            {plan === 'gratis' ? (
              <div onClick={() => router.push('/suscripcion')} style={{
                background: 'var(--text-primary)', borderRadius: 'var(--radius-md)',
                padding: '16px', textAlign: 'center', cursor: 'pointer',
              }}>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--bg-secondary)' }}>Desbloquear estadísticas</div>
                <div style={{ fontSize: '12px', color: 'var(--bg-secondary)', opacity: 0.7, marginTop: '4px' }}>Plan Básico desde $15.000/mes</div>
              </div>
            ) : (
              <div onClick={() => router.push('/suscripcion')} style={{
                background: 'var(--color-warning-light)', borderRadius: 'var(--radius-md)',
                padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
              }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-warning)' }}>Plan Pro</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-warning)', opacity: 0.8, marginTop: '2px' }}>WhatsApp stats + calificaciones</div>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--color-warning)', fontWeight: 500 }}>Ver →</span>
              </div>
            )}
          </div>
        )}

        {/* Bottom nav */}
        <div style={{
          display: 'flex', borderTop: '1px solid var(--border-light)',
          background: 'var(--bg-secondary)', position: 'fixed',
          bottom: 0, left: 0, right: 0, zIndex: 50,
        }}>
          {[
            { icon: '◉', label: 'Inicio', href: '/dashboard', active: true },
            { icon: '≡', label: 'Menú', href: '/menu', active: false },
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