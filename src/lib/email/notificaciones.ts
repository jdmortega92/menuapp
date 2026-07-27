import { enviarEmail } from './sender'
import { cambioPlan } from './templates/cambioPlan'
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
