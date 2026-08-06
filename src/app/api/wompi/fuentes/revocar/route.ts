import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { construirConsentimiento } from '@/lib/wompi'

// F4.c-4 — QUITAR EL METODO DE PAGO. Es una operacion 100% NUESTRA: el spike
// (F4.c-2) probo que NO existe endpoint para anular una fuente de pago normal
// (PUT .../void devuelve 422: solo aplica a PREAUTHORIZATION) y que tampoco hay
// forma de borrarla. Wompi CONSERVA la fuente pase lo que pase.
//
// Por eso quitar el metodo escribe DOS cosas: estado='VOIDED' (dejamos de
// cobrar) y una fila REVOCADO en consentimientos_pago. Esa fila es la unica
// evidencia que podemos exhibir de que dejamos de cobrar, porque no podemos
// demostrar que Wompi olvido la fuente.
//
// Va por el server con service role porque fuentes_pago NO tiene policy de
// UPDATE para authenticated: el dueno lee sus filas, no las escribe.

export async function POST(request: Request) {
  // El motivo es opcional y no viene de un select del usuario: se normaliza a
  // una convencion corta. Cualquier cosa rara cae a 'usuario_solicito'.
  let motivo = 'usuario_solicito'
  try {
    const body = (await request.json()) as Record<string, unknown>
    if (typeof body?.motivo === 'string' && body.motivo.length <= 40) motivo = body.motivo
  } catch {
    // Body vacio es valido: quitar el metodo no exige explicacion.
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data: rest, error: restError } = await supabase
    .from('restaurantes')
    .select('id')
    .eq('usuario_id', user.id)
    .maybeSingle()
  if (restError || !rest) {
    console.error('[wompi/fuentes/revocar] lectura de restaurante fallo:', restError?.message)
    return NextResponse.json({ error: 'Restaurante no disponible' }, { status: 500 })
  }

  const admin = createAdminClient()

  // Se revoca la fuente VIVA del restaurante. El id NUNCA viene del body: se
  // resuelve desde la sesion, asi nadie puede revocar la fuente de otro.
  const { data: fuente } = await admin
    .from('fuentes_pago')
    .select('id, estado')
    .eq('restaurante_id', rest.id)
    .in('estado', ['PENDING', 'AVAILABLE', 'ERROR'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Idempotente: sin fuente viva, quitar el metodo ya esta hecho.
  if (!fuente) {
    return NextResponse.json({ ok: true, yaRevocada: true }, { status: 200 })
  }

  // predeterminada=false ADEMAS de VOIDED: si quedara en true, el indice unico
  // parcial (uq_fuentes_pago_predeterminada) rechazaria el proximo enrolamiento
  // del mismo restaurante. La fila revocada no puede bloquear a su reemplazo.
  const { error: errUpd } = await admin
    .from('fuentes_pago')
    .update({
      estado: 'VOIDED',
      revocada_en: new Date().toISOString(),
      motivo_revocacion: motivo,
      predeterminada: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', fuente.id)
  if (errUpd) {
    console.error('[wompi/fuentes/revocar] update de fuente fallo:', errUpd.message)
    return NextResponse.json({ error: 'No se pudo quitar el metodo' }, { status: 500 })
  }

  // F4.c-5: quitar el metodo APAGA tambien el opt-in. Si cobro_automatico
  // quedara en true, un re-enrolamiento posterior reactivaria el cobro
  // recurrente EN SILENCIO, sin que el usuario volviera a autorizarlo — y hasta
  // entonces la fila estaria en un estado que se lee como "suscrito" sin fuente
  // contra la cual cobrar. El opt-in muere con el metodo que lo sostenia.
  const { error: errCobro } = await admin
    .from('restaurantes')
    .update({ cobro_automatico: false, cobro_automatico_desde: null })
    .eq('id', rest.id)
  if (errCobro) {
    // No revierte: la fuente ya esta VOIDED, asi que el cron no cobra igual
    // (debeCobrarse exige una fuente AVAILABLE). Se loguea como incidente
    // porque deja la fila describiendo algo que no es cierto.
    console.error('[wompi/fuentes/revocar] apagado de cobro_automatico fallo:', errCobro.message)
  }

  // La evidencia se escribe DESPUES de dejar de cobrar, no antes: si el update
  // fallara, no queremos un registro que afirme algo que no ocurrio.
  const { error: errConsent } = await admin.from('consentimientos_pago').insert(
    construirConsentimiento({
      restauranteId: rest.id,
      fuentePagoId: fuente.id,
      evento: 'REVOCADO',
      motivo,
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    })
  )
  if (errConsent) {
    console.error('[wompi/fuentes/revocar] insert de consentimiento fallo:', errConsent.message)
  }

  console.info(`[wompi/fuentes/revocar] fuente revocada restaurante=${rest.id} motivo=${motivo}`)
  return NextResponse.json({ ok: true }, { status: 200 })
}
