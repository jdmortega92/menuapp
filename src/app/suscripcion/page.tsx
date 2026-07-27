'use client'

import { useState, useEffect } from 'react'
import { Check, X } from 'lucide-react'
import Icono from '@/components/ui/Icono'
import Boton from '@/components/ui/Boton'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks'
import { createClient } from '@/lib/supabase-browser'
import { formatoPrecio } from '@/lib/precio'
import { LISTA_PLANES, PLANES, ahorroAnual, precioDe, type Periodo } from '@/lib/planes'
import { fechaColombia, fechaLargaColombia } from '@/lib/fechas'
import type { Plan } from '@/types'

export default function SuscripcionPage() {
  const router = useRouter()
  const { usuario, restaurante: rest, cargando, mutateRestaurante } = useAuth()
  const [periodo, setPeriodo] = useState<Periodo>('mensual')
  const [cambiando, setCambiando] = useState(false)
  const [pagoProcesando, setPagoProcesando] = useState(false)
  const planActual: Plan = rest?.plan || 'gratis'
  // periodo_plan es texto libre en DB: se estrecha a Periodo aquí (todo lo que no
  // sea 'anual' cuenta como mensual) para poder compararlo y tarifarlo sin casts.
  const periodoActual: Periodo = rest?.periodo_plan === 'anual' ? 'anual' : 'mensual'
  // Un plan pago con fecha de renovación vigente (comparación de fechas CALENDARIO
  // en COT, ambas 'YYYY-MM-DD'). Sin plan_expira se asume activo: el plan pago ya
  // está escrito y la fecha es opcional en filas anteriores al webhook.
  const planPagoActivo =
    planActual !== 'gratis' &&
    (!rest?.plan_expira || rest.plan_expira.slice(0, 10) >= fechaColombia())

  useEffect(() => {
    if (!cargando && !usuario) {
      router.push('/login')
    }
  }, [cargando, usuario, router])

  // Retorno desde el Checkout de Wompi (redirect-url ?estado=procesando). El
  // plan se activa async por el webhook; aqui solo mostramos "procesando".
  // Se lee de window (no useSearchParams) para no exigir un boundary Suspense.
  // El webhook suele ganarle al redirect, asi que se revalida la fila una vez:
  // el efecto de abajo baja el banner en cuanto llega el plan ya activo.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('estado') === 'procesando') {
      setPagoProcesando(true)
      mutateRestaurante()
    }
  }, [mutateRestaurante])

  // El banner es transitorio, no permanente: si la fila revalidada ya muestra un
  // plan pago vigente, el webhook confirmo y no hay nada que "estar confirmando".
  useEffect(() => {
    if (pagoProcesando && planPagoActivo) setPagoProcesando(false)
  }, [pagoProcesando, planPagoActivo])

  // Ruteo del boton: bajar a gratis es cambio directo; subir a un plan pago
  // pasa por Wompi (F4.a-2) y NO escribe el plan aqui (lo confirma el webhook).
  async function cambiarPlan(nuevoPlan: string) {
    if (!rest?.id) return
    if (nuevoPlan === 'gratis') return bajarAGratis()
    return iniciarPagoWompi(nuevoPlan)
  }

  async function bajarAGratis() {
    if (!rest?.id) return
    setCambiando(true)
    const supabase = createClient()
    // fue_pago es un latch one-way (STRATEGIC.2): bajar a gratis NO lo toca (solo
    // el pago lo activa). De él depende la regla de fotos del plan gratis (lib/fotosGate).
    const { error } = await supabase
      .from('restaurantes')
      .update({ plan: 'gratis', periodo_plan: periodo })
      .eq('id', rest.id)
    // Refresca la fila cacheada (useAuth/useRestauranteByUserId) para que el plan
    // nuevo se refleje en todo el admin sin reload (patrón mutate de H.1.c.2.b).
    await mutateRestaurante()
    if (!error && ('gratis' !== planActual || periodo !== periodoActual)) {
      // Correo de cambio de plan (F3): fire-and-forget, nunca bloquea el flujo.
      // Dispara también cuando solo cambia el periodo (p. ej. pro mensual -> anual).
      fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'cambio_plan',
          plan_nuevo: 'gratis',
          plan_anterior: planActual,
          periodo_nuevo: periodo,
          periodo_anterior: periodoActual,
        }),
      }).catch(console.error)
    }
    setCambiando(false)
    router.push('/dashboard')
  }

  async function iniciarPagoWompi(nuevoPlan: string) {
    setCambiando(true)
    try {
      const res = await fetch('/api/wompi/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: nuevoPlan, periodo }),
      })
      const data = await res.json()
      if (!res.ok || !data?.url) {
        console.error('[suscripcion] checkout Wompi fallo:', data?.error)
        setCambiando(false)
        return
      }
      // Redirige al Checkout de Wompi. El plan NO se escribe optimista: el
      // webhook /api/wompi/eventos lo activa cuando la transaccion es APPROVED.
      window.location.href = data.url
    } catch (err) {
      console.error('[suscripcion] error iniciando pago:', err)
      setCambiando(false)
    }
  }

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

  if (!usuario) return null

  // Precios y features: SIEMPRE desde lib/planes (fuente única, F4.a-1).
  const planes = LISTA_PLANES
  const descuentoAnual = Math.round((ahorroAnual('basico') / (PLANES.basico.precioMensual * 12)) * 100)
  // plan_expira llega de Postgres como timestamptz ('2026-08-27T00:00:00+00:00');
  // fechaLargaColombia lo formatea por fecha calendario y devuelve '' si no calza.
  const renovacion = rest?.plan_expira ? fechaLargaColombia(rest.plan_expira) : ''
  const renovacionTexto = renovacion ? `Renueva el ${renovacion}` : ''

  return (
    <div style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '500px', minWidth: '320px', margin: '0 auto', paddingBottom: '40px' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span onClick={() => router.back()} style={{ fontSize: '18px', color: 'var(--text-secondary)', cursor: 'pointer' }}>←</span>
          <span style={{ fontSize: '18px', fontWeight: 500 }}>Mi suscripción</span>
        </div>

        {/* Pago en proceso (retorno desde Wompi) */}
        {pagoProcesando && (
          <div style={{ padding: '0 20px', marginBottom: '12px' }}>
            <div style={{
              background: 'var(--color-accent-light)', border: '1px solid var(--color-accent)',
              borderRadius: 'var(--radius-md)', padding: '12px 14px',
            }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-accent-dark)' }}>Estamos confirmando tu pago</div>
              <div style={{ fontSize: '12px', color: 'var(--color-accent-dark)', opacity: 0.8, marginTop: '2px' }}>
                Wompi está procesando la transacción. Tu plan se activa en unos segundos; puedes refrescar esta página.
              </div>
            </div>
          </div>
        )}

        {/* Plan actual */}
        <div style={{ padding: '0 20px', marginBottom: '16px' }}>
          <div style={{
            background: 'var(--color-accent-light)', border: '1px solid var(--color-accent)',
            borderRadius: 'var(--radius-md)', padding: '14px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--color-accent-dark)' }}>Tu plan actual</div>
              <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--color-accent-dark)', marginTop: '2px' }}>
                Plan {planes.find(p => p.id === planActual)?.nombre}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-accent-dark)', opacity: 0.7, marginTop: '2px' }}>
                {planActual === 'gratis'
                  ? 'Sin fecha de renovación'
                  : renovacionTexto || 'Suscripción activa'}
              </div>
            </div>
            {/* Precio del periodo REALMENTE contratado (periodo_plan), no el mensual
                fijo: quien pagó el anual ve $290.000/año, no $29.000/mes. */}
            <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--color-accent-dark)' }}>
              ${formatoPrecio(precioDe(planActual, periodoActual))}
              <span style={{ fontSize: '11px', fontWeight: 400 }}>
                {planActual !== 'gratis' && periodoActual === 'anual' ? '/año' : '/mes'}
              </span>
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
              Anual <span style={{ fontSize: '10px', color: 'var(--color-green)', fontWeight: 500 }}>-{descuentoAnual}%</span>
            </div>
          </div>
        </div>

        {/* Planes */}
        {planes.map((plan) => {
          // "Actual" exige plan Y periodo: con el toggle en anual, un pro mensual
          // NO es el plan actual (y por eso debe poder contratarse).
          const esActual = plan.id === planActual && periodo === periodoActual
          const precio = periodo === 'mensual' ? plan.precioMensual : Math.round(plan.precioAnual / 12)
          const precioTotal = periodo === 'anual' ? plan.precioAnual : null

          return (
            <div key={plan.id} style={{ padding: '0 20px', marginBottom: '10px' }}>
              <div style={{
                background: 'var(--bg-secondary)',
                border: esActual ? '2px solid var(--color-accent)' : '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)', padding: '16px', position: 'relative',
              }}>
                {esActual && (
                  <div style={{
                    position: 'absolute', top: '-1px', right: '16px',
                    background: 'var(--color-accent)', color: 'white',
                    fontSize: '10px', fontWeight: 500, padding: '3px 10px',
                    borderRadius: '0 0 6px 6px',
                  }}>Tu plan</div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 500 }}>{plan.nombre}</div>
                    <div style={{ fontSize: '22px', fontWeight: 500, marginTop: '2px' }}>
                      {precio === 0 ? '$0' : `$${formatoPrecio(precio)}`}
                      {precio > 0 && <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)' }}>/mes</span>}
                    </div>
                    {precioTotal && precio > 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                        ${formatoPrecio(precioTotal)}/año
                      </div>
                    )}
                  </div>
                </div>

                {/* Features */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: plan.noFeatures.length > 0 ? '8px' : '0' }}>
                  {plan.features.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span style={{ color: 'var(--color-green)', lineHeight: 0 }}><Icono icono={Check} size={12} /></span> {f}
                    </div>
                  ))}
                </div>
                {plan.noFeatures.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '14px' }}>
                    {plan.noFeatures.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#BBB' }}>
                        <span style={{ color: '#CCC', lineHeight: 0 }}><Icono icono={X} size={12} /></span> {f}
                      </div>
                    ))}
                  </div>
                )}

                {/* Botón */}
                {!esActual && (
                  <Boton variante={plan.id === 'gratis' ? 'secundario' : 'primario'}
                    onClick={() => cambiarPlan(plan.id)}
                    style={{ width: '100%', marginTop: '10px' }}
                    disabled={cambiando}>
                    {cambiando ? 'Cambiando...' : plan.id === 'gratis' ? 'Bajar a Gratis' : `Subir a ${plan.nombre}`}
                  </Boton>
                )}
              </div>
            </div>
          )
        })}

        {/* Método de pago */}
        {planActual !== 'gratis' && (
          <div style={{ padding: '0 20px', marginBottom: '10px', marginTop: '6px' }}>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Método de pago</div>
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Pagos seguros con Wompi</div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>Nequi, Bancolombia, tarjeta de crédito/débito</div>
            </div>
          </div>
        )}

        {/* Crédito referidos */}
        <div style={{ padding: '0 20px', marginBottom: '16px' }}>
          <div onClick={() => router.push('/referidos')} style={{
            background: 'var(--color-green-light)', border: '1px solid var(--color-green)',
            borderRadius: 'var(--radius-md)', padding: '14px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
          }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-green)' }}>Invita restaurantes</div>
              <div style={{ fontSize: '11px', color: 'var(--color-green)', opacity: 0.7, marginTop: '2px' }}>Gana meses gratis por cada referido</div>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--color-green)', fontWeight: 500 }}>Ver →</span>
          </div>
        </div>

        {/* Cancelar */}
        {planActual !== 'gratis' && (
          <div style={{ padding: '0 20px', marginBottom: '16px', textAlign: 'center' }}>
            <span onClick={() => cambiarPlan('gratis')} style={{ fontSize: '12px', color: 'var(--color-danger)', cursor: 'pointer' }}>
              {cambiando ? 'Cancelando...' : 'Cancelar suscripción'}
            </span>
          </div>
        )}

      </div>
    </div>
  )
}