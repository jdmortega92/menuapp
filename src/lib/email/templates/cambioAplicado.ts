import { PUBLIC_BASE_URL } from '@/lib/urls'
import { envolverHtml, escaparHtml } from './base'
import type { EmailRenderizado } from './bienvenida'

// Correo de cambio agendado YA APLICADO (F4.b-2). Lo dispara el cron el día en
// que se cumple fecha_cambio_programado. Distinto de cambioPlan.ts: aquí el
// usuario pidió este cambio hace semanas, así que el copy lo RECUERDA en vez de
// anunciarlo como novedad ("como lo programaste"), y no vuelve a explicar la
// bajada como si fuera una decisión de hoy.

const NOMBRE_PLAN: Record<string, string> = { gratis: 'Gratis', basico: 'Básico', pro: 'Pro' }

export function cambioAplicado(p: { planAnterior: string; planNuevo: string }): EmailRenderizado {
  const nombreAnterior = NOMBRE_PLAN[p.planAnterior] ?? p.planAnterior
  const nombreNuevo = NOMBRE_PLAN[p.planNuevo] ?? p.planNuevo
  const urlSuscripcion = `${PUBLIC_BASE_URL}/suscripcion`

  const titulo = `Tu plan cambió a ${nombreNuevo}`
  const entrada = `Como lo programaste, hoy terminó tu ciclo del plan ${nombreAnterior} y tu cuenta pasó a ${nombreNuevo}. Usaste tu plan hasta el último día pagado.`
  const nota =
    p.planNuevo === 'gratis'
      ? 'Las fotos de tus platos y las funciones premium quedan ocultas, pero no se borran: si vuelves a un plan pago, todo reaparece tal como lo dejaste.'
      : 'Las funciones exclusivas de tu plan anterior quedan ocultas, pero no se borran: si vuelves a subir de plan, todo reaparece tal como lo dejaste.'

  const html = envolverHtml(`
          <h1 style="font-size:20px;color:#2A2523;margin:0 0 12px;">${escaparHtml(titulo)}</h1>
          <p style="font-size:14px;line-height:1.6;color:#2A2523;margin:0 0 16px;">${escaparHtml(entrada)}</p>
          <p style="font-size:14px;line-height:1.6;color:#2A2523;margin:0 0 24px;">${escaparHtml(nota)}</p>
          <a href="${urlSuscripcion}" style="font-size:14px;color:#E85D24;font-weight:bold;text-decoration:none;">Volver cuando quieras &rarr;</a>
  `)

  const text = [titulo, '', entrada, '', nota, '', `Volver cuando quieras: ${urlSuscripcion}`].join('\n')

  return { subject: titulo, html, text }
}
