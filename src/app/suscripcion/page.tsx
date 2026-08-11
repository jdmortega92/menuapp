'use client'

import { useState, useEffect } from 'react'
import { Check, X } from 'lucide-react'
import Icono from '@/components/ui/Icono'
import Boton from '@/components/ui/Boton'
import MetodoPago from '@/components/suscripcion/MetodoPago'
import ConfirmarEliminar from '@/components/menu-admin/ConfirmarEliminar'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks'
import { useFuentePago } from '@/hooks/data/useFuentePago'
import { createClient } from '@/lib/supabase-browser'
import { formatoPrecio } from '@/lib/precio'
import { LISTA_PLANES, PLANES, ahorroAnual, precioDe, type Periodo } from '@/lib/planes'
import { fechaColombia, fechaLargaColombia } from '@/lib/fechas'
import type { Plan } from '@/types'

export default function SuscripcionPage() {
  const router = useRouter()
  const { usuario, restaurante: rest, cargando, mutateRestaurante } = useAuth()
  const [periodo, setPeriodo] = useState<Periodo>('mensual')
  // QUE plan esta en vuelo, no un booleano global: con un solo flag compartido
  // los tres botones mostraban el label de carga a la vez. null = nada en vuelo.
  const [planEnProceso, setPlanEnProceso] = useState<Plan | null>(null)
  const [pagoProcesando, setPagoProcesando] = useState(false)
  // Reactivar no es un cambio de plan: flag propio, fuera de planEnProceso.
  const [reactivando, setReactivando] = useState(false)
  // CONFIRM-SUSCRIPCION: bajar a Gratis termina la relacion comercial y hasta
  // hoy corria al primer clic desde DOS sitios (el boton de la card Gratis y el
  // enlace "Cancelar suscripción"). Se confirma en el ruteo, no en cada boton,
  // para que ninguna entrada quede sin puerta.
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)
  // Cancelar era la unica accion de esta pagina que podia fallar EN SILENCIO
  // (los errores solo iban a consola). Desde que cancelar tambien apaga el
  // cobro automatico hay un fallo que el usuario TIENE que ver: si no pudimos
  // apagarlo, no cancelamos, y callarlo lo dejaria creyendo que si.
  const [errorCancelar, setErrorCancelar] = useState('')
  // Mientras algo esta en vuelo se deshabilitan TODOS los botones (evita dobles
  // cobros), pero solo el del plan en vuelo cambia de label.
  const cambiando = planEnProceso !== null
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
  // Vencimiento VIGENTE ('' si no hay, si no calza la forma o si ya paso). Es el
  // tiempo que el usuario YA PAGO y que cancelar no puede quitarle (F4.b-1).
  const expiraYmd = (rest?.plan_expira ?? '').slice(0, 10)
  const expiraVigente =
    /^\d{4}-\d{2}-\d{2}$/.test(expiraYmd) && expiraYmd >= fechaColombia() ? expiraYmd : ''
  // Cancelar solo se AGENDA si hay plan pago con tiempo restante; sin tiempo
  // restante se mantiene la bajada inmediata de siempre.
  const puedeProgramar = planActual !== 'gratis' && expiraVigente !== ''
  // Bajada ya agendada: la fila conserva plan/periodo hasta la fecha.
  const fechaProgramada = (rest?.fecha_cambio_programado ?? '').slice(0, 10)
  const hayCambioProgramado = Boolean(rest?.plan_programado && fechaProgramada)
  // Misma clave SWR que usa MetodoPago: el hook deduplica, asi que esto NO es
  // una segunda consulta ni una segunda fuente de verdad — las dos pintan la
  // misma fila.
  const { data: fuentePago } = useFuentePago(rest?.id)
  // RENOVACION AUTOMATICA REAL, evaluada POR FILA. Exige las DOS cosas: el
  // opt-in del usuario Y una fuente contra la cual cobrar. Un solo flag para
  // todo el mundo seria mentirle a la mitad, y las dos mentiras posibles duelen
  // en direcciones opuestas: prometer una renovacion que no va a ocurrir deja a
  // alguien en gratis sin avisar, y negar una que SI va a ocurrir es un cobro
  // sorpresa. Es exactamente el par de condiciones que evalua debeCobrarse.
  const renuevaAutomatico =
    Boolean(rest?.cobro_automatico) && fuentePago?.estado === 'AVAILABLE'

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
  // Luego se limpia ?estado de la URL con replaceState: reescribe la entrada
  // ACTUAL del historial (la del aterrizaje), asi un refresh o un forward/back
  // no revive el banner ni deja el param en lo que el usuario copie. OJO: esto
  // NO saca a Wompi del historial (esa entrada es anterior y ningun JS puede
  // borrarla); de eso se encarga el back-arrow propio del header, que empuja
  // /dashboard en vez de confiar en el historial.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('estado') === 'procesando') {
      setPagoProcesando(true)
      mutateRestaurante()
      const url = new URL(window.location.href)
      url.searchParams.delete('estado')
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }, [mutateRestaurante])

  // El banner es transitorio, no permanente: si la fila revalidada ya muestra un
  // plan pago vigente, el webhook confirmo y no hay nada que "estar confirmando".
  useEffect(() => {
    if (pagoProcesando && planPagoActivo) setPagoProcesando(false)
  }, [pagoProcesando, planPagoActivo])

  // Regreso con el boton ATRAS del navegador desde el checkout de Wompi. La
  // pagina vuelve del bfcache SIN remontar, con el estado congelado: sin esto
  // el boton se queda en "Cambiando..." para siempre. persisted=true es
  // exactamente esa restauracion (en una carga normal el componente monta de
  // cero y planEnProceso ya nace en null). NO se usa visibilitychange: tambien
  // dispara al cambiar de pestana, y limpiaria el estado con el POST del
  // checkout todavia en vuelo. Solo se toca planEnProceso: el banner de
  // ?estado=procesando lo gobierna su propio efecto, intacto.
  //
  // Este patron aplica a CUALQUIER pagina que navegue fuera en la misma pestana
  // teniendo estado de carga vivo. Hoy esta es la unica: el resto usa
  // window.open (pestana nueva, no congela) y el boton de Google de /registro
  // (handleGoogle -> signInWithOAuth, redirect en la misma pestana) se salva
  // solo porque NO marca ningun flag de carga. Si algun dia se le agrega uno,
  // necesita este mismo pageshow o heredara el bug.
  useEffect(() => {
    const alRestaurar = (e: PageTransitionEvent) => {
      if (e.persisted) setPlanEnProceso(null)
    }
    window.addEventListener('pageshow', alRestaurar)
    return () => window.removeEventListener('pageshow', alRestaurar)
  }, [])

  // Ruteo del boton: bajar a gratis es cambio directo; subir a un plan pago
  // pasa por Wompi (F4.a-2) y NO escribe el plan aqui (lo confirma el webhook).
  function cambiarPlan(nuevoPlan: Plan) {
    if (!rest?.id) return
    // Bajar a Gratis NO se ejecuta al primer clic: abre la hoja compartida.
    // bajarAGratis solo corre desde su onConfirm, asi que cerrar sin confirmar
    // no toca nada.
    if (nuevoPlan === 'gratis') {
      setConfirmarCancelar(true)
      return
    }
    void iniciarPagoWompi(nuevoPlan)
  }

  // Cancelar NO es bajar de plan (F4.b-1). Con tiempo pagado por delante el
  // cambio se AGENDA y el usuario conserva lo que compró hasta el vencimiento
  // (estándar de la industria: cancelar = no renovar). Solo cuando no queda
  // tiempo (sin plan_expira o ya vencido) la bajada se aplica en el acto.
  //
  // CANCELAR APAGA EL COBRO AUTOMÁTICO (F4.c-5). Quien cancela dijo "para":
  // dejar el opt-in encendido junto a una bajada agendada es una contradicción
  // que hoy nadie vería, porque debeCobrarse ya se niega si hay plan_programado
  // y el plan gratis no se cobra — la bandera se quedaría en true PARA SIEMPRE
  // y solo reaparecería el día que el usuario volviera a un plan pago, armando
  // un cobro recurrente que nunca volvió a autorizar. El método guardado NO se
  // toca: apagar la renovación y borrar la tarjeta son decisiones distintas
  // (misma línea que F4.c-3), y el usuario puede reactivar y volver a
  // encenderla a mano.
  async function bajarAGratis() {
    if (!rest?.id) return
    setPlanEnProceso('gratis')
    setErrorCancelar('')
    const supabase = createClient()

    // SE APAGA ANTES DE CANCELAR, y si no se puede apagar NO se cancela. El
    // orden importa porque los dos fallos posibles no cuestan lo mismo:
    // apagado sin cancelación deja a alguien con su plan vivo y la renovación
    // apagada (visible, reversible con un clic, y erra hacia NO mover plata);
    // cancelación sin apagado deja exactamente la bandera armada que este
    // bloque existe para eliminar. Va por la ruta del server y no por un update
    // suelto: esta columna deja línea de log y fila en la bitácora de
    // consentimiento, y un update desde el navegador no deja ninguna de las dos.
    if (rest.cobro_automatico) {
      try {
        const res = await fetch('/api/wompi/cobro-automatico', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activar: false, motivo: 'suscripcion_cancelada' }),
        })
        if (!res.ok) {
          setErrorCancelar('No pudimos apagar la renovación automática, así que no cancelamos tu plan. Intenta de nuevo.')
          setPlanEnProceso(null)
          return
        }
      } catch {
        setErrorCancelar('No pudimos apagar la renovación automática, así que no cancelamos tu plan. Intenta de nuevo.')
        setPlanEnProceso(null)
        return
      }
    }

    // fue_pago es un latch one-way (STRATEGIC.2): NINGUNA de las dos ramas lo
    // toca (solo el pago lo activa). De él depende la regla de fotos del plan
    // gratis (lib/fotosGate); resetearlo republicaría fotos que estaban ocultas.
    const { error } = puedeProgramar
      ? await supabase
          .from('restaurantes')
          .update({ plan_programado: 'gratis', fecha_cambio_programado: expiraVigente })
          .eq('id', rest.id)
      : await supabase
          .from('restaurantes')
          // periodo_plan NO se toca: es el periodo COMPRADO, no el del toggle.
          .update({ plan: 'gratis' })
          .eq('id', rest.id)

    // Refresca la fila cacheada (useAuth/useRestauranteByUserId) para que el plan
    // nuevo se refleje en todo el admin sin reload (patrón mutate de H.1.c.2.b).
    await mutateRestaurante()
    if (!error && planActual !== 'gratis') {
      // Correo de cambio de plan (F3): fire-and-forget, nunca bloquea el flujo.
      // Con fecha_cambio el copy dice "cambiará el <fecha>" en vez de "ya está
      // aplicado" — que sería mentira mientras el plan siga vivo.
      fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'cambio_plan',
          plan_nuevo: 'gratis',
          plan_anterior: planActual,
          periodo_anterior: periodoActual,
          ...(puedeProgramar ? { fecha_cambio: expiraVigente } : {}),
        }),
      }).catch(console.error)
    }
    setPlanEnProceso(null)
    // Agendado: se queda en la página para que el usuario VEA el estado de
    // retención (sigue teniendo su plan). Inmediato: al dashboard, como siempre.
    if (!puedeProgramar) router.push('/dashboard')
  }

  // Deshacer la cancelación (patrón "Restart membership"). Solo limpia las dos
  // columnas: el plan nunca se bajó, así que no hay nada que restaurar.
  //
  // NO REENCIENDE cobro_automatico, A PROPÓSITO. Es asimétrico y tiene que
  // serlo: cancelar es el usuario diciendo "para" y apagar el cobro es
  // obedecerlo, pero reactivar el plan NO es pedir que le vuelvan a sacar plata
  // sola. Rearmar un cargo recurrente porque el usuario pulsó "Reactivar"
  // sería exactamente el cobro sorpresa que todo F4.c evita: encenderlo vuelve
  // a ser un acto explícito, con los términos a la vista, en la tarjeta de
  // método de pago. Si alguien "arregla" esta asimetría, rompe esa garantía.
  async function reactivarSuscripcion() {
    if (!rest?.id) return
    setReactivando(true)
    const supabase = createClient()
    await supabase
      .from('restaurantes')
      .update({ plan_programado: null, fecha_cambio_programado: null })
      .eq('id', rest.id)
    await mutateRestaurante()
    setReactivando(false)
  }

  async function iniciarPagoWompi(nuevoPlan: Plan) {
    setPlanEnProceso(nuevoPlan)
    try {
      const res = await fetch('/api/wompi/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: nuevoPlan, periodo }),
      })
      const data = await res.json()
      if (!res.ok || !data?.url) {
        console.error('[suscripcion] checkout Wompi fallo:', data?.error)
        setPlanEnProceso(null)
        return
      }
      // Redirige al Checkout de Wompi. El plan NO se escribe optimista: el
      // webhook /api/wompi/eventos lo activa cuando la transaccion es APPROVED.
      window.location.href = data.url
    } catch (err) {
      console.error('[suscripcion] error iniciando pago:', err)
      setPlanEnProceso(null)
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
  // QUÉ dice esa fecha depende de ESTA fila, no del estado del producto.
  // Con cobro automático activo la fecha es de RENOVACIÓN; sin él sigue siendo
  // de VENCIMIENTO y el copy honesto de F4.b-2 se mantiene tal cual.
  // Una bajada agendada gana sobre todo: ahí la fecha es de finalización (y el
  // cron nunca cobra esa fila), y el bloque de retención de arriba ya la explica.
  const renovacionTexto = renovacion
    ? hayCambioProgramado
      ? `Activo hasta el ${renovacion}`
      : expiraVigente
        ? renuevaAutomatico
          ? `Se renueva el ${renovacion}`
          : `Tu plan vence el ${renovacion}`
        : `Tu plan venció el ${renovacion}`
    : ''
  const mostrarAvisoPago = planActual !== 'gratis' && renovacion !== '' && !hayCambioProgramado
  const fechaProgramadaLarga = fechaProgramada ? fechaLargaColombia(fechaProgramada) : ''
  const nombrePlanActual = planes.find(p => p.id === planActual)?.nombre ?? planActual
  const nombrePlanProgramado =
    planes.find(p => p.id === rest?.plan_programado)?.nombre ?? rest?.plan_programado ?? ''

  return (
    <div style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '500px', minWidth: '320px', margin: '0 auto', paddingBottom: '40px' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Destino EXPLICITO, nunca router.back(): al volver del checkout de
              Wompi la entrada anterior del historial es el propio Wompi. */}
          <span onClick={() => router.push('/dashboard')} style={{ fontSize: '18px', color: 'var(--text-secondary)', cursor: 'pointer' }}>←</span>
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

        {/* Cambio agendado (retención). El plan NO se bajó: sigue vivo hasta la
            fecha, y desde aquí se puede deshacer la cancelación. */}
        {hayCambioProgramado && (
          <div style={{ padding: '0 20px', marginBottom: '12px' }}>
            <div style={{
              background: 'var(--color-warning-light)', border: '1px solid var(--color-warning)',
              borderRadius: 'var(--radius-md)', padding: '12px 14px',
            }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-warning)' }}>
                Tu plan {nombrePlanActual} sigue activo hasta el {fechaProgramadaLarga}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-warning)', opacity: 0.85, marginTop: '2px' }}>
                Después pasarás a {nombrePlanProgramado}. Conservas todo lo que pagaste hasta esa fecha.
              </div>
              <Boton variante="secundario" tamano="sm"
                onClick={reactivarSuscripcion}
                style={{ marginTop: '10px' }}
                disabled={reactivando}>
                {reactivando ? 'Reactivando...' : 'Reactivar suscripción'}
              </Boton>
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
                  ? 'Sin fecha de vencimiento'
                  : renovacionTexto || 'Suscripción activa'}
              </div>
              {mostrarAvisoPago && (
                <div style={{ fontSize: '11px', color: 'var(--color-accent-dark)', opacity: 0.7, marginTop: '4px', maxWidth: '230px', lineHeight: 1.4 }}>
                  {renuevaAutomatico
                    ? 'Se renueva automáticamente con tu método guardado. Puedes apagarlo abajo.'
                    : 'No se renueva automáticamente: para continuar, vuelve a pagarlo.'}
                </div>
              )}
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

                {/* Botón. Con una bajada ya agendada se oculta el de Gratis:
                    volvería a agendar lo mismo. Deshacer se hace arriba. */}
                {!esActual && !(hayCambioProgramado && plan.id === 'gratis') && (
                  <Boton variante={plan.id === 'gratis' ? 'secundario' : 'primario'}
                    onClick={() => cambiarPlan(plan.id)}
                    style={{ width: '100%', marginTop: '10px' }}
                    disabled={cambiando}>
                    {/* Solo el plan EN VUELO cambia de label; los demas quedan
                        deshabilitados con su texto normal (Boton los atenua). */}
                    {planEnProceso === plan.id ? 'Cambiando...' : plan.id === 'gratis' ? 'Bajar a Gratis' : `Subir a ${plan.nombre}`}
                  </Boton>
                )}
              </div>
            </div>
          )
        })}

        {/* Método de pago (F4.c-4). Guarda un método; NO cobra ni cambia el
            plan. Es independiente del flujo de compra de arriba. Misma condición
            que el cartel estático al que reemplaza: solo con plan pago, que es
            el único caso donde guardar un método sirve de algo. */}
        {planActual !== 'gratis' && rest?.id && (
          <MetodoPago
            restauranteId={rest.id}
            plan={planActual}
            periodo={periodoActual}
            planExpira={rest.plan_expira}
            cobroAutomatico={Boolean(rest.cobro_automatico)}
            onCambioCobro={mutateRestaurante}
          />
        )}

        {/* Credito referidos — OCULTO 2026-07-27 (BL.46). Prometia "gana meses
            gratis" en la pantalla donde el usuario decide si paga, pero el sistema
            de referidos no otorga nada: /registro ignora el ?ref=, nadie escribe en
            la tabla referidos y ningun codigo regala un mes. La pagina /referidos
            sigue existiendo (sin enlaces); reactivar este bloque y la fila del
            dropdown del dashboard cuando BL.46 se implemente. */}
        {/*
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
        */}

        {/* Cancelar. Oculto si ya hay una bajada agendada: no se puede cancelar
            dos veces, y el bloque de retención de arriba es el estado vigente. */}
        {planActual !== 'gratis' && !hayCambioProgramado && (
          <div style={{ padding: '0 20px', marginBottom: '16px', textAlign: 'center' }}>
            <span onClick={() => cambiarPlan('gratis')} style={{ fontSize: '12px', color: 'var(--color-danger)', cursor: 'pointer' }}>
              {planEnProceso === 'gratis' ? 'Cancelando...' : 'Cancelar suscripción'}
            </span>
            {errorCancelar && (
              <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: '6px', lineHeight: 1.45 }}>
                {errorCancelar}
              </div>
            )}
          </div>
        )}

        {/* CONFIRM-SUSCRIPCION: cancelar la suscripción. El copy dice lo que de
            verdad pasa, que NO es una pérdida inmediata: con tiempo pagado por
            delante F4.b-1 AGENDA el cambio y el plan sigue vivo hasta la fecha.
            Sin tiempo restante sí es inmediato, y entonces el copy lo dice —
            prometer una fecha que no existe sería mentir en la otra dirección. */}
        {confirmarCancelar && (
          <ConfirmarEliminar
            titulo="¿Cancelar tu suscripción?"
            nombre={`Plan ${nombrePlanActual}`}
            textoConfirmar="Sí, cancelar mi plan"
            // El neutro NO puede llamarse "Cancelar" aquí: al lado de "cancelar
            // la suscripción" las dos palabras dirían cosas opuestas.
            textoCancelar="Volver"
            textoPeligro={puedeProgramar
              ? 'Al llegar esa fecha perderás las funciones de tu plan.'
              : 'Perderás las funciones de tu plan de inmediato.'}
            onConfirm={bajarAGratis}
            onClose={() => setConfirmarCancelar(false)}
          >
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.5 }}>
              {puedeProgramar
                ? `Tu plan ${nombrePlanActual} sigue activo hasta el ${fechaLargaColombia(expiraVigente)}. Ese día pasarás a Gratis.`
                : 'No te queda tiempo pagado por delante, así que el cambio se aplica de inmediato.'}
            </div>
            {/* Apagar el cobro automático es una CONSECUENCIA DECLARADA de
                cancelar, no un efecto secundario silencioso: se anuncia con la
                misma condición con la que ocurre (cobro_automatico en true), y
                se dice también lo que NO pasa — el método guardado sobrevive,
                porque prometer de menos aquí sería asustar sin motivo. */}
            {Boolean(rest?.cobro_automatico) && (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.5 }}>
                También apagaremos el cobro automático. Tu método de pago guardado no se elimina.
              </div>
            )}
          </ConfirmarEliminar>
        )}

      </div>
    </div>
  )
}