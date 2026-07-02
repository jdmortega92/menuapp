import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { enviarEmail } from '@/lib/email/sender'
import { bienvenida } from '@/lib/email/templates/bienvenida'
import { cambioPlan } from '@/lib/email/templates/cambioPlan'

// F3: correos transaccionales (bienvenida y cambio de plan) vía Resend.
// El body solo trae el tipo (y los planes para el copy de cambio_plan);
// la identidad NUNCA sale del body: destinatario = email de la sesión
// (cookie), datos del restaurante = lectura en DB por el usuario de la
// sesión. Sin sesión -> 401 y no se envía nada.

const PLANES_VALIDOS = ['gratis', 'basico', 'pro']

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  // Validación manual del body (sin zod, deps mínimas).
  const { tipo, plan_nuevo, plan_anterior } = (body ?? {}) as Record<string, unknown>

  if (tipo !== 'bienvenida' && tipo !== 'cambio_plan') {
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  }

  if (tipo === 'cambio_plan') {
    if (
      typeof plan_nuevo !== 'string' ||
      typeof plan_anterior !== 'string' ||
      !PLANES_VALIDOS.includes(plan_nuevo) ||
      !PLANES_VALIDOS.includes(plan_anterior) ||
      plan_nuevo === plan_anterior
    ) {
      return NextResponse.json({ error: 'Planes inválidos' }, { status: 400 })
    }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data: rest, error: restError } = await supabase
    .from('restaurantes')
    .select('id, nombre, bienvenida_enviada')
    .eq('usuario_id', user.id)
    .maybeSingle()

  // Fail closed: si la lectura falla (p. ej. la columna bienvenida_enviada
  // no existe todavía), no se envía nada.
  if (restError || !rest) {
    console.error('[api/emails] lectura de restaurante falló:', restError?.message)
    return NextResponse.json({ error: 'Restaurante no disponible' }, { status: 500 })
  }

  if (tipo === 'bienvenida') {
    // Idempotencia: un solo correo de bienvenida por restaurante.
    if (rest.bienvenida_enviada) {
      return NextResponse.json({ enviado: false, motivo: 'ya_enviado' })
    }

    const { error: sendError } = await enviarEmail({ to: user.email, ...bienvenida(rest.nombre) })
    if (sendError) {
      console.error('[api/emails] envío de bienvenida falló:', sendError.message)
      return NextResponse.json({ error: 'Envío falló' }, { status: 502 })
    }

    const { error: updateError } = await supabase
      .from('restaurantes')
      .update({ bienvenida_enviada: true })
      .eq('id', rest.id)
    if (updateError) {
      // El correo ya salió; solo se registra que el flag no quedó marcado.
      console.error('[api/emails] no se pudo marcar bienvenida_enviada:', updateError.message)
    }

    return NextResponse.json({ enviado: true })
  }

  // cambio_plan (plan_nuevo/plan_anterior ya validados arriba)
  const { error: sendError } = await enviarEmail({
    to: user.email,
    ...cambioPlan({ plan_nuevo: plan_nuevo as string, plan_anterior: plan_anterior as string }),
  })
  if (sendError) {
    console.error('[api/emails] envío de cambio_plan falló:', sendError.message)
    return NextResponse.json({ error: 'Envío falló' }, { status: 502 })
  }

  return NextResponse.json({ enviado: true })
}
