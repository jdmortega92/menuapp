import type { Plan } from '@/types'

// ── Regla de fotos de platos por plan (STRATEGIC.2) ──
// Discriminador: restaurantes.fue_pago (latch one-way: cualquier paso por un plan
// pago lo deja en true para siempre; el downgrade a gratis NO lo resetea).
//  - Básico/Pro: fotos ilimitadas y siempre visibles en el menú público.
//  - Gratis NUNCA-pago: hasta LIMITE_FOTOS_GRATIS fotos VIVAS (borrar libera cupo,
//    no es presupuesto de por vida) y sus fotos SÍ se muestran en el público.
//  - Gratis fue_pago (downgrade): cero subidas nuevas y sus fotos existentes quedan
//    ocultas en el público (el comportamiento pre-STRATEGIC.2 para gratis).
// logo_url/banner_url NO cuentan ni pasan por aquí (siguen con esBasicoPublico).
// La regla vive en dos superficies (admin /menu + público [slug]); este helper
// único evita que diverjan. `fuePago` llega como !!rest?.fue_pago: una fila sin
// backfill (null/undefined) cuenta como nunca-pago.

export const LIMITE_FOTOS_GRATIS = 5

export function puedeSubirFoto(plan: Plan, fuePago: boolean, fotosUsadas: number): boolean {
  if (plan === 'basico' || plan === 'pro') return true
  return !fuePago && fotosUsadas < LIMITE_FOTOS_GRATIS
}

export function mostrarFotosPublico(plan: Plan, fuePago: boolean): boolean {
  if (plan === 'basico' || plan === 'pro') return true
  return !fuePago
}
