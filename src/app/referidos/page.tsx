'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks'
import { createClient } from '@/lib/supabase-browser'

export default function ReferidosPage() {
  const router = useRouter()
  const { usuario, restaurante: rest, cargando: cargandoAuth } = useAuth()
  const [copiado, setCopiado] = useState(false)
  const [referidos, setReferidos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!cargandoAuth && !usuario) router.push('/login')
  }, [cargandoAuth, usuario, router])

  useEffect(() => {
    if (!rest?.id) return

    async function cargar() {
      const supabase = createClient()

      // Si no tiene código, generar uno
      if (!rest!.codigo_referido) {
        const codigo = rest!.nombre.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase()
        await supabase.from('restaurantes').update({ codigo_referido: codigo }).eq('id', rest!.id)
      }

      // Cargar referidos
      const { data: refs } = await supabase
        .from('referidos')
        .select('*, restaurantes!referidos_referido_id_fkey(nombre)')
        .eq('referidor_id', rest!.id)
        .order('created_at', { ascending: false })

      if (refs) {
        setReferidos(refs.map((r: any) => ({
          id: r.id,
          nombre: r.restaurantes?.nombre || 'Restaurante pendiente',
          estado: r.estado,
          beneficio: r.beneficio_aplicado,
          fecha: new Date(r.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }),
        })))
      }

      setCargando(false)
    }
    cargar()
  }, [rest?.id])

  const codigo = rest?.codigo_referido || ''
  const enlaceReferido = `menuapp-iota.vercel.app/registro?ref=${codigo}`
  const activos = referidos.filter(r => r.estado === 'activo').length
  const pendientes = referidos.filter(r => r.estado === 'pendiente').length

  function copiarEnlace() {
    navigator.clipboard.writeText(`https://${enlaceReferido}`)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  function compartirWhatsApp() {
    const msg = `¡Hola! Te invito a crear el menú digital de tu restaurante con MenuApp. Es gratis para empezar y súper fácil. Regístrate con mi enlace y ambos ganamos 1 mes gratis: https://${enlaceReferido}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  function compartirGeneral() {
    if (navigator.share) {
      navigator.share({
        title: 'MenuApp — Menú digital para tu restaurante',
        text: 'Crea tu menú digital gratis con MenuApp',
        url: `https://${enlaceReferido}`,
      })
    } else {
      copiarEnlace()
    }
  }

  if (cargandoAuth || cargando) {
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
      <div style={{ maxWidth: '500px', minWidth: '320px', margin: '0 auto', paddingBottom: '40px' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span onClick={() => router.push('/dashboard')} style={{ fontSize: '18px', color: 'var(--text-secondary)', cursor: 'pointer' }}>←</span>
          <span style={{ fontSize: '18px', fontWeight: 500 }}>Invitar restaurantes</span>
        </div>

        {/* Hero card */}
        <div style={{ padding: '0 20px', marginBottom: '16px' }}>
          <div style={{
            background: 'var(--text-primary)', borderRadius: 'var(--radius-lg)',
            padding: '24px', textAlign: 'center', color: 'white',
          }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>⭐</div>
            <div style={{ fontSize: '18px', fontWeight: 500, marginBottom: '6px' }}>Gana meses gratis</div>
            <div style={{ fontSize: '13px', opacity: 0.7, lineHeight: 1.5 }}>
              Invita a un restaurante. Cuando pague su primer mes, ambos reciben 1 mes gratis.
            </div>
          </div>
        </div>

        {/* Tu enlace */}
        <div style={{ padding: '0 20px', marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tu enlace de invitación</div>
          <div className="card" style={{
            padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontSize: '12px', color: 'var(--color-info)', wordBreak: 'break-all' }}>{enlaceReferido}</div>
            <span onClick={copiarEnlace} style={{
              fontSize: '12px', fontWeight: 500, cursor: 'pointer', flexShrink: 0, marginLeft: '10px',
              color: copiado ? 'var(--color-green)' : 'var(--color-info)',
            }}>
              {copiado ? '✓ Copiado' : 'Copiar'}
            </span>
          </div>
        </div>

        {/* Código de referido */}
        <div style={{ padding: '0 20px', marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tu código</div>
          <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 600, letterSpacing: '4px', color: 'var(--text-primary)' }}>{codigo}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>El restaurante puede ingresarlo al registrarse</div>
          </div>
        </div>

        {/* Compartir por */}
        <div style={{ padding: '0 20px', marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Compartir por</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div onClick={compartirWhatsApp} className="card" style={{ flex: 1, padding: '14px', textAlign: 'center', cursor: 'pointer' }}>
              <div style={{ fontSize: '20px', marginBottom: '4px' }}>💬</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>WhatsApp</div>
            </div>
            <div onClick={copiarEnlace} className="card" style={{ flex: 1, padding: '14px', textAlign: 'center', cursor: 'pointer' }}>
              <div style={{ fontSize: '20px', marginBottom: '4px' }}>📋</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Copiar</div>
            </div>
            <div onClick={compartirGeneral} className="card" style={{ flex: 1, padding: '14px', textAlign: 'center', cursor: 'pointer' }}>
              <div style={{ fontSize: '20px', marginBottom: '4px' }}>↗</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Otro</div>
            </div>
          </div>
        </div>

        {/* Resumen */}
        <div style={{ padding: '0 20px', marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tu resumen</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div className="card" style={{ flex: 1, padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 500 }}>{referidos.length}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Invitados</div>
            </div>
            <div className="card" style={{ flex: 1, padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 500 }}>{activos}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Activos</div>
            </div>
            <div style={{
              flex: 1, padding: '14px', textAlign: 'center', borderRadius: 'var(--radius-md)',
              background: 'var(--color-green-light)', border: '1px solid var(--color-green)',
            }}>
              <div style={{ fontSize: '22px', fontWeight: 500, color: 'var(--color-green)' }}>{activos}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-green)', marginTop: '2px' }}>Meses ganados</div>
            </div>
          </div>
        </div>

        {/* Historial de invitaciones */}
        <div style={{ padding: '0 20px', marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tus invitaciones</div>
          {referidos.length === 0 ? (
            <div className="card" style={{ padding: '30px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>📨</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Aún no has invitado a nadie</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>Comparte tu enlace y empieza a ganar meses gratis</div>
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              {referidos.map((ref: any, i: number) => (
                <div key={ref.id} style={{
                  padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderBottom: i < referidos.length - 1 ? '1px solid var(--border-light)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '8px',
                      background: 'var(--bg-tertiary)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', fontWeight: 500, color: 'var(--text-tertiary)',
                    }}>
                      {ref.nombre.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>{ref.nombre}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{ref.fecha}</div>
                    </div>
                  </div>
                  <div>
                    {ref.estado === 'activo' ? (
                      <span style={{
                        fontSize: '10px', fontWeight: 500, padding: '3px 8px', borderRadius: '4px',
                        background: 'var(--color-green-light)', color: 'var(--color-green)',
                      }}>+1 mes gratis</span>
                    ) : (
                      <span style={{
                        fontSize: '10px', fontWeight: 500, padding: '3px 8px', borderRadius: '4px',
                        background: 'var(--color-warning-light)', color: 'var(--color-warning)',
                      }}>Pendiente</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cómo funciona */}
        <div style={{ padding: '0 20px', marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cómo funciona</div>
          <div className="card" style={{ padding: '14px' }}>
            {[
              { num: '1', texto: 'Comparte tu enlace con otro restaurante' },
              { num: '2', texto: 'El restaurante se registra y paga su primer mes' },
              { num: '3', texto: 'Ambos reciben 1 mes gratis automáticamente' },
            ].map((paso, i) => (
              <div key={i} style={{
                display: 'flex', gap: '10px', alignItems: 'start',
                marginBottom: i < 2 ? '12px' : 0,
              }}>
                <div style={{
                  width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                  background: i === 2 ? 'var(--color-green-light)' : 'var(--bg-tertiary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 500,
                  color: i === 2 ? 'var(--color-green)' : 'var(--text-secondary)',
                }}>
                  {paso.num}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{paso.texto}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}