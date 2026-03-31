'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
  const router = useRouter()
  const [mostrarPerfil, setMostrarPerfil] = useState(false)

  // Datos demo (después vendrán de Supabase)
  const plan = 'pro' // Cambiar a 'gratis' o 'basico' o 'pro' para ver las diferencias
  const restaurante = {
    nombre: 'La Parrilla de Juan',
    iniciales: 'JP',
    plan: plan,
  }

  const stats = {
    escaneos: 147,
    escaneosAnterior: 131,
    visitas: 203,
    visitasAnterior: 188,
    pedidosWhatsapp: 23,
    pedidosAnterior: 18,
    calificacion: 4.3,
    totalResenas: 48,
  }

  const platosMasVistos = [
    { nombre: 'Bandeja paisa', vistas: 34, pedidos: 12 },
    { nombre: 'Arroz con pollo', vistas: 28, pedidos: 8 },
    { nombre: 'Limonada de coco', vistas: 22, pedidos: 15 },
    { nombre: 'Cazuela de frijoles', vistas: 22, pedidos: 1 },
  ]

  const horariosPico = [
    { rango: '12:00 pm — 1:00 pm', escaneos: 42 },
    { rango: '7:00 pm — 8:00 pm', escaneos: 38 },
    { rango: '1:00 pm — 2:00 pm', escaneos: 29 },
  ]

  const escaneosPorDia = [
    { dia: 'L', actual: 18, anterior: 15 },
    { dia: 'M', actual: 22, anterior: 20 },
    { dia: 'Mi', actual: 28, anterior: 24 },
    { dia: 'J', actual: 19, anterior: 21 },
    { dia: 'V', actual: 32, anterior: 26 },
    { dia: 'S', actual: 26, anterior: 22 },
    { dia: 'D', actual: 12, anterior: 16 },
  ]

  const resenas = [
    { plato: 'Bandeja paisa', estrellas: 5, comentario: 'Excelente porción, muy completa', tiempo: 'Hace 2 horas' },
    { plato: 'Cazuela de frijoles', estrellas: 3, comentario: 'Buena pero le falta sazón', tiempo: 'Hace 5 horas' },
    { plato: 'Limonada de coco', estrellas: 4, comentario: 'Refrescante, muy buena', tiempo: 'Ayer' },
  ]

  const esBasico = plan === 'basico' || plan === 'pro'
  const esPro = plan === 'pro'

  function porcentajeCambio(actual: number, anterior: number): string {
    if (anterior === 0) return '+0%'
    const cambio = Math.round(((actual - anterior) / anterior) * 100)
    return cambio >= 0 ? `+${cambio}%` : `${cambio}%`
  }

  const maxEscaneo = Math.max(...escaneosPorDia.map(d => Math.max(d.actual, d.anterior)))

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
              }}
            >
              {restaurante.iniciales}
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
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--color-info)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 500, color: 'white' }}>{restaurante.iniciales}</div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>Juan Pérez</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>juan@gmail.com</div>
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
              <div onClick={() => { setMostrarPerfil(false) }} style={{
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
          {esBasico && (
            <div style={{
              border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)',
              padding: '6px 12px', fontSize: '12px', color: 'var(--text-secondary)',
              background: 'var(--bg-secondary)', cursor: 'pointer',
            }}>
              Esta semana ↓
            </div>
          )}
        </div>

        {/* Números grandes */}
        <div style={{ padding: '0 20px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div className="card" style={{ flex: 1, padding: '14px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Escaneos QR</div>
              <div style={{ fontSize: '26px', fontWeight: 500, marginTop: '4px' }}>{stats.escaneos}</div>
              {esBasico && <div style={{ fontSize: '11px', color: 'var(--color-green)', marginTop: '2px' }}>{porcentajeCambio(stats.escaneos, stats.escaneosAnterior)} vs anterior</div>}
              {!esBasico && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>esta semana</div>}
            </div>
            <div className="card" style={{ flex: 1, padding: '14px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Visitas al menú</div>
              <div style={{ fontSize: '26px', fontWeight: 500, marginTop: '4px' }}>{stats.visitas}</div>
              {esBasico && <div style={{ fontSize: '11px', color: 'var(--color-green)', marginTop: '2px' }}>{porcentajeCambio(stats.visitas, stats.visitasAnterior)} vs anterior</div>}
              {!esBasico && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>esta semana</div>}
            </div>
          </div>
        </div>

        {/* PRO: Embudo de conversión */}
        {esPro ? (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div className="card" style={{ padding: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '12px' }}>Embudo de conversión</div>
              {[
                { label: 'Escanearon QR', valor: stats.escaneos, pct: 100 },
                { label: 'Exploraron el menú', valor: Math.round(stats.escaneos * 0.61), pct: 61 },
                { label: 'Pidieron por WhatsApp', valor: stats.pedidosWhatsapp, pct: Math.round((stats.pedidosWhatsapp / stats.escaneos) * 100) },
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
        {esBasico && (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div className="card" style={{ padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>Escaneos por día</div>
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
                    {esPro && <div style={{ flex: 1, background: 'var(--border-light)', borderRadius: '2px', height: `${(d.anterior / maxEscaneo) * 80}px`, opacity: 0.5 }} />}
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

        {/* PRO: WhatsApp + Calificación */}
        {esPro ? (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div className="card" style={{ flex: 1, padding: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Pedidos WhatsApp</div>
                <div style={{ fontSize: '26px', fontWeight: 500, marginTop: '4px' }}>{stats.pedidosWhatsapp}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-green)', marginTop: '2px' }}>+{stats.pedidosWhatsapp - stats.pedidosAnterior} vs anterior</div>
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
        ) : esBasico ? (
          <div style={{ padding: '0 20px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div className="card" style={{ flex: 1, padding: '16px', textAlign: 'center', opacity: 0.5 }}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>🔒</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Pedidos WhatsApp</div>
              </div>
              <div className="card" style={{ flex: 1, padding: '16px', textAlign: 'center', opacity: 0.5 }}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>🔒</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Calificación promedio</div>
              </div>
            </div>
          </div>
        ) : null}

        {/* BÁSICO+: Platos más vistos */}
        {esBasico ? (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div className="card" style={{ padding: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '12px' }}>
                {esPro ? 'Platos: vistas vs pedidos' : 'Platos más vistos'}
              </div>
              {platosMasVistos.map((p, i) => (
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
        {esBasico ? (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div className="card" style={{ padding: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '12px' }}>Horarios con más escaneos</div>
              {horariosPico.map((h, i) => (
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
        {esPro && (
          <div style={{ padding: '0 20px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div className="card" style={{ flex: 1, padding: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Mejor día del mes</div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>Viernes 14</div>
                <div style={{ fontSize: '12px', color: 'var(--color-green)', marginTop: '2px' }}>52 escaneos</div>
              </div>
              <div className="card" style={{ flex: 1, padding: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Peor día del mes</div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>Lunes 4</div>
                <div style={{ fontSize: '12px', color: 'var(--color-danger)', marginTop: '2px' }}>8 escaneos</div>
              </div>
            </div>
          </div>
        )}

        {/* PRO: Últimas reseñas */}
        {esPro && (
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
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--bg-secondary)' }}>Descargar reporte semanal</div>
                <div style={{ fontSize: '11px', color: 'var(--bg-secondary)', opacity: 0.6, marginTop: '2px' }}>PDF con resumen completo</div>
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