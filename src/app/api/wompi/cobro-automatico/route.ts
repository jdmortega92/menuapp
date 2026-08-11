import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { construirConsentimiento } from '@/lib/wompi'

// F4.c-5 — EL OPT-IN. Enciende y apaga restaurantes.cobro_automatico, que es la
// unica condicion del cron que representa una DECISION del usuario (las demas
// son estado: plan, fecha, fuente).
//
// POR QUE ES UNA RUTA Y NO UN UPDATE DESDE EL CLIENTE: aunque el usuario puede
// escribir su propia fila de restaurantes, esta columna decide si le sacamos
// plata sin que este mirando. Pasa por el server para que quede (a) una linea
// de log de cada encendido y apagado y (b) una fila en la bitacora de
// consentimiento. Un update suelto desde el navegador no deja ninguna de las dos.
//
// GUARDA DURA — no se puede encender sin fuente de pago AVAILABLE. Si se
// pudiera, el cron tendria un opt-in verdadero sin nada contra que cobrar y la
// UI diria "Se renueva el X" mintiendo. Apagar, en cambio, NUNCA se bloquea:
// salir tiene que ser mas facil que entrar.
//
// Encender NO cobra nada hoy: el primer cobro ocurre N dias antes de
// plan_expira (lib/suscripciones, DIAS_ANTES_DE_COBRAR).

// Motivos admitidos al APAGAR. Es una LISTA CERRADA y no texto libre: este
// valor termina en consentimientos_pago, que es append-only y es la evidencia
// exhibible de por que dejamos de cobrarle a alguien. Dejar que el navegador
// escriba ahi lo que quiera convertiria la bitacora en un campo de notas.
const MOTIVOS_APAGADO = new Set(['cobro_automatico_desactivado', 'suscripcion_cancelada'])

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body invalido' }, { status: 400 })
  }

  const { activar, motivo } = (body ?? {}) as Record<string, unknown>
  // Booleano ESTRICTO: un 'true' de string o un undefined no encienden nada.
  if (typeof activar !== 'boolean') {
    return NextResponse.json({ error: 'Falta activar' }, { status: 400 })
  }
  // El motivo solo aplica al apagado (encender siempre es el mismo acto) y se
  // valida contra la lista cerrada. Ausente = el apagado manual de siempre.
  const motivoApagado = motivo === undefined || motivo === null
    ? 'cobro_automatico_desactivado'
    : typeof motivo === 'string' && MOTIVOS_APAGADO.has(motivo)
      ? motivo
      : null
  if (motivoApagado === null) {
    return NextResponse.json({ error: 'Motivo invalido' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Identidad SIEMPRE desde la sesion, nunca del body (misma regla que el resto
  // de /api/wompi/*): nadie puede encenderle el cobro automatico a otro.
  const { data: rest, error: restError } = await supabase
    .from('restaurantes')
    .select('id, plan')
    .eq('usuario_id', user.id)
    .maybeSingle()
  if (restError || !rest) {
    console.error('[wompi/cobro-automatico] lectura de restaurante fallo:', restError?.message)
    return NextResponse.json({ error: 'Restaurante no disponible' }, { status: 500 })
  }

  const admin = createAdminClient()

  // La fuente viva se lee SIEMPRE (no solo al encender): tambien es la que se
  // enlaza en la bitacora al apagar.
  const { data: fuente } = await admin
    .from('fuentes_pago')
    .select('id, estado')
    .eq('restaurante_id', rest.id)
    .eq('estado', 'AVAILABLE')
    .eq('predeterminada', true)
    .maybeSingle()

  if (activar) {
    if (!fuente) {
      return NextResponse.json({ error: 'No hay un metodo de pago guardado' }, { status: 409 })
    }
    if (!rest.plan || rest.plan === 'gratis') {
      // El plan gratis no se factura: no hay nada que renovar.
      return NextResponse.json({ error: 'El plan gratis no se renueva' }, { status: 409 })
    }
  }

  // cobro_automatico_desde se ESCRIBE al encender y se LIMPIA al apagar: es
  // "desde cuando esta activo", no un historico. El historico son las filas de
  // consentimientos_pago, que son append-only y nadie puede reescribir.
  const { error: errUpd } = await admin
    .from('restaurantes')
    .update({
      cobro_automatico: activar,
      cobro_automatico_desde: activar ? new Date().toISOString() : null,
    })
    .eq('id', rest.id)
  if (errUpd) {
    console.error('[wompi/cobro-automatico] update fallo:', errUpd.message)
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 })
  }

  // Bitacora. Encender es OTORGADO y apagar es REVOCADO, con motivo propio para
  // no confundirlos con quitar el metodo: el evento describe la AUTORIZACION A
  // COBRAR, y apagar la renovacion es exactamente "dejamos de cobrar" aunque el
  // metodo siga guardado. Si el insert falla NO se revierte el cambio: dejar al
  // usuario con el cobro encendido porque no pudimos escribir un log seria peor
  // que perder evidencia (y al apagar seria directamente inaceptable).
  const { error: errConsent } = await admin.from('consentimientos_pago').insert(
    construirConsentimiento({
      restauranteId: rest.id,
      fuentePagoId: fuente?.id ?? null,
      evento: activar ? 'OTORGADO' : 'REVOCADO',
      motivo: activar ? 'cobro_automatico_activado' : motivoApagado,
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    })
  )
  if (errConsent) {
    console.error('[wompi/cobro-automatico] insert de consentimiento fallo:', errConsent.message)
  }

  console.info(`[wompi/cobro-automatico] restaurante=${rest.id} activo=${activar}`)
  return NextResponse.json({ ok: true, cobroAutomatico: activar }, { status: 200 })
}
