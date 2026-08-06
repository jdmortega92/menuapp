import { PUBLIC_BASE_URL } from '@/lib/urls'
import { fechaLargaColombia } from '@/lib/fechas'
import { formatoPrecio } from '@/lib/precio'
import { envolverHtml, escaparHtml } from './base'
import type { EmailRenderizado } from './bienvenida'

// Correo de COBRO AUTOMATICO FALLIDO (F4.c-5). Lo dispara el cron cuando el
// intento de cobro contra la fuente guardada no se pudo ni iniciar.
//
// Es el unico aviso que el usuario va a recibir: la politica v1 (F4-DECISIONES)
// es SIN escalera de reintentos, asi que despues de esto no pasa nada mas
// automatico. Por eso el correo tiene que ser accionable, no informativo: dice
// hasta cuando sigue vivo el plan y lleva DIRECTO al pago manual.
//
// Tono: no alarmar y no culpar. El cobro puede fallar por mil razones que no son
// del usuario. No se nombra la causa tecnica ni se pinta como un problema suyo.
// NUNCA se incluye el numero enmascarado ni ningun dato del medio de pago: el
// correo puede reenviarse.

const NOMBRE_PLAN: Record<string, string> = { gratis: 'Gratis', basico: 'Básico', pro: 'Pro' }

export function cobroFallido(p: {
  plan: string
  monto: number
  /** plan_expira: hasta cuando sigue vivo el plan si no paga. */
  planExpira: string
}): EmailRenderizado {
  const nombrePlan = NOMBRE_PLAN[p.plan] ?? p.plan
  const urlSuscripcion = `${PUBLIC_BASE_URL}/suscripcion`
  const fechaLarga = fechaLargaColombia(p.planExpira)

  const titulo = `No pudimos renovar tu plan ${nombrePlan}`
  const entrada =
    `Intentamos cobrar $${formatoPrecio(p.monto)} para renovar tu plan y el cobro no se completó. ` +
    'No te preocupes: no se te cobró nada y tu menú sigue en línea.'
  // La fecha es el dato que hace accionable el correo. Sin ella el copy no puede
  // prometer un plazo, asi que se cae a una frase sin fecha en vez de inventarla.
  const plazo = fechaLarga
    ? `Tu plan ${nombrePlan} sigue activo hasta el ${fechaLarga}. Si lo pagas antes de esa fecha, no pierdes nada.`
    : `Tu plan ${nombrePlan} sigue activo hasta la fecha de vencimiento. Si lo pagas antes, no pierdes nada.`
  const cierre =
    'No vamos a volver a intentar el cobro automáticamente. Puedes pagar desde tu cuenta en un minuto, ' +
    'y revisar o cambiar tu método de pago desde la misma pantalla.'

  const html = envolverHtml(`
          <h1 style="font-size:20px;color:#2A2523;margin:0 0 12px;">${escaparHtml(titulo)}</h1>
          <p style="font-size:14px;line-height:1.6;color:#2A2523;margin:0 0 16px;">${escaparHtml(entrada)}</p>
          <p style="font-size:14px;line-height:1.6;color:#2A2523;margin:0 0 16px;"><strong>${escaparHtml(plazo)}</strong></p>
          <p style="font-size:14px;line-height:1.6;color:#2A2523;margin:0 0 24px;">${escaparHtml(cierre)}</p>
          <a href="${urlSuscripcion}" style="display:inline-block;background-color:#E85D24;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:8px;">Pagar mi plan</a>
  `)

  const text = [titulo, '', entrada, '', plazo, '', cierre, '', `Pagar mi plan: ${urlSuscripcion}`].join('\n')

  return { subject: titulo, html, text }
}
