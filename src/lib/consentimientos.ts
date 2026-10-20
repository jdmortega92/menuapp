import { createAdminClient } from '@/lib/supabase-admin'
import { construirConsentimiento } from '@/lib/wompi'

// Escribe una fila en consentimientos_pago (bitacora append-only). SOLO
// servidor: recibe el cliente de service role. Compartido por
// /api/wompi/cobro-automatico y /api/suscripcion/cancelar para que una
// revocacion deje EXACTAMENTE la misma fila venga de donde venga.
//
// Si el insert falla NO lanza: se loguea y el llamador sigue. Dejar al usuario
// con el cobro encendido porque no pudimos escribir un log seria peor que
// perder evidencia (y al apagar seria directamente inaceptable).
export async function registrarConsentimiento(
  admin: ReturnType<typeof createAdminClient>,
  params: Parameters<typeof construirConsentimiento>[0],
  etiqueta: string
): Promise<void> {
  const { error } = await admin.from('consentimientos_pago').insert(construirConsentimiento(params))
  if (error) {
    console.error(`[${etiqueta}] insert de consentimiento fallo:`, error.message)
  }
}
