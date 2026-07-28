import { PUBLIC_BASE_URL } from '@/lib/urls'
import { fechaLargaColombia } from '@/lib/fechas'
import { envolverHtml, escaparHtml } from './base'
import type { EmailRenderizado } from './bienvenida'

// Jerarquía de planes para decidir la dirección del cambio.
const RANGO_PLAN: Record<string, number> = { gratis: 0, basico: 1, pro: 2 }

const NOMBRE_PLAN: Record<string, string> = { gratis: 'Gratis', basico: 'Básico', pro: 'Pro' }

// 2-3 funciones que se desbloquean al subir a cada plan.
const FUNCIONES_PLAN: Record<string, string[]> = {
  basico: ['Platos y categorías ilimitados', 'Fotos en tus platos', 'Estadísticas de tu menú'],
  pro: ['Combos y promociones', 'Estadísticas avanzadas', 'Todo lo del plan Básico'],
}

export interface CambioPlanParams {
  plan_nuevo: string
  plan_anterior: string
  // Opcionales por compatibilidad: sin periodo se usa el copy sin etiqueta.
  periodo_nuevo?: string
  periodo_anterior?: string
  /** Bajada DIFERIDA (F4.b-1): 'YYYY-MM-DD' en que se aplicará el cambio. Solo
   *  aplica a bajadas; sin ella el copy sigue siendo el inmediato de siempre. */
  fecha_cambio?: string
}

// Correo de cambio de plan (F3): copy distinto según la dirección.
// Subida: da la bienvenida al plan y nombra funciones desbloqueadas.
// Bajada: confirma el cambio, avisa qué deja de verse y deja la puerta abierta.
// Mismo plan con periodo distinto: solo cambia la facturación, copy propio
// sin lista de funciones (no se desbloqueó ni ocultó nada).
export function cambioPlan({ plan_nuevo, plan_anterior, periodo_nuevo, fecha_cambio }: CambioPlanParams): EmailRenderizado {
  const esSubida = (RANGO_PLAN[plan_nuevo] ?? 0) > (RANGO_PLAN[plan_anterior] ?? 0)
  const nombreNuevo = NOMBRE_PLAN[plan_nuevo] ?? plan_nuevo
  const urlSuscripcion = `${PUBLIC_BASE_URL}/suscripcion`

  if (plan_nuevo === plan_anterior && periodo_nuevo) {
    const titulo = `Tu plan ${nombreNuevo} ahora es ${periodo_nuevo}`
    const detalle = `Solo cambió la facturación de tu suscripción: desde tu próximo cobro será ${periodo_nuevo}. Tus funciones siguen exactamente igual.`

    const html = envolverHtml(`
          <h1 style="font-size:20px;color:#2A2523;margin:0 0 12px;">${escaparHtml(titulo)}</h1>
          <p style="font-size:14px;line-height:1.6;color:#2A2523;margin:0 0 24px;">${escaparHtml(detalle)}</p>
          <a href="${urlSuscripcion}" style="font-size:14px;color:#E85D24;font-weight:bold;text-decoration:none;">Ver mi plan &rarr;</a>
    `)

    const text = [titulo, '', detalle, '', `Ver mi plan: ${urlSuscripcion}`].join('\n')

    return { subject: titulo, html, text }
  }

  // El plan gratis no se factura: la etiqueta de periodo solo aplica a planes pagos.
  const etiquetaPeriodo = periodo_nuevo && plan_nuevo !== 'gratis' ? ` (${periodo_nuevo})` : ''
  const nombreConPeriodo = `${nombreNuevo}${etiquetaPeriodo}`

  if (esSubida) {
    const funciones = FUNCIONES_PLAN[plan_nuevo] ?? []
    const listaHtml = funciones
      .map((f) => `<span style="color:#E85D24;font-weight:bold;">&#10003;</span> ${escaparHtml(f)}`)
      .join('<br>')

    const html = envolverHtml(`
          <h1 style="font-size:20px;color:#2A2523;margin:0 0 12px;">¡Bienvenido al plan ${escaparHtml(nombreConPeriodo)}!</h1>
          <p style="font-size:14px;line-height:1.6;color:#2A2523;margin:0 0 20px;">
            Tu plan ya está activo. Desde ahora tienes desbloqueado:
          </p>
          <p style="font-size:14px;line-height:1.9;color:#2A2523;margin:0 0 24px;">${listaHtml}</p>
          <a href="${urlSuscripcion}" style="display:inline-block;background-color:#E85D24;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:8px;">Ver mi plan</a>
    `)

    const text = [
      `¡Bienvenido al plan ${nombreConPeriodo}!`,
      '',
      'Tu plan ya está activo. Desde ahora tienes desbloqueado:',
      '',
      ...funciones.map((f) => `- ${f}`),
      '',
      `Ver mi plan: ${urlSuscripcion}`,
    ].join('\n')

    return { subject: `Tu plan ${nombreConPeriodo} ya está activo`, html, text }
  }

  // Bajada: al plan gratis se ocultan fotos y funciones premium; entre planes
  // pagos solo se pierden las funciones del plan superior.
  const nota =
    plan_nuevo === 'gratis'
      ? 'Las fotos de tus platos y las funciones premium quedan ocultas, pero no se borran: si vuelves a un plan pago, todo reaparece tal como lo dejaste.'
      : 'Las funciones exclusivas de tu plan anterior quedan ocultas, pero no se borran: si vuelves a subir de plan, todo reaparece tal como lo dejaste.'

  // Bajada DIFERIDA (F4.b-1): el usuario canceló pero le queda ciclo pagado, así
  // que NADA cambia todavía. El copy inmediato ("ya está aplicado") sería falso.
  // Sin fecha_cambio, todo lo de abajo queda idéntico al comportamiento anterior.
  const fechaLarga = fecha_cambio ? fechaLargaColombia(fecha_cambio) : ''
  const esDiferido = fechaLarga !== ''

  const titulo = esDiferido
    ? `Tu plan cambiará a ${nombreConPeriodo} el ${fechaLarga}`
    : `Tu plan cambió a ${nombreConPeriodo}`
  const primeraLinea = esDiferido
    ? `Tu plan ${NOMBRE_PLAN[plan_anterior] ?? plan_anterior} sigue activo hasta el ${fechaLarga}: conservas todo lo que pagaste hasta esa fecha. Ese día pasarás a ${nombreNuevo}.`
    : 'Listo, el cambio ya está aplicado y tu menú sigue en línea.'
  const notaFinal = esDiferido
    ? `Después del cambio: ${nota.charAt(0).toLowerCase()}${nota.slice(1)}`
    : nota
  const enlaceTexto = esDiferido ? 'Reactivar mi plan' : 'Volver cuando quieras'

  const html = envolverHtml(`
          <h1 style="font-size:20px;color:#2A2523;margin:0 0 12px;">${escaparHtml(titulo)}</h1>
          <p style="font-size:14px;line-height:1.6;color:#2A2523;margin:0 0 16px;">
            ${escaparHtml(primeraLinea)}
          </p>
          <p style="font-size:14px;line-height:1.6;color:#2A2523;margin:0 0 24px;">${escaparHtml(notaFinal)}</p>
          <a href="${urlSuscripcion}" style="font-size:14px;color:#E85D24;font-weight:bold;text-decoration:none;">${escaparHtml(enlaceTexto)} &rarr;</a>
  `)

  const text = [
    titulo,
    '',
    primeraLinea,
    '',
    notaFinal,
    '',
    `${enlaceTexto}: ${urlSuscripcion}`,
  ].join('\n')

  return { subject: titulo, html, text }
}
