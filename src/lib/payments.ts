import { Plan } from '@/types'
import { precioDe, centavosDe, type Periodo } from './planes'

// Integración de pagos (Wompi). Precios: SIEMPRE desde lib/planes — este
// módulo no define montos. crearPago es el esqueleto del checkout que
// F4.a-2 cablea contra la API real (/api/pagos/wompi aún no existe).

export async function crearPago({
  plan,
  periodo,
  email,
  restauranteId,
}: {
  plan: Plan
  periodo: Periodo
  email: string
  restauranteId: string
}) {
  if (precioDe(plan, periodo) === 0) return { success: true, plan: 'gratis' }

  const response = await fetch('/api/pagos/wompi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount_in_cents: centavosDe(plan, periodo),
      currency: 'COP',
      customer_email: email,
      reference: `sub_${restauranteId}_${plan}_${periodo}_${Date.now()}`,
    }),
  })

  return response.json()
}
