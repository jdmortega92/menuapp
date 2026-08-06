import { PUBLIC_BASE_URL } from '@/lib/urls'
import { fechaLargaColombia } from '@/lib/fechas'
import { formatoPrecio } from '@/lib/precio'
import { envolverHtml, escaparHtml } from './base'
import type { EmailRenderizado } from './bienvenida'

// Correo de RENOVACION COBRADA (F4.c-5). Lo dispara el WEBHOOK cuando una
// transaccion APPROVED viene de una referencia de cobro automatico.
//
// Existe porque el correo de pago aprobado que ya teniamos (cambioPlan) no sabe
// hablar de una renovacion: con plan_nuevo === plan_anterior cae en la rama de
// "cambio de periodo" y dice "Solo cambió la facturación de tu suscripción",
// que en una renovacion es simplemente falso. Un cobro automatico es la unica
// vez que le sacamos plata a alguien sin que este mirando: el recibo tiene que
// decir CUANTO, POR QUE y HASTA CUANDO, y como apagarlo.

const NOMBRE_PLAN: Record<string, string> = { gratis: 'Gratis', basico: 'Básico', pro: 'Pro' }

export function renovacionCobrada(p: {
  plan: string
  periodo: string
  monto: number
  /** Nuevo plan_expira ya calculado por el webhook. */
  planExpira: string
}): EmailRenderizado {
  const nombrePlan = NOMBRE_PLAN[p.plan] ?? p.plan
  const urlSuscripcion = `${PUBLIC_BASE_URL}/suscripcion`
  const fechaLarga = fechaLargaColombia(p.planExpira)
  const cadencia = p.periodo === 'anual' ? 'anual' : 'mensual'

  const titulo = `Renovamos tu plan ${nombrePlan}`
  const entrada = `Te cobramos $${formatoPrecio(p.monto)} por tu suscripción ${cadencia}. Todo sigue funcionando igual, no tienes que hacer nada.`
  const plazo = fechaLarga ? `Tu plan queda activo hasta el ${fechaLarga}.` : ''
  const cierre =
    'Puedes apagar la renovación automática o cambiar tu método de pago cuando quieras desde tu cuenta. ' +
    'Si la apagas, conservas el tiempo que ya pagaste.'

  const html = envolverHtml(`
          <h1 style="font-size:20px;color:#2A2523;margin:0 0 12px;">${escaparHtml(titulo)}</h1>
          <p style="font-size:14px;line-height:1.6;color:#2A2523;margin:0 0 16px;">${escaparHtml(entrada)}</p>
          ${plazo ? `<p style="font-size:14px;line-height:1.6;color:#2A2523;margin:0 0 16px;"><strong>${escaparHtml(plazo)}</strong></p>` : ''}
          <p style="font-size:14px;line-height:1.6;color:#2A2523;margin:0 0 24px;">${escaparHtml(cierre)}</p>
          <a href="${urlSuscripcion}" style="font-size:14px;color:#E85D24;font-weight:bold;text-decoration:none;">Ver mi suscripción &rarr;</a>
  `)

  const text = [titulo, '', entrada, ...(plazo ? ['', plazo] : []), '', cierre, '', `Ver mi suscripción: ${urlSuscripcion}`].join('\n')

  return { subject: titulo, html, text }
}
