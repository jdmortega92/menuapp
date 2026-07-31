'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Clock, Smartphone, Trash2 } from 'lucide-react'
import Icono from '@/components/ui/Icono'
import Boton from '@/components/ui/Boton'
import PhoneInput from '@/components/ui/PhoneInput'
import { useFuentePago } from '@/hooks/data/useFuentePago'
import { formatoPrecio } from '@/lib/precio'
import { precioDe, type Periodo } from '@/lib/planes'
import { fechaLargaColombia } from '@/lib/fechas'
import type { Plan } from '@/types'

// F4.c-4 — Tarjeta "Metodo de pago" de /suscripcion. Sustituye al cartel
// estatico que solo listaba los medios aceptados.
//
// GUARDA UN METODO, NO COBRA. Nada de aqui cambia el plan ni dispara un pago:
// el usuario sigue pagando a mano por el Checkout Web, que esta intacto y es
// independiente de esta tarjeta. El cobro automatico es F4.c-5, y hasta
// entonces NINGUN texto de aqui puede prometer una renovacion automatica.

interface Props {
  restauranteId: string
  plan: Plan
  periodo: Periodo
  /** plan_expira de la fila. Es la fecha que produjo calcularPlanExpira en el
   *  webhook: la UI NO recalcula fechas de cobro (seria una segunda fuente de
   *  verdad, y ademas lib/wompi es server-only por su import de node:crypto). */
  planExpira: string | null | undefined
}

export default function MetodoPago({ restauranteId, plan, periodo, planExpira }: Props) {
  const { data: fuente, isLoading, mutate } = useFuentePago(restauranteId)
  const [telefono, setTelefono] = useState('')
  const [aceptaReglamento, setAceptaReglamento] = useState(false)
  const [aceptaDatos, setAceptaDatos] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [quitando, setQuitando] = useState(false)
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
  const fechaCobro = planExpira ? fechaLargaColombia(planExpira) : ''
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
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                  Método guardado. Todavía no cobramos nada automáticamente.
                </div>
              </div>
            </div>
            <Boton variante="terciario" tamano="sm" onClick={quitarMetodo} disabled={quitando}
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
                Próximo cobro:{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {fechaCobro || 'al vencer tu plan actual'}
                </strong>
              </div>
              {/* HOY esto es literalmente cierto: guardar el metodo no activa
                  ningun cobro. Cuando F4.c-5 encienda el cobro automatico, ESTE
                  es el texto que cambia. */}
              <div>Por ahora seguimos sin cobrarte automáticamente: guardar el método no inicia ningún cobro.</div>
              <div>Si algún día activas el cobro automático, se renovará hasta que tú lo canceles.</div>
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
    </div>
  )
}
