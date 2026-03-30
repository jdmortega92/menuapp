import { Plan } from '@/types'

export const PRECIOS: Record<Plan, { mensual: number; anual: number }> = {
  gratis: { mensual: 0, anual: 0 },
  basico: { mensual: 15000, anual: 144000 },
  pro: { mensual: 29000, anual: 278400 },
}

export const NOMBRE_PLAN: Record<Plan, string> = {
  gratis: 'Gratis',
  basico: 'Básico',
  pro: 'Pro',
}

export async function crearPago({
  plan,
  periodo,
  email,
  restauranteId,
}: {
  plan: Plan
  periodo: 'mensual' | 'anual'
  email: string
  restauranteId: string
}) {
  const monto = PRECIOS[plan][periodo]
  if (monto === 0) return { success: true, plan: 'gratis' }

  const response = await fetch('/api/pagos/wompi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount_in_cents: monto * 100,
      currency: 'COP',
      customer_email: email,
      reference: `sub_${restauranteId}_${plan}_${periodo}_${Date.now()}`,
    }),
  })

  return response.json()
}

export function calcularAhorro(plan: Plan): number {
  return PRECIOS[plan].mensual * 12 - PRECIOS[plan].anual
}

export function calcularPorcentajeAhorro(plan: Plan): number {
  const mensualAnual = PRECIOS[plan].mensual * 12
  if (mensualAnual === 0) return 0
  return Math.round(((mensualAnual - PRECIOS[plan].anual) / mensualAnual) * 100)
}