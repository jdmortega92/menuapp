import { envolverHtml, escaparHtml } from './base'
import type { EmailRenderizado } from './bienvenida'
import type { FilaRevision } from '@/lib/pagos/conciliacion'

// Alerta INTERNA (CIERRE 5b): cobros automaticos que entraron a REVISION en una
// corrida del cron. Va a ALERTAS_EMAIL, nunca a un dueno. Los logs de Vercel
// Hobby duran ~1 hora, asi que este correo es el registro que sobrevive.
//
// Solo ids y motivo: restaurante_id, motivo (nuestro vocabulario), referencia
// (la emitimos nosotros) y tx id de Wompi. Ni correos, ni telefonos, ni montos
// del medio de pago, ni nada que salga de un cuerpo de Wompi.

// contexto (CIERRE 6a): 'pago' cuando la REVISION la dispara la guarda del
// camino compartido al llegar el APPROVED (webhook), no una corrida del cron.
export function alertaRevision(filas: FilaRevision[], contexto: 'cron' | 'pago' = 'cron'): EmailRenderizado {
  const n = filas.length
  const uno = n === 1
  const subject = uno ? '[MenuApp] Un cobro automático en revisión' : `[MenuApp] ${n} cobros automáticos en revisión`
  const linea = (f: FilaRevision) =>
    `restaurante=${f.restauranteId} motivo=${f.motivo} referencia=${f.referencia ?? '-'} tx=${f.txId ?? '-'}`

  const donde = contexto === 'pago' ? 'al llegar su pago aprobado' : 'en esta corrida del cron'
  const encabezado = uno
    ? `Un cobro automático quedó en revisión ${donde}.`
    : `${n} cobros automáticos quedaron en revisión ${donde}.`
  const indicacion = 'No se le avisó al dueño. Revisa cada uno en el panel de Wompi antes de tocar la fila.'
  // CIERRE 6a: el checkout se niega a cobrar a mano mientras la fila del
  // periodo vigente este en REVISION (D-HIGH-3).
  const bloqueo = 'Mientras una fila esté en revisión, ese restaurante no puede pagar a mano.'

  const text = [encabezado, indicacion, bloqueo, '', ...filas.map(linea)].join('\n')

  const items = filas.map((f) => `<li style="margin-bottom:8px;">${escaparHtml(linea(f))}</li>`).join('')
  const html = envolverHtml(
    `<p style="font-size:15px;color:#2A2523;">${escaparHtml(encabezado)}</p>` +
      `<p style="font-size:14px;color:#2A2523;">${escaparHtml(indicacion)}</p>` +
      `<p style="font-size:14px;color:#2A2523;">${escaparHtml(bloqueo)}</p>` +
      `<ul style="font-family:monospace;font-size:12px;color:#2A2523;padding-left:18px;">${items}</ul>`
  )
  return { subject, html, text }
}
