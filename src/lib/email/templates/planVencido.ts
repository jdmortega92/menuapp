import { PUBLIC_BASE_URL } from '@/lib/urls'
import { envolverHtml, escaparHtml } from './base'
import type { EmailRenderizado } from './bienvenida'

// Correo de plan VENCIDO (F4.b-2). Lo dispara el cron cuando plan_expira ya
// pasó y la cuenta cae a Gratis. Tono: informar sin alarmar — el menú SIGUE en
// línea y nada se borró; lo que se pierde son las funciones del plan pago.
// Nada aquí promete un cobro automático: hoy no existe (F4.c pendiente).

const NOMBRE_PLAN: Record<string, string> = { gratis: 'Gratis', basico: 'Básico', pro: 'Pro' }

// Lo que deja de verse al caer a Gratis. Espejo del copy de bajada de
// cambioPlan.ts: las fotos y las funciones premium se ocultan, NO se borran.
const QUE_SE_PIERDE = [
  'Las fotos de tus platos dejan de verse en el menú',
  'Las estadísticas detalladas quedan bloqueadas',
  'Los combos, promos y el plato del día se ocultan',
]

export function planVencido(planAnterior: string): EmailRenderizado {
  const nombreAnterior = NOMBRE_PLAN[planAnterior] ?? planAnterior
  const urlSuscripcion = `${PUBLIC_BASE_URL}/suscripcion`
  const titulo = `Tu plan ${nombreAnterior} venció`
  const entrada =
    'Tu menú sigue en línea y tus platos siguen ahí: tu cuenta pasó al plan Gratis, así que por ahora se ocultan las funciones del plan pago.'
  const cierre =
    'Nada se borró. Cuando vuelvas a activar tu plan, todo reaparece tal como lo dejaste.'

  const listaHtml = QUE_SE_PIERDE
    .map((f) => `<span style="color:#E85D24;font-weight:bold;">&middot;</span> ${escaparHtml(f)}`)
    .join('<br>')

  const html = envolverHtml(`
          <h1 style="font-size:20px;color:#2A2523;margin:0 0 12px;">${escaparHtml(titulo)}</h1>
          <p style="font-size:14px;line-height:1.6;color:#2A2523;margin:0 0 16px;">${escaparHtml(entrada)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr><td style="font-size:14px;line-height:1.9;color:#2A2523;">${listaHtml}</td></tr>
          </table>
          <p style="font-size:14px;line-height:1.6;color:#2A2523;margin:0 0 24px;">${escaparHtml(cierre)}</p>
          <a href="${urlSuscripcion}" style="display:inline-block;background-color:#E85D24;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:8px;">Activar mi plan de nuevo</a>
  `)

  const text = [
    titulo,
    '',
    entrada,
    '',
    ...QUE_SE_PIERDE.map((f) => `- ${f}`),
    '',
    cierre,
    '',
    `Activar mi plan de nuevo: ${urlSuscripcion}`,
  ].join('\n')

  return { subject: titulo, html, text }
}
