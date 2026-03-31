'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SuscripcionPage() {
  const router = useRouter()
  const [periodo, setPeriodo] = useState<'mensual' | 'anual'>('mensual')
  const planActual = 'basico' // Demo: cambiar a 'gratis', 'basico', 'pro'

  const planes = [
    {
      id: 'gratis', nombre: 'Gratis', precioMensual: 0, precioAnual: 0,
      features: ['10 platos máximo', '1 categoría', 'QR básico', 'Escaneos y visitas'],
      noFeatures: ['Sin fotos', 'Sin estadísticas detalladas'],
    },
    {
      id: 'basico', nombre: 'Básico', precioMensual: 15000, precioAnual: 144000,
      features: ['Platos ilimitados', 'Categorías ilimitadas', 'Fotos opcionales', 'QR personalizado', 'Gráfica + platos más vistos', 'Horarios pico', 'Agotado en tiempo real', 'Personalización del menú'],
      noFeatures: ['Sin combos ni promos', 'Sin estadísticas avanzadas'],
    },
    {
      id: 'pro', nombre: 'Pro', precioMensual: 29000, precioAnual: 278400,
      features: ['Todo del Básico', 'Combos y promociones', 'Plato del día', 'Plato ganador', 'Calificaciones', 'Embudo de conversión', 'Vistas vs pedidos', 'Mejores y peores días', 'Reporte semanal PDF'],
      noFeatures: [],
    },
  ]

  return (
    <div style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto', paddingBottom: '40px' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span onClick={() => router.back()} style={{ fontSize: '18px', color: 'var(--text-secondary)', cursor: 'pointer' }}>←</span>
          <span style={{ fontSize: '18px', fontWeight: 500 }}>Mi suscripción</span>
        </div>

        {/* Plan actual */}
        <div style={{ padding: '0 20px', marginBottom: '16px' }}>
          <div style={{
            background: 'var(--color-info-light)', border: '1px solid var(--color-info)',
            borderRadius: 'var(--radius-md)', padding: '14px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--color-info)' }}>Tu plan actual</div>
              <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--color-info)', marginTop: '2px' }}>
                Plan {planes.find(p => p.id === planActual)?.nombre}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-info)', opacity: 0.7, marginTop: '2px' }}>Renueva el 15 de abril</div>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--color-info)' }}>
              ${planes.find(p => p.id === planActual)?.precioMensual.toLocaleString('es-CO')}
              <span style={{ fontSize: '11px', fontWeight: 400 }}>/mes</span>
            </div>
          </div>
        </div>

        {/* Toggle mensual / anual */}
        <div style={{ padding: '0 20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '3px' }}>
            <div onClick={() => setPeriodo('mensual')} style={{
              flex: 1, padding: '10px', textAlign: 'center', fontSize: '13px', cursor: 'pointer',
              fontWeight: periodo === 'mensual' ? 500 : 400, borderRadius: '8px',
              background: periodo === 'mensual' ? 'var(--bg-secondary)' : 'transparent',
              color: periodo === 'mensual' ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: periodo === 'mensual' ? 'var(--shadow-sm)' : 'none',
            }}>
              Mensual
            </div>
            <div onClick={() => setPeriodo('anual')} style={{
              flex: 1, padding: '10px', textAlign: 'center', fontSize: '13px', cursor: 'pointer',
              fontWeight: periodo === 'anual' ? 500 : 400, borderRadius: '8px',
              background: periodo === 'anual' ? 'var(--bg-secondary)' : 'transparent',
              color: periodo === 'anual' ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: periodo === 'anual' ? 'var(--shadow-sm)' : 'none',
            }}>
              Anual <span style={{ fontSize: '10px', color: 'var(--color-green)', fontWeight: 500 }}>-20%</span>
            </div>
          </div>
        </div>

        {/* Planes */}
        {planes.map((plan) => {
          const esActual = plan.id === planActual
          const precio = periodo === 'mensual' ? plan.precioMensual : Math.round(plan.precioAnual / 12)
          const precioTotal = periodo === 'anual' ? plan.precioAnual : null

          return (
            <div key={plan.id} style={{ padding: '0 20px', marginBottom: '10px' }}>
              <div style={{
                background: 'var(--bg-secondary)',
                border: esActual ? '2px solid var(--color-info)' : '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)', padding: '16px', position: 'relative',
              }}>
                {esActual && (
                  <div style={{
                    position: 'absolute', top: '-1px', right: '16px',
                    background: 'var(--color-info)', color: 'white',
                    fontSize: '10px', fontWeight: 500, padding: '3px 10px',
                    borderRadius: '0 0 6px 6px',
                  }}>Tu plan</div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 500 }}>{plan.nombre}</div>
                    <div style={{ fontSize: '22px', fontWeight: 500, marginTop: '2px' }}>
                      {precio === 0 ? '$0' : `$${precio.toLocaleString('es-CO')}`}
                      {precio > 0 && <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>/mes</span>}
                    </div>
                    {precioTotal && precio > 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                        ${precioTotal.toLocaleString('es-CO')}/año
                      </div>
                    )}
                  </div>
                </div>

                {/* Features */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: plan.noFeatures.length > 0 ? '8px' : '0' }}>
                  {plan.features.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span style={{ color: 'var(--color-green)', fontSize: '11px' }}>✓</span> {f}
                    </div>
                  ))}
                </div>
                {plan.noFeatures.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '14px' }}>
                    {plan.noFeatures.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#BBB' }}>
                        <span style={{ color: '#CCC' }}>✕</span> {f}
                      </div>
                    ))}
                  </div>
                )}

                {/* Botón */}
                {!esActual && (
                  <button className={plan.id === 'gratis' ? 'btn-outline' : plan.id === 'pro' ? 'btn-accent' : 'btn-primary'}
                    style={{ width: '100%', padding: '12px', fontSize: '13px', marginTop: '10px' }}>
                    {plan.id === 'gratis' ? 'Bajar a Gratis' : `Subir a ${plan.nombre}`}
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {/* Método de pago */}
        <div style={{ padding: '0 20px', marginBottom: '10px', marginTop: '6px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Método de pago</div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '13px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px', height: '20px', borderRadius: '4px', background: 'var(--bg-tertiary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '9px', color: 'var(--text-tertiary)', fontWeight: 500,
                }}>Neq</div>
                <div>
                  <div style={{ fontSize: '13px' }}>Nequi</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-green)' }}>Activo</div>
                </div>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--color-info)', cursor: 'pointer' }}>Cambiar</span>
            </div>
            <div style={{ padding: '13px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
              <span style={{ fontSize: '13px', color: 'var(--color-info)' }}>+ Agregar otro método</span>
              <span style={{ color: 'var(--text-tertiary)' }}>→</span>
            </div>
          </div>
        </div>

        {/* Crédito referidos */}
        <div style={{ padding: '0 20px', marginBottom: '16px' }}>
          <div style={{
            background: 'var(--color-green-light)', border: '1px solid var(--color-green)',
            borderRadius: 'var(--radius-md)', padding: '14px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-green)' }}>Crédito por referidos</div>
              <div style={{ fontSize: '11px', color: 'var(--color-green)', opacity: 0.7, marginTop: '2px' }}>Se aplica en tu próxima factura</div>
            </div>
            <div style={{ fontSize: '18px', fontWeight: 500, color: 'var(--color-green)' }}>2 meses</div>
          </div>
        </div>

        {/* Cancelar */}
        <div style={{ padding: '0 20px', marginBottom: '16px', textAlign: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-danger)', cursor: 'pointer' }}>Cancelar suscripción</span>
        </div>

      </div>
    </div>
  )
}