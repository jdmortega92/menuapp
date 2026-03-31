'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ReferidosPage() {
  const router = useRouter()
  const [copiado, setCopiado] = useState(false)

  const restaurante = {
    nombre: 'La Parrilla de Juan',
    slug: 'la-parrilla-de-juan',
  }

  const enlaceReferido = `menuapp.co/invitar/${restaurante.slug}`

  const referidos = [
    { id: '1', nombre: 'El Buen Sabor', iniciales: 'EB', estado: 'activo', tiempo: 'Se unió hace 3 semanas' },
    { id: '2', nombre: 'Doña Carmen', iniciales: 'DC', estado: 'activo', tiempo: 'Se unió hace 1 semana' },
    { id: '3', nombre: 'La Tiendita', iniciales: 'LT', estado: 'pendiente', tiempo: 'Se registró hace 5 días' },
  ]

  const activos = referidos.filter(r => r.estado === 'activo').length
  const pendientes = referidos.filter(r => r.estado === 'pendiente').length
  const mesesGanados = activos

  function copiarEnlace() {
    navigator.clipboard.writeText(`https://${enlaceReferido}`)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto', paddingBottom: '40px' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span onClick={() => router.back()} style={{ fontSize: '18px', color: 'var(--text-secondary)', cursor: 'pointer' }}>←</span>
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
            <div style={{ fontSize: '13px', color: 'var(--color-info)' }}>{enlaceReferido}</div>
            <span onClick={copiarEnlace} style={{
              fontSize: '12px', fontWeight: 500, cursor: 'pointer',
              color: copiado ? 'var(--color-green)' : 'var(--color-info)',
            }}>
              {copiado ? '✓ Copiado' : 'Copiar'}
            </span>
          </div>
        </div>

        {/* Compartir por */}
        <div style={{ padding: '0 20px', marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Compartir por</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {[
              { icon: '💬', label: 'WhatsApp' },
              { icon: '📷', label: 'Instagram' },
              { icon: '↗', label: 'Otro' },
            ].map((red, i) => (
              <div key={i} className="card" style={{
                flex: 1, padding: '14px', textAlign: 'center', cursor: 'pointer',
              }}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>{red.icon}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{red.label}</div>
              </div>
            ))}
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
              <div style={{ fontSize: '22px', fontWeight: 500, color: 'var(--color-green)' }}>{mesesGanados}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-green)', marginTop: '2px' }}>Meses ganados</div>
            </div>
          </div>
        </div>

        {/* Historial de invitaciones */}
        <div style={{ padding: '0 20px', marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tus invitaciones</div>
          <div className="card" style={{ overflow: 'hidden' }}>
            {referidos.map((ref, i) => (
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
                    {ref.iniciales}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{ref.nombre}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{ref.tiempo}</div>
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