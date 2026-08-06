'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Clock, Smartphone, Trash2 } from 'lucide-react'
import Icono from '@/components/ui/Icono'
import Boton from '@/components/ui/Boton'
import PhoneInput from '@/components/ui/PhoneInput'
import ConfirmarEliminar from '@/components/menu-admin/ConfirmarEliminar'
import { useFuentePago } from '@/hooks/data/useFuentePago'
import { formatoPrecio } from '@/lib/precio'
import { precioDe, type Periodo } from '@/lib/planes'
import { fechaLargaColombia } from '@/lib/fechas'
import { restarDias, DIAS_ANTES_DE_COBRAR } from '@/lib/suscripciones'
import type { Plan } from '@/types'

// F4.c-4 — Tarjeta "Metodo de pago" de /suscripcion. Sustituye al cartel
// estatico que solo listaba los medios aceptados.
//
// GUARDA UN METODO. F4.c-5 agrega, SEPARADO, el interruptor de renovacion
// automatica: guardar el metodo y autorizar que te cobren siguen siendo dos
// decisiones distintas (F4.c-3), y por eso son dos controles y no uno. Se puede
// tener el Nequi guardado con la renovacion apagada, que es el estado en que
// queda todo el que enrolo antes de esta fase.

interface Props {
  restauranteId: string
  plan: Plan
  periodo: Periodo
  /** plan_expira de la fila. Es la fecha que produjo calcularPlanExpira en el
   *  webhook: la UI NO recalcula fechas de cobro (seria una segunda fuente de
   *  verdad, y ademas lib/wompi es server-only por su import de node:crypto). */
  planExpira: string | null | undefined
  /** restaurantes.cobro_automatico. Llega por prop y no se lee aqui para que la
   *  pagina y esta tarjeta pinten SIEMPRE el mismo estado: si cada una lo leyera
   *  por su cuenta podrian discrepar y una de las dos estaria mintiendo sobre
   *  el dinero del usuario. */
  cobroAutomatico: boolean
  /** Revalida la fila del restaurante tras encender/apagar. */
  onCambioCobro: () => void
}

export default function MetodoPago({
  restauranteId,
  plan,
  periodo,
  planExpira,
  cobroAutomatico,
  onCambioCobro,
}: Props) {
  const { data: fuente, isLoading, mutate } = useFuentePago(restauranteId)
  const [telefono, setTelefono] = useState('')
  const [aceptaReglamento, setAceptaReglamento] = useState(false)
  const [aceptaDatos, setAceptaDatos] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [quitando, setQuitando] = useState(false)
  const [cambiandoCobro, setCambiandoCobro] = useState(false)
  // Solo el metodo YA GUARDADO (AVAILABLE) se confirma: ahi hay algo que
  // perder. Cancelar un enrolamiento PENDING o reintentar tras un ERROR no
  // destruyen nada guardado — misma linea que CONFIRM-DELETE, que dejo las
  // desactivaciones reversibles sin confirmacion a proposito.
  const [confirmarQuitar, setConfirmarQuitar] = useState(false)
  const [error, setError] = useState('')
  const [permalinks, setPermalinks] = useState<{ politica: string | null; datos: string | null }>({
    politica: null,
    datos: null,
  })

  // Los permalinks se piden al server y NO se cablean: el spike verifico que los
  // reales difieren de los de la documentacion. Enlazar a un documento que no es
  // el vigente seria pedir consentimiento sobre un texto que el usuario no vio.
  useEffect(() => {
    let vivo = true
    fetch('/api/wompi/consentimiento')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d) setPermalinks({ politica: d.politica, datos: d.datos }) })
      .catch(() => {})
    return () => { vivo = false }
  }, [])

  const precio = precioDe(plan, periodo)
  const cadencia = periodo === 'anual' ? 'cada año' : 'cada mes'
  // LA FECHA DEL COBRO NO ES plan_expira. El cron cobra N dias ANTES del
  // vencimiento (para que un fallo deje el plan vivo y de tiempo a pagar a
  // mano), asi que anunciar plan_expira aqui seria decirle al usuario una fecha
  // en la que su plata NO se mueve. Se deriva de la MISMA constante y la MISMA
  // funcion pura que usa la regla del cron: si N cambia, este texto cambia solo.
  // restarDias devuelve '' con una fecha invalida y el copy cae al texto sin fecha.
  const fechaCobro = planExpira
    ? fechaLargaColombia(restarDias(planExpira, DIAS_ANTES_DE_COBRAR))
    : ''
  const fechaVence = planExpira ? fechaLargaColombia(planExpira) : ''
  // Sin consentimiento no se habilita nada: son dos casillas SEPARADAS y
  // ninguna viene marcada. Un "acepto todo" no cumple el requisito.
  const listoParaEnviar =
    telefono.length === 10 && telefono.startsWith('3') && aceptaReglamento && aceptaDatos

  async function guardarNequi() {
    if (!listoParaEnviar || enviando) return
    setEnviando(true)
    setError('')
    try {
      const res = await fetch('/api/wompi/fuentes/nequi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefono, aceptaReglamento, aceptaDatos }),
      })
      if (!res.ok) {
        setError(
          res.status === 409
            ? 'Ya tienes un método de pago guardado o en proceso.'
            : 'No pudimos conectar con Nequi. Intenta de nuevo en un momento.'
        )
        return
      }
      // La fila nace PENDING; el hook empieza a sondear hasta que el webhook
      // la mueva. No se escribe nada optimista.
      setTelefono('')
      setAceptaReglamento(false)
      setAceptaDatos(false)
      await mutate()
    } catch {
      setError('No pudimos conectar con Nequi. Intenta de nuevo en un momento.')
    } finally {
      setEnviando(false)
    }
  }

  // Encender/apagar la renovacion automatica. Es la unica accion de esta
  // pantalla que autoriza (o retira) un movimiento de plata futuro, asi que se
  // hace contra el server: ahi vive la guarda de "no se enciende sin fuente
  // AVAILABLE" y la fila de la bitacora de consentimiento.
  async function cambiarCobroAutomatico(activar: boolean) {
    if (cambiandoCobro) return
    setCambiandoCobro(true)
    setError('')
    try {
      const res = await fetch('/api/wompi/cobro-automatico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activar }),
      })
      if (!res.ok) {
        setError(
          activar
            ? 'No pudimos activar la renovación automática. Intenta de nuevo.'
            : 'No pudimos desactivar la renovación automática. Intenta de nuevo.'
        )
        return
      }
      // NADA optimista: el interruptor solo se mueve cuando la fila ya cambio.
      onCambioCobro()
    } catch {
      setError('No pudimos guardar el cambio. Intenta de nuevo.')
    } finally {
      setCambiandoCobro(false)
    }
  }

  async function quitarMetodo() {
    if (quitando) return
    setQuitando(true)
    setError('')
    try {
      const res = await fetch('/api/wompi/fuentes/revocar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: 'usuario_solicito' }),
      })
      if (!res.ok) {
        setError('No pudimos quitar el método. Intenta de nuevo.')
        return
      }
      await mutate()
      // Quitar el metodo APAGA el cobro automatico en el server: hay que
      // revalidar tambien la fila del restaurante o la pagina seguiria diciendo
      // "Se renueva el X" sin nada contra que cobrar.
      onCambioCobro()
    } catch {
      setError('No pudimos quitar el método. Intenta de nuevo.')
    } finally {
      setQuitando(false)
    }
  }

  const titulo = (
    <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      Método de pago
    </div>
  )

  if (isLoading) {
    return (
      <div style={{ padding: '0 20px', marginBottom: '10px', marginTop: '6px' }}>
        {titulo}
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Cargando...</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 20px', marginBottom: '10px', marginTop: '6px' }}>
      {titulo}
      <div className="card" style={{ padding: '16px' }}>

        {/* ── AVAILABLE: metodo guardado ── */}
        {fuente?.estado === 'AVAILABLE' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: 'var(--color-green)', lineHeight: 0 }}><Icono icono={Smartphone} size={18} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>Nequi {fuente.telefono_enmascarado}</div>
                {/* El subtitulo describe el estado REAL de esta fila, no el de la
                    funcionalidad en general: con el interruptor apagado, "no
                    cobramos nada automáticamente" sigue siendo literalmente
                    cierto para este usuario. */}
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                  {cobroAutomatico
                    ? 'Con este método renovamos tu plan automáticamente.'
                    : 'Método guardado. No cobramos nada automáticamente.'}
                </div>
              </div>
            </div>

            {/* ── EL OPT-IN (F4.c-5) ──
                La divulgacion va ARRIBA del interruptor y esta SIEMPRE visible,
                encendido o apagado: los terminos de un cobro recurrente no
                pueden vivir en un cartel que desaparece justo despues de
                aceptarlos. Monto de lib/planes, fecha de plan_expira: ni un solo
                numero escrito a mano. */}
            <div style={{
              background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
              padding: '12px', marginTop: '12px', fontSize: '11px',
              color: 'var(--text-secondary)', lineHeight: 1.6,
            }}>
              <div>Monto: <strong style={{ color: 'var(--text-primary)' }}>${formatoPrecio(precio)}</strong> {cadencia}</div>
              <div>
                {cobroAutomatico ? 'Próximo cobro: ' : 'Se cobraría el: '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {fechaCobro || 'unos días antes de que venza tu plan'}
                </strong>
                {/* Se dicen las DOS fechas: cobramos unos dias antes del
                    vencimiento y el usuario tiene derecho a saber cual es cual,
                    para no ver un cargo "adelantado" y creer que le fallamos. */}
                {fechaVence && ` (tu plan vence el ${fechaVence})`}
              </div>
              <div>Se renueva {cadencia} hasta que tú lo apagues.</div>
              <div>Puedes apagarlo aquí mismo cuando quieras, sin perder el tiempo que ya pagaste.</div>
              <div>Método que se usa: <strong style={{ color: 'var(--text-primary)' }}>Nequi {fuente.telefono_enmascarado}</strong>.</div>
            </div>

            {/* Interruptor. NACE APAGADO para todo el mundo (la columna trae
                default false, F4.c-3): quien enrolo su Nequi antes de esta fase
                no queda suscrito por sorpresa. Encender es un acto explicito
                con los terminos a la vista justo encima; no lleva hoja de
                confirmacion porque la confirmacion seria repetir el texto que ya
                esta ahi. Apagar tampoco: salir tiene que ser mas facil que
                entrar (misma linea que CONFIRM-DELETE, que solo confirma lo que
                destruye algo). */}
            <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '12px', cursor: cambiandoCobro ? 'default' : 'pointer' }}>
              <input type="checkbox" checked={cobroAutomatico} disabled={cambiandoCobro}
                onChange={(e) => cambiarCobroAutomatico(e.target.checked)}
                style={{ marginTop: '2px', cursor: cambiandoCobro ? 'default' : 'pointer' }} />
              <span style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                Renovar mi plan automáticamente con este método
                {cambiandoCobro && <span style={{ color: 'var(--text-tertiary)' }}> · guardando...</span>}
              </span>
            </label>

            <Boton variante="terciario" tamano="sm" onClick={() => setConfirmarQuitar(true)} disabled={quitando}
              style={{ marginTop: '10px', color: 'var(--color-danger)' }}>
              <Icono icono={Trash2} size={14} />
              {quitando ? 'Quitando...' : 'Quitar método'}
            </Boton>
          </>
        )}

        {/* ── PENDING: esperando al usuario en su app Nequi ── */}
        {fuente?.estado === 'PENDING' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: 'var(--color-warning)', lineHeight: 0 }}><Icono icono={Clock} size={18} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>Abre tu app Nequi y aprueba la suscripción</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.45 }}>
                  Te enviamos una solicitud a Nequi {fuente.telefono_enmascarado}. Esta pantalla se
                  actualiza sola cuando la apruebes. Si no la apruebas no pasa nada: no se guarda
                  ningún método y no se cobra nada.
                </div>
              </div>
            </div>
            {/* Salida SIEMPRE disponible: el usuario no queda atrapado esperando
                una aprobacion que quiza nunca llegue. */}
            <Boton variante="secundario" tamano="sm" onClick={quitarMetodo} disabled={quitando}
              style={{ marginTop: '10px' }}>
              {quitando ? 'Cancelando...' : 'Cancelar'}
            </Boton>
          </>
        )}

        {/* ── ERROR: Nequi rechazo o el enrolamiento no se pudo completar ── */}
        {fuente?.estado === 'ERROR' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: 'var(--color-danger)', lineHeight: 0 }}><Icono icono={AlertCircle} size={18} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>No pudimos guardar tu Nequi</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.45 }}>
                  La solicitud no se aprobó o expiró. No se guardó ningún método y no se cobró nada.
                  Puedes intentarlo otra vez.
                </div>
              </div>
            </div>
            <Boton variante="secundario" tamano="sm" onClick={quitarMetodo} disabled={quitando}
              style={{ marginTop: '10px' }}>
              {quitando ? 'Intentando...' : 'Intentar de nuevo'}
            </Boton>
          </>
        )}

        {/* ── Sin fuente: formulario de enrolamiento ── */}
        {!fuente && (
          <>
            <div style={{ fontSize: '13px', fontWeight: 500 }}>Guarda tu Nequi para renovar más rápido</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px', lineHeight: 1.45 }}>
              Guardas el método una sola vez y no tienes que volver a escribir tus datos cada
              renovación.
            </div>

            {/* El enrolamiento NO enciende la renovacion automatica: ese
                interruptor aparece despues, ya con el metodo guardado (F4.c-5).
                Prometer aqui que "no se cobra nada" tiene que seguir siendo
                cierto, y lo es: guardar es guardar. */}

            {/* DIVULGACION COMPLETA, antes de los controles de consentimiento.
                El monto sale de lib/planes y la fecha de plan_expira: ningun
                numero de este bloque se escribe a mano. */}
            <div style={{
              background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
              padding: '12px', marginTop: '12px', fontSize: '11px',
              color: 'var(--text-secondary)', lineHeight: 1.6,
            }}>
              <div>Monto: <strong style={{ color: 'var(--text-primary)' }}>${formatoPrecio(precio)}</strong> {cadencia}</div>
              <div>
                Si la activas, el cobro sería el:{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {fechaCobro || 'unos días antes de que venza tu plan'}
                </strong>
              </div>
              <div>Guardar el método no inicia ningún cobro: la renovación automática se activa aparte, y viene apagada.</div>
              <div>Si la activas, tu plan se renovará {cadencia} hasta que tú la apagues.</div>
              <div>Cancelar nunca te quita el tiempo que ya pagaste: conservas tu plan hasta la fecha de vencimiento.</div>
              <div>Método que se guarda: <strong style={{ color: 'var(--text-primary)' }}>Nequi</strong> (el número que escribas abajo).</div>
            </div>

            <div style={{ marginTop: '12px' }}>
              <PhoneInput value={telefono} onChange={setTelefono} disabled={enviando} />
            </div>

            {/* DOS casillas SEPARADAS, ninguna premarcada, cada una con su
                propio enlace. Son dos contratos distintos. */}
            <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={aceptaReglamento} disabled={enviando}
                onChange={(e) => setAceptaReglamento(e.target.checked)}
                style={{ marginTop: '2px', cursor: 'pointer' }} />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                Acepto el{' '}
                <a href={permalinks.politica ?? undefined} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--color-accent)' }}>
                  reglamento de usuarios
                </a>{' '}
                de Wompi.
              </span>
            </label>

            <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={aceptaDatos} disabled={enviando}
                onChange={(e) => setAceptaDatos(e.target.checked)}
                style={{ marginTop: '2px', cursor: 'pointer' }} />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                Autorizo el{' '}
                <a href={permalinks.datos ?? undefined} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--color-accent)' }}>
                  tratamiento de mis datos personales
                </a>.
              </span>
            </label>

            <Boton variante="primario" onClick={guardarNequi}
              disabled={!listoParaEnviar || enviando}
              style={{ width: '100%', marginTop: '12px' }}>
              {enviando ? 'Enviando a Nequi...' : 'Guardar mi Nequi'}
            </Boton>
          </>
        )}

        {error && (
          <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: '8px' }}>{error}</div>
        )}
      </div>

      {/* CONFIRM-SUSCRIPCION: quitar el metodo guardado. Misma hoja compartida
          que platos/categorias/combos/promos — no hay una segunda. Cerrar sin
          confirmar no hace nada: quitarMetodo solo corre desde onConfirm. */}
      {confirmarQuitar && fuente?.estado === 'AVAILABLE' && (
        <ConfirmarEliminar
          titulo="¿Quitar este método de pago?"
          nombre={`Nequi ${fuente.telefono_enmascarado ?? ''}`}
          textoConfirmar="Sí, quitar"
          // El default ("Esta acción no se puede deshacer") seria FALSO: el
          // usuario puede volver a guardar su Nequi cuando quiera.
          textoPeligro="Si tu plan vence sin que lo pagues, pasarás a Gratis."
          onConfirm={quitarMetodo}
          onClose={() => setConfirmarQuitar(false)}
        >
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.5 }}>
            {cobroAutomatico
              ? 'Se quitará el método guardado y se apagará la renovación automática: tendrás que pagar tu plan a mano cada vez. Puedes volver a agregarlo cuando quieras.'
              : 'Se quitará el método guardado. Tu plan no se renovará automáticamente: tendrás que pagarlo a mano cada vez. Puedes volver a agregarlo cuando quieras.'}
          </div>
        </ConfirmarEliminar>
      )}
    </div>
  )
}
