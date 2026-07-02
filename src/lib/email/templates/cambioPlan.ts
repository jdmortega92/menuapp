import { PUBLIC_BASE_URL } from '@/lib/urls'
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
}

// Correo de cambio de plan (F3): copy distinto según la dirección.
// Subida: da la bienvenida al plan y nombra funciones desbloqueadas.
// Bajada: confirma el cambio, avisa qué deja de verse y deja la puerta abierta.
export function cambioPlan({ plan_nuevo, plan_anterior }: CambioPlanParams): EmailRenderizado {
  const esSubida = (RANGO_PLAN[plan_nuevo] ?? 0) > (RANGO_PLAN[plan_anterior] ?? 0)
  const nombreNuevo = NOMBRE_PLAN[plan_nuevo] ?? plan_nuevo
  const urlSuscripcion = `${PUBLIC_BASE_URL}/suscripcion`

  if (esSubida) {
    const funciones = FUNCIONES_PLAN[plan_nuevo] ?? []
    const listaHtml = funciones
      .map((f) => `<span style="color:#E85D24;font-weight:bold;">&#10003;</span> ${escaparHtml(f)}`)
      .join('<br>')

    const html = envolverHtml(`
          <h1 style="font-size:20px;color:#2A2523;margin:0 0 12px;">¡Bienvenido al plan ${escaparHtml(nombreNuevo)}!</h1>
          <p style="font-size:14px;line-height:1.6;color:#2A2523;margin:0 0 20px;">
            Tu plan ya está activo. Desde ahora tienes desbloqueado:
          </p>
          <p style="font-size:14px;line-height:1.9;color:#2A2523;margin:0 0 24px;">${listaHtml}</p>
          <a href="${urlSuscripcion}" style="display:inline-block;background-color:#E85D24;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:8px;">Ver mi plan</a>
    `)

    const text = [
      `¡Bienvenido al plan ${nombreNuevo}!`,
      '',
      'Tu plan ya está activo. Desde ahora tienes desbloqueado:',
      '',
      ...funciones.map((f) => `- ${f}`),
      '',
      `Ver mi plan: ${urlSuscripcion}`,
    ].join('\n')

    return { subject: `Tu plan ${nombreNuevo} ya está activo`, html, text }
  }

  // Bajada: al plan gratis se ocultan fotos y funciones premium; entre planes
  // pagos solo se pierden las funciones del plan superior.
  const nota =
    plan_nuevo === 'gratis'
      ? 'Las fotos de tus platos y las funciones premium quedan ocultas, pero no se borran: si vuelves a un plan pago, todo reaparece tal como lo dejaste.'
      : 'Las funciones exclusivas de tu plan anterior quedan ocultas, pero no se borran: si vuelves a subir de plan, todo reaparece tal como lo dejaste.'

  const html = envolverHtml(`
          <h1 style="font-size:20px;color:#2A2523;margin:0 0 12px;">Tu plan cambió a ${escaparHtml(nombreNuevo)}</h1>
          <p style="font-size:14px;line-height:1.6;color:#2A2523;margin:0 0 16px;">
            Listo, el cambio ya está aplicado y tu menú sigue en línea.
          </p>
          <p style="font-size:14px;line-height:1.6;color:#2A2523;margin:0 0 24px;">${escaparHtml(nota)}</p>
          <a href="${urlSuscripcion}" style="font-size:14px;color:#E85D24;font-weight:bold;text-decoration:none;">Volver cuando quieras &rarr;</a>
  `)

  const text = [
    `Tu plan cambió a ${nombreNuevo}`,
    '',
    'Listo, el cambio ya está aplicado y tu menú sigue en línea.',
    '',
    nota,
    '',
    `Volver cuando quieras: ${urlSuscripcion}`,
  ].join('\n')

  return { subject: `Tu plan cambió a ${nombreNuevo}`, html, text }
}
