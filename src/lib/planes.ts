import type { Plan } from '@/types'

// ── Fuente ÚNICA de precios y features de los planes (F4.a-1) ──
// Decisión 2026-07-03 (Julian, STRATEGIC.1): Básico $15.000/mes, Pro $29.000/mes;
// el anual es 10x el mensual ("2 meses gratis", ~17% de descuento).
// Cambiar precios SOLO aquí: /suscripcion, los upsells, el metadata y el
// checkout de Wompi (F4.a-2) leen todos de este módulo.

export type Periodo = 'mensual' | 'anual'

export interface PlanInfo {
  id: Plan
  nombre: string
  precioMensual: number
  precioAnual: number
  features: string[]
  noFeatures: string[]
}

export const PLANES: Record<Plan, PlanInfo> = {
  gratis: {
    id: 'gratis',
    nombre: 'Gratis',
    precioMensual: 0,
    precioAnual: 0,
    features: ['10 platos máximo', '1 categoría', 'QR básico', 'Escaneos y visitas'],
    noFeatures: ['Sin fotos', 'Sin estadísticas detalladas'],
  },
  basico: {
    id: 'basico',
    nombre: 'Básico',
    precioMensual: 15000,
    precioAnual: 150000,
    features: ['Platos ilimitados', 'Categorías ilimitadas', 'Fotos opcionales', 'QR personalizado', 'Gráfica + platos más vistos', 'Horarios pico', 'Agotado en tiempo real', 'Personalización del menú'],
    noFeatures: ['Sin combos ni promos', 'Sin estadísticas avanzadas'],
  },
  pro: {
    id: 'pro',
    nombre: 'Pro',
    precioMensual: 29000,
    precioAnual: 290000,
    features: ['Todo del Básico', 'Combos y promociones', 'Plato del día', 'Plato ganador', 'Calificaciones', 'Embudo de conversión', 'Vistas vs pedidos', 'Mejores y peores días', 'Reporte semanal PDF'],
    noFeatures: [],
  },
}

// Orden de renderizado de las cards en /suscripcion.
export const LISTA_PLANES: PlanInfo[] = [PLANES.gratis, PLANES.basico, PLANES.pro]

export function precioDe(plan: Plan, periodo: Periodo): number {
  return periodo === 'anual' ? PLANES[plan].precioAnual : PLANES[plan].precioMensual
}

// Pesos ahorrados al año con el plan anual vs pagar 12 meses sueltos.
export function ahorroAnual(plan: Plan): number {
  return PLANES[plan].precioMensual * 12 - PLANES[plan].precioAnual
}

// Unidad de la API de Wompi: amount_in_cents (COP * 100). F4.a-2 la consume.
export function centavosDe(plan: Plan, periodo: Periodo): number {
  return precioDe(plan, periodo) * 100
}
