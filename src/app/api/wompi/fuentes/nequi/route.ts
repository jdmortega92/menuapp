import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  construirConsentimiento,
  enmascararTelefono,
  telefonoNequiValido,
} from '@/lib/wompi'
import { credencialesListas, crearTokenNequi, obtenerParAceptacion } from '@/lib/wompiApi'

// F4.c-4 — ENROLAMIENTO NEQUI. Guarda un metodo de pago. NO cobra, NO cambia
// el plan, NO toca plan_expira ni fue_pago: guardar un metodo no es un pago.
// Un enrolamiento abandonado deja una fila PENDING y nada mas.
//
// IDENTIDAD desde la SESION, nunca del body (misma regla que /api/emails y
// /api/wompi/checkout). El body solo trae telefono y los dos consentimientos.
//
// La llave privada no sale de lib/wompiApi (server). El navegador no puede
// crear una fuente de pago en Wompi ni aunque quisiera (F4.c-2/Q1).

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body invalido' }, { status: 400 })
  }

  const { telefono, aceptaReglamento, aceptaDatos } = (body ?? {}) as Record<string, unknown>

  // Los dos consentimientos se REVALIDAN aqui. Los checkboxes de la UI son
  // usabilidad; esta es la defensa. Sin ambos no se toca a Wompi.
  if (aceptaReglamento !== true || aceptaDatos !== true) {
    return NextResponse.json({ error: 'Faltan los consentimientos' }, { status: 400 })
  }
  if (typeof telefono !== 'string' || !telefonoNequiValido(telefono)) {
    return NextResponse.json({ error: 'Numero de Nequi invalido' }, { status: 400 })
  }
  const telefonoLimpio = telefono.replace(/\D/g, '')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data: rest, error: restError } = await supabase
    .from('restaurantes')
    .select('id')
    .eq('usuario_id', user.id)
    .maybeSingle()
  if (restError || !rest) {
    console.error('[wompi/fuentes/nequi] lectura de restaurante fallo:', restError?.message)
    return NextResponse.json({ error: 'Restaurante no disponible' }, { status: 500 })
  }

  if (!credencialesListas('wompi/fuentes/nequi')) {
    return NextResponse.json({ error: 'Pasarela no configurada' }, { status: 500 })
  }

  const admin = createAdminClient()

  // Una fuente viva a la vez. El indice unico parcial ya impide DOS
  // predeterminadas, pero esto evita ademas dejar filas PENDING huerfanas
  // acumuladas por dobles clics o reintentos impacientes.
  const { data: yaExiste } = await admin
    .from('fuentes_pago')
    .select('id, estado')
    .eq('restaurante_id', rest.id)
    .in('estado', ['PENDING', 'AVAILABLE'])
    .maybeSingle()
  if (yaExiste) {
    return NextResponse.json(
      { error: 'Ya tienes un metodo de pago en proceso o guardado', estado: yaExiste.estado },
      { status: 409 }
    )
  }

  // Par de aceptacion FRESCO. Este par NO es el que consumira la fuente de pago
  // (eso pasa en el webhook, con otro par): este es la EVIDENCIA de lo que el
  // usuario acepto en el momento de marcar las casillas. Se guardan permalink,
  // file_hash y contract_id; el JWT jamas.
  const par = await obtenerParAceptacion('wompi/fuentes/nequi')
  if (!par.ok) {
    return NextResponse.json({ error: 'No se pudo leer el consentimiento' }, { status: 502 })
  }

  // Se llama a Wompi ANTES de escribir. Si la escritura fallara despues, el
  // token queda huerfano en Wompi y caduca solo: inofensivo (no cobra nada).
  // Al reves tendriamos una fila apuntando a un token que no existe.
  const token = await crearTokenNequi(telefonoLimpio, 'wompi/fuentes/nequi')
  if (!token.ok || !token.datos?.id) {
    const status = token.ok ? 502 : token.status === 0 ? 503 : 502
    return NextResponse.json({ error: 'No se pudo iniciar el enrolamiento' }, { status })
  }

  // Fila PENDING: el telefono se guarda YA ENMASCARADO. El numero completo no
  // entra a nuestra base en ningun momento.
  const { data: fuente, error: errFuente } = await admin
    .from('fuentes_pago')
    .insert({
      restaurante_id: rest.id,
      wompi_token_id: token.datos.id,
      tipo: 'NEQUI',
      estado: 'PENDING',
      telefono_enmascarado: enmascararTelefono(telefonoLimpio),
      predeterminada: false,
    })
    .select('id')
    .single()
  if (errFuente || !fuente) {
    console.error('[wompi/fuentes/nequi] insert de fuente fallo:', errFuente?.message)
    return NextResponse.json({ error: 'No se pudo guardar el metodo' }, { status: 500 })
  }

  // Bitacora de consentimiento. Si esto falla NO se revierte la fuente: la fila
  // PENDING no cobra nada, y el webhook exige consentimiento vigente para crear
  // la fuente real. Se loguea como incidente porque es evidencia perdida.
  const consentimiento = construirConsentimiento({
    restauranteId: rest.id,
    fuentePagoId: fuente.id,
    evento: 'OTORGADO',
    politica: par.datos.politica,
    datos: par.datos.datos,
    ip: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  })
  const { error: errConsent } = await admin.from('consentimientos_pago').insert(consentimiento)
  if (errConsent) {
    console.error('[wompi/fuentes/nequi] insert de consentimiento fallo:', errConsent.message)
  }

  console.info(`[wompi/fuentes/nequi] enrolamiento iniciado restaurante=${rest.id} estado=PENDING`)
  return NextResponse.json({ ok: true, estado: 'PENDING' }, { status: 200 })
}
