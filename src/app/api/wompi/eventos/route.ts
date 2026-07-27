import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  calcularChecksumEvento,
  calcularPlanExpira,
  parsearReferencia,
  type WompiEvento,
} from '@/lib/wompi'
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

    // Plan anterior (para el copy del email) y DUENO de la cuenta, antes de
    // sobreescribir. usuario_id es la unica fuente valida del destinatario.
    const { data: restPrev } = await admin
      .from('restaurantes')
      .select('plan, usuario_id')
      .eq('id', restauranteId)
      .maybeSingle()
    const planAnterior = (restPrev?.plan as string | undefined) ?? 'gratis'
    const usuarioId = restPrev?.usuario_id as string | undefined

    const planExpira = calcularPlanExpira(periodo)
    const { error: updErr } = await admin
      .from('restaurantes')
      .update({ plan, periodo_plan: periodo, fue_pago: true, plan_expira: planExpira })
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
