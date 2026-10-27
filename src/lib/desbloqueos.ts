// Funciones que un upgrade desbloquea pero que NO aparecen solas en el menú
// (CIERRE 5a): arrancan apagadas o necesitan configurarse. Las muestra
// /suscripcion al confirmar un pago que sube de plan, cada una con el enlace a
// donde se enciende. Puro, sin React.
//
// Por qué cada una (STEP 0 de 5a):
//   - combos/promos/plato del día/plato ganador: config_restaurante.*_activo
//     arranca en false (fallback de /config y del menú público).
//   - Sorpréndeme: el toggle arranca encendido, pero solo aparece con EXACTAMENTE
//     2 categorías elegidas en /menu (lib/sorprendeme).
//   - fotos, portada y logo: se ven desde el plan pago, pero hay que subirlas.
//   - color principal, temas y colores propios: viven en Personalización, que
//     solo se abre desde Básico.
//   - calificaciones y WhatsApp: ya existen en Gratis, no se listan.

export interface FuncionPorActivar {
  nombre: string
  /** Texto del enlace. */
  accion: string
  href: string
}

const RANGO: Record<string, number> = { gratis: 0, basico: 1, pro: 2 }

const BASICO: FuncionPorActivar[] = [
  { nombre: 'Fotos de tus platos', accion: 'Súbelas en Mi menú', href: '/menu' },
  { nombre: 'Foto de portada y logo', accion: 'Súbelos en Personalización', href: '/config?seccion=personalizacion' },
  { nombre: 'Color principal del menú', accion: 'Elígelo en Personalización', href: '/config?seccion=personalizacion' },
  { nombre: 'Sorpréndeme', accion: 'Elige 2 categorías en Mi menú', href: '/menu?tab=sorprendeme' },
]

const PRO: FuncionPorActivar[] = [
  { nombre: 'Combos', accion: 'Actívalos en Funciones', href: '/config?seccion=funciones' },
  { nombre: 'Promociones', accion: 'Actívalas en Funciones', href: '/config?seccion=funciones' },
  { nombre: 'Plato del día', accion: 'Actívalo en Funciones', href: '/config?seccion=funciones' },
  { nombre: 'Plato ganador', accion: 'Actívalo en Funciones', href: '/config?seccion=funciones' },
  { nombre: 'Temas y colores propios', accion: 'Elígelos en Personalización', href: '/config?seccion=personalizacion' },
]

/** true si planNuevo es de rango mayor que planAnterior. */
export function esSubidaDePlan(planAnterior: string | null | undefined, planNuevo: string): boolean {
  return (RANGO[planNuevo] ?? 0) > (RANGO[planAnterior ?? 'gratis'] ?? 0)
}

/** Lo que el upgrade planAnterior -> planNuevo desbloquea y hay que encender.
 *  Vacío si no es una subida. */
export function funcionesPorActivar(planAnterior: string | null | undefined, planNuevo: string): FuncionPorActivar[] {
  if (!esSubidaDePlan(planAnterior, planNuevo)) return []
  const desde = RANGO[planAnterior ?? 'gratis'] ?? 0
  const hasta = RANGO[planNuevo] ?? 0
  const lista: FuncionPorActivar[] = []
  if (desde < 1 && hasta >= 1) lista.push(...BASICO)
  if (desde < 2 && hasta >= 2) lista.push(...PRO)
  return lista
}

// ── Aviso de desbloqueo al confirmar un pago (CIERRE 5a, smoke) ──────────
// El aviso SOLO aparece cuando el plan subio con certeza: el plan anterior
// tiene que venir de una fuente confiable (la fila leida antes del RPC, o el
// registro que /suscripcion guarda justo antes del checkout) y ser un plan
// conocido de rango menor. Aqui NO hay default a 'gratis': sin plan anterior
// confiable no hay lista. (funcionesPorActivar conserva su default historico,
// pero el camino del pago no llega a el sin pasar por desbloqueosConfirmados.)

const PLANES_CONOCIDOS = ['gratis', 'basico', 'pro']

/** Vigencia del registro "plan antes de pagar": mas viejo no se cree. */
export const VIGENCIA_PLAN_ANTES_MS = 2 * 60 * 60 * 1000

/** Lo que /suscripcion guarda en sessionStorage antes de ir al checkout. */
export function serializarPlanAntesDePagar(plan: string, ahora: number): string {
  return JSON.stringify({ plan, ts: ahora })
}

/** Lee ese registro. null si falta, no es JSON (un valor viejo en texto plano
 *  cuenta como no parseable), no trae un plan conocido o tiene mas de 2 horas. */
export function leerPlanAntesDePagar(raw: string | null | undefined, ahora: number): string | null {
  if (!raw) return null
  let valor: unknown
  try {
    valor = JSON.parse(raw)
  } catch {
    return null
  }
  if (!valor || typeof valor !== 'object') return null
  const { plan, ts } = valor as { plan?: unknown; ts?: unknown }
  if (typeof plan !== 'string' || !PLANES_CONOCIDOS.includes(plan)) return null
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null
  const edad = ahora - ts
  // Un ts del futuro (reloj movido) tampoco se cree, con un minuto de holgura.
  if (edad > VIGENCIA_PLAN_ANTES_MS || edad < -60_000) return null
  return plan
}

/** Lista de "Esto se desbloqueó" para un pago confirmado: [] salvo que
 *  planAnterior sea un plan conocido y rango(planNuevo) > rango(planAnterior). */
export function desbloqueosConfirmados(planAnterior: string | null | undefined, planNuevo: string): FuncionPorActivar[] {
  if (!planAnterior || !PLANES_CONOCIDOS.includes(planAnterior)) return []
  if (!PLANES_CONOCIDOS.includes(planNuevo)) return []
  if ((RANGO[planNuevo] ?? 0) <= (RANGO[planAnterior] ?? 0)) return []
  return funcionesPorActivar(planAnterior, planNuevo)
}
