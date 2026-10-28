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

export function alertaRevision(filas: FilaRevision[]): EmailRenderizado {
  const n = filas.length
  const uno = n === 1
  const subject = uno ? '[MenuApp] Un cobro automático en revisión' : `[MenuApp] ${n} cobros automáticos en revisión`
  const linea = (f: FilaRevision) =>
    `restaurante=${f.restauranteId} motivo=${f.motivo} referencia=${f.referencia ?? '-'} tx=${f.txId ?? '-'}`

  const encabezado = uno
    ? 'Un cobro automático quedó en revisión en esta corrida del cron.'
    : `${n} cobros automáticos quedaron en revisión en esta corrida del cron.`
  const indicacion = 'No se le avisó al dueño. Revisa cada uno en el panel de Wompi antes de tocar la fila.'

  const text = [encabezado, indicacion, '', ...filas.map(linea)].join('\n')

  const items = filas.map((f) => `<li style="margin-bottom:8px;">${escaparHtml(linea(f))}</li>`).join('')
  const html = envolverHtml(
    `<p style="font-size:15px;color:#2A2523;">${escaparHtml(encabezado)}</p>` +
      `<p style="font-size:14px;color:#2A2523;">${escaparHtml(indicacion)}</p>` +
      `<ul style="font-family:monospace;font-size:12px;color:#2A2523;padding-left:18px;">${items}</ul>`
  )
  return { subject, html, text }
}
