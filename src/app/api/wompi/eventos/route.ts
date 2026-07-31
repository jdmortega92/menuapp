import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  calcularChecksumEvento,
  calcularPlanExpira,
  enmascararTelefono,
  esRenovacion,
  parsearReferencia,
  type WompiEvento,
  type WompiNequiToken,
} from '@/lib/wompi'
import { credencialesListas, crearFuenteNequi, obtenerParAceptacion } from '@/lib/wompiApi'
import { centavosDe } from '@/lib/planes'
import { fechaColombia } from '@/lib/fechas'
import { notificarPlanActivo } from '@/lib/email/notificaciones'

// PIECE 3 (F4.a-2): webhook de eventos de Wompi. SIN sesion ni cookies (lo
// llama Wompi server-to-server). Se verifica la firma con WOMPI_EVENTS_SECRET
// y comparacion TIMING-SAFE; cualquier cosa no verificada -> 401 sin loguear
// nada sensible. Con APPROVED se escribe plan/periodo/fue_pago/plan_expira
// (PRIMER escritor, COT via lib/fechas) y se inserta la factura, todo con
// service role e IDEMPOTENTE por la referencia. api/emails sigue intacto.

export async function POST(request: Request) {
  let event: WompiEvento
  try {
    event = (await request.json()) as WompiEvento
  } catch {
    return NextResponse.json({ error: 'Body invalido' }, { status: 400 })
  }

  const secret = process.env.WOMPI_EVENTS_SECRET
  if (!secret) {
    console.error('[wompi/eventos] falta WOMPI_EVENTS_SECRET')
    return NextResponse.json({ error: 'No configurado' }, { status: 500 })
  }

  // Estructura minima para poder verificar la firma.
  const props = event.signature?.properties
  const data = event.data
  const timestamp = event.timestamp
  if (!Array.isArray(props) || !data || timestamp === undefined) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Checksum: header X-Event-Checksum (preferido) o signature.checksum del body.
  const recibido = (request.headers.get('x-event-checksum') ?? event.signature?.checksum ?? '')
    .toString()
    .toUpperCase()
  const esperado = calcularChecksumEvento(event, secret) // hex MAYUSCULAS

  const a = Buffer.from(esperado, 'utf8')
  const b = Buffer.from(recibido, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // ── Firma OK a partir de aqui: el payload es autentico de Wompi ──

  // F4.c-4: nequi_token.updated llega con raiz data.nequi_token, NO
  // data.transaction (verificado en el spike). La verificacion de firma de
  // arriba ya lo maneja sin cambios porque signature.properties se resuelve
  // DINAMICAMENTE contra data — por eso este evento pasaba la firma y moria
  // en el guard de abajo. Se desvia ANTES de ese guard.
  if (data.nequi_token) {
    return manejarTokenNequi(data.nequi_token)
  }

  const transaction = data.transaction
  const reference = transaction?.reference
  const status = transaction?.status
  if (!transaction || typeof reference !== 'string') {
    return NextResponse.json({ recibido: true }, { status: 200 })
  }

  // La referencia la emitimos nosotros (embebe restaurante/plan/periodo).
  const parsed = parsearReferencia(reference)
  if (!parsed) {
    return NextResponse.json({ recibido: true }, { status: 200 })
  }
  const { restauranteId, plan, periodo } = parsed

  const admin = createAdminClient()

  // Idempotencia: la factura con numero == reference es la huella del evento.
  const { data: existente } = await admin
    .from('facturas')
    .select('id, estado')
    .eq('numero', reference)
    .maybeSingle()

  if (status === 'APPROVED') {
    // Defensa en profundidad: el monto debe coincidir con el precio real.
    const esperadoCents = centavosDe(plan, periodo)
    if (transaction.amount_in_cents !== esperadoCents) {
      console.warn('[wompi/eventos] monto no coincide, no se otorga plan')
      return NextResponse.json({ recibido: true }, { status: 200 })
    }
    // Ya procesado: no re-escribir ni duplicar factura.
    if (existente?.estado === 'aprobada') {
      return NextResponse.json({ recibido: true, idempotente: true }, { status: 200 })
    }

    // Estado ANTERIOR de la fila: plan/periodo/vencimiento para decidir si esto
    // es una renovacion, y usuario_id como unica fuente valida del destinatario.
    const { data: restPrev } = await admin
      .from('restaurantes')
      .select('plan, periodo_plan, plan_expira, usuario_id')
      .eq('id', restauranteId)
      .maybeSingle()
    const planAnterior = (restPrev?.plan as string | undefined) ?? 'gratis'
    const usuarioId = restPrev?.usuario_id as string | undefined

    // F4.b-1 (bug B): renovar lo MISMO acumula sobre el vencimiento vigente (no
    // se queman los dias que quedaban); upgrade o cambio de periodo arrancan
    // ciclo nuevo desde hoy (decision F4, sin prorrateo).
    const renovacion = esRenovacion({
      plan,
      periodo,
      planActual: restPrev?.plan as string | undefined,
      periodoActual: restPrev?.periodo_plan as string | undefined,
    })
    const planExpira = calcularPlanExpira(
      periodo,
      new Date(),
      renovacion ? (restPrev?.plan_expira as string | null | undefined) : null
    )
    // Un pago CANCELA cualquier bajada agendada: quien paga no se esta bajando.
    const { error: updErr } = await admin
      .from('restaurantes')
      .update({
        plan,
        periodo_plan: periodo,
        fue_pago: true,
        plan_expira: planExpira,
        plan_programado: null,
        fecha_cambio_programado: null,
      })
      .eq('id', restauranteId)
    if (updErr) {
      console.error('[wompi/eventos] update de restaurante fallo:', updErr.message)
      return NextResponse.json({ error: 'DB' }, { status: 500 }) // Wompi reintenta
    }

    if (!existente) {
      const [ano, mes] = fechaColombia().split('-').map(Number)
      const { error: facErr } = await admin.from('facturas').insert({
        restaurante_id: restauranteId,
        numero: reference,
        monto: transaction.amount_in_cents! / 100,
        metodo_pago: transaction.payment_method_type ?? 'wompi',
        periodo_mes: mes,
        periodo_ano: ano,
        fecha_pago: fechaColombia(),
        estado: 'aprobada',
      })
      // El plan ya se otorgo; un fallo de factura no debe gatillar reintento.
      if (facErr) console.error('[wompi/eventos] insert de factura fallo:', facErr.message)
    }

    // Email (server-callable, sin sesion). No romper el webhook si falla.
    // El destinatario sale SIEMPRE de NUESTROS datos: restaurante -> usuario_id ->
    // auth.users (via service role). JAMAS de transaction.customer_email: quien
    // paga en el formulario de Wompi puede ser un contador o socio, no el dueno de
    // la cuenta. Misma regla de identidad que /api/emails (nunca desde el body).
    // Si no se resuelve el correo, no se envia nada (fail-closed).
    let emailDueno: string | undefined
    if (usuarioId) {
      const { data: authData, error: authErr } = await admin.auth.admin.getUserById(usuarioId)
      if (authErr) console.error('[wompi/eventos] lookup del dueno fallo:', authErr.message)
      emailDueno = authData?.user?.email ?? undefined
    }
    // Se loguea el RESULTADO, nunca el valor: un no-envio debe ser diagnosticable.
    console.info(
      `[wompi/eventos] destinatario resuelto=${Boolean(emailDueno)} restaurante=${restauranteId}` +
        (usuarioId ? '' : ' (sin usuario_id)')
    )
    if (emailDueno) {
      try {
        await notificarPlanActivo({ to: emailDueno, plan, periodo, planAnterior })
      } catch {
        console.error('[wompi/eventos] envio de email fallo (plan ya activo)')
      }
    }

    return NextResponse.json({ recibido: true, plan }, { status: 200 })
  }

  // No aprobado: DECLINED / VOIDED / ERROR. Se registra para auditoria pero
  // JAMAS se otorga el plan. PENDING y otros: 200 sin escribir (evento final
  // llegara despues).
  if (status === 'DECLINED' || status === 'VOIDED' || status === 'ERROR') {
    if (!existente) {
      const estado = status === 'VOIDED' ? 'anulada' : 'rechazada'
      const [ano, mes] = fechaColombia().split('-').map(Number)
      const { error: facErr } = await admin.from('facturas').insert({
        restaurante_id: restauranteId,
        numero: reference,
        monto: (transaction.amount_in_cents ?? 0) / 100,
        metodo_pago: transaction.payment_method_type ?? 'wompi',
        periodo_mes: mes,
        periodo_ano: ano,
        fecha_pago: null,
        estado,
      })
      if (facErr) console.error('[wompi/eventos] insert de factura (no aprobada) fallo:', facErr.message)
    }
  }

  return NextResponse.json({ recibido: true, status }, { status: 200 })
}

// ── Rama nequi_token.updated (F4.c-4) ────────────────────────────────────
// GUARDA UN METODO DE PAGO. No es un pago: aqui JAMAS se tocan plan,
// periodo_plan, fue_pago ni plan_expira, y no se inserta ninguna factura.
// El cobro automatico llega en F4.c-5; hoy el usuario sigue pagando a mano.
//
// El evento NO trae reference ni restaurante: el unico enlace con nuestra fila
// es nequi_token.id, guardado como wompi_token_id al enrolar.
async function manejarTokenNequi(token: WompiNequiToken) {
  const tokenId = token.id
  const status = token.status
  if (typeof tokenId !== 'string' || !tokenId) {
    return NextResponse.json({ recibido: true }, { status: 200 })
  }

  const admin = createAdminClient()
  const { data: fuente } = await admin
    .from('fuentes_pago')
    .select('id, restaurante_id, estado')
    .eq('wompi_token_id', tokenId)
    .maybeSingle()

  // Token que no es nuestro, o fila ya borrada: 200 y a otra cosa.
  if (!fuente) {
    return NextResponse.json({ recibido: true }, { status: 200 })
  }
  // Ya resuelta (reintento de Wompi) o el usuario ya quito el metodo: no se
  // vuelve a crear nada. Un evento repetido NO puede producir una segunda fuente.
  if (fuente.estado !== 'PENDING') {
    return NextResponse.json({ recibido: true, idempotente: true }, { status: 200 })
  }

  const marcarError = async (razon: string) => {
    console.error(`[wompi/eventos] nequi fuente=${fuente.id} -> ERROR (${razon})`)
    await admin
      .from('fuentes_pago')
      .update({ estado: 'ERROR', updated_at: new Date().toISOString() })
      .eq('id', fuente.id)
      .eq('estado', 'PENDING')
    return NextResponse.json({ recibido: true, estado: 'ERROR' }, { status: 200 })
  }

  if (status !== 'APPROVED') {
    // Estados finales de rechazo: la UI los muestra y ofrece reintentar.
    if (status === 'DECLINED' || status === 'ERROR' || status === 'VOIDED') {
      return marcarError(`token ${status}`)
    }
    // PENDING u otro no final: no se escribe nada, ya llegara el definitivo.
    return NextResponse.json({ recibido: true, status }, { status: 200 })
  }

  // ── APPROVED: recien aqui existe permiso para crear la fuente de pago ──
  // Aqui SI hacen falta las dos: publica para releer /merchants (par de
  // aceptacion fresco) y PRIVADA para crear la fuente de pago.
  if (!credencialesListas('wompi/eventos', ['publica', 'privada'])) {
    // Config rota: 500 para que Wompi reintente cuando este arreglada.
    return NextResponse.json({ error: 'Pasarela no configurada' }, { status: 500 })
  }

  // customer_email SIEMPRE desde NUESTROS datos (restaurante -> usuario_id ->
  // auth.users), nunca del payload: misma regla de identidad que la rama de
  // pago aprobado.
  const { data: rest } = await admin
    .from('restaurantes')
    .select('usuario_id')
    .eq('id', fuente.restaurante_id)
    .maybeSingle()
  const usuarioId = rest?.usuario_id as string | undefined
  let email: string | undefined
  if (usuarioId) {
    const { data: authData, error: authErr } = await admin.auth.admin.getUserById(usuarioId)
    if (authErr) console.error('[wompi/eventos] lookup del dueno fallo:', authErr.message)
    email = authData?.user?.email ?? undefined
  }
  // Sin dueno resoluble no hay a nombre de quien crear la fuente, y reintentar
  // no lo va a arreglar: se marca ERROR en vez de dejar a Wompi reintentando.
  if (!email) return marcarError('sin email del dueno')

  // Par de aceptacion FRESCO: el que se capturo al enrolar ya cumplio su papel
  // (evidencia) y reusarlo daria 422 "ya fue usado" — son de un solo uso.
  const par = await obtenerParAceptacion('wompi/eventos')
  if (!par.ok) {
    return NextResponse.json({ error: 'Consentimiento no disponible' }, { status: 500 })
  }

  const creada = await crearFuenteNequi({ tokenId, email, par: par.datos }, 'wompi/eventos')
  if (!creada.ok) {
    // Red caida o 5xx de Wompi: transitorio, 500 y que reintente.
    if (creada.status === 0 || creada.status >= 500) {
      return NextResponse.json({ error: 'Pasarela no disponible' }, { status: 500 })
    }
    // 4xx: no se arregla solo (token vencido, consentimiento gastado...).
    return marcarError(`payment_sources ${creada.status}`)
  }

  // COMPARE-AND-SWAP sobre estado='PENDING': si dos entregas del mismo evento
  // corren a la vez, solo UNA escribe. La que pierde no reintenta ni falla.
  const { data: actualizada, error: errUpd } = await admin
    .from('fuentes_pago')
    .update({
      estado: 'AVAILABLE',
      wompi_payment_source_id: creada.datos.id,
      // public_data trae phone Y phone_number duplicados; se prefiere
      // phone_number y se cae al del evento. Enmascarado SIEMPRE.
      telefono_enmascarado: enmascararTelefono(
        creada.datos.public_data?.phone_number ??
          creada.datos.public_data?.phone ??
          token.phone_number ??
          token.phone
      ),
      predeterminada: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', fuente.id)
    .eq('estado', 'PENDING')
    .select('id')

  if (errUpd) {
    // 23505 = violacion de unicidad (uq_fuentes_pago_wompi_id o la
    // predeterminada): otra entrega ya dejo la fila lista. Es la idempotencia
    // funcionando, no un fallo — 200, nunca 500.
    if (errUpd.code === '23505') {
      return NextResponse.json({ recibido: true, idempotente: true }, { status: 200 })
    }
    console.error('[wompi/eventos] update de fuente nequi fallo:', errUpd.message)
    return NextResponse.json({ error: 'DB' }, { status: 500 })
  }
  if (!actualizada || actualizada.length === 0) {
    return NextResponse.json({ recibido: true, idempotente: true }, { status: 200 })
  }

  console.info(`[wompi/eventos] fuente NEQUI disponible restaurante=${fuente.restaurante_id}`)
  return NextResponse.json({ recibido: true, estado: 'AVAILABLE' }, { status: 200 })
}
