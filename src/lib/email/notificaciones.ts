import { enviarEmail } from './sender'
import { cambioPlan } from './templates/cambioPlan'
import { planVencido } from './templates/planVencido'
import { cambioAplicado } from './templates/cambioAplicado'
import type { Plan } from '@/types'
import type { Periodo } from '@/lib/planes'

// Envio de correos SIN dependencia de cookies/sesion: enviarEmail solo necesita
// RESEND_API_KEY. Lo usa el webhook de Wompi (F4.a-2), que no tiene sesion y por
// eso NO puede llamar a /api/emails. Reutiliza la plantilla cambioPlan (rama de
// subida) para avisar que el plan quedo activo tras el pago confirmado.
export async function notificarPlanActivo(p: {
  to: string
  plan: Plan
  periodo: Periodo
  planAnterior?: string
}) {
  const contenido = cambioPlan({
    plan_nuevo: p.plan,
    plan_anterior: p.planAnterior ?? 'gratis',
    periodo_nuevo: p.periodo,
  })
  return enviarEmail({ to: p.to, ...contenido })
}

// F4.b-2: los dos avisos del cron de suscripciones. Mismo contrato que arriba
// (sin cookies, solo RESEND_API_KEY): el cron tampoco tiene sesion.
export async function notificarPlanVencido(p: { to: string; planAnterior: string }) {
  return enviarEmail({ to: p.to, ...planVencido(p.planAnterior) })
}

export async function notificarCambioAplicado(p: {
  to: string
  planAnterior: string
  planNuevo: string
}) {
  return enviarEmail({
    to: p.to,
    ...cambioAplicado({ planAnterior: p.planAnterior, planNuevo: p.planNuevo }),
  })
}
