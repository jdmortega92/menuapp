import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { centavosDe, type Periodo } from '@/lib/planes'
import { construirReferencia, firmaIntegridad, construirUrlCheckout } from '@/lib/wompi'
import type { Plan } from '@/types'

// PIECE 1 (F4.a-2): crea el checkout de Wompi para un plan pago. La identidad
// NUNCA sale del body (mismo patron que /api/emails): el usuario viene de la
// sesion y el restaurante se lee por usuario_id. El body solo trae plan+periodo.
// El monto viene de lib/planes (jamas hardcodeado) y el secreto de integridad
// nunca se expone al navegador (solo se devuelve la URL ya firmada).

const PLANES_PAGOS = ['basico', 'pro']
const PERIODOS_VALIDOS = ['mensual', 'anual']

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body invalido' }, { status: 400 })
  }

  const { plan, periodo } = (body ?? {}) as Record<string, unknown>
  if (typeof plan !== 'string' || !PLANES_PAGOS.includes(plan)) {
    return NextResponse.json({ error: 'Plan invalido' }, { status: 400 })
  }
  if (typeof periodo !== 'string' || !PERIODOS_VALIDOS.includes(periodo)) {
    return NextResponse.json({ error: 'Periodo invalido' }, { status: 400 })
  }

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
    console.error('[wompi/checkout] lectura de restaurante fallo:', restError?.message)
    return NextResponse.json({ error: 'Restaurante no disponible' }, { status: 500 })
  }

  const amountInCents = centavosDe(plan as Plan, periodo as Periodo)
  if (amountInCents <= 0) {
    return NextResponse.json({ error: 'Monto invalido' }, { status: 400 })
  }

  // Se hace trim: un valor con espacios/newline pegado en Vercel pasaria el
  // check de "existe" pero rompe la firma. Se loguea el nombre y la LONGITUD
  // (nunca el valor) para distinguir vacio (len=0) de truncado (len corto pero
  // != esperado). La longitud se loguea SIEMPRE, no solo al faltar: un valor
  // truncado pasa el guard de "existe" y solo se detecta por su longitud.
  const secret = (process.env.WOMPI_INTEGRITY_SECRET ?? '').trim()
  const publicKey = (process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY ?? '').trim()
  console.info(
    `[wompi/checkout] creds len: WOMPI_INTEGRITY_SECRET=${secret.length} NEXT_PUBLIC_WOMPI_PUBLIC_KEY=${publicKey.length}`
  )
  if (!secret) {
    console.error(`[wompi/checkout] falta WOMPI_INTEGRITY_SECRET (len=${secret.length})`)
    return NextResponse.json({ error: 'Pasarela no configurada' }, { status: 500 })
  }
  if (!publicKey) {
    console.error(`[wompi/checkout] falta NEXT_PUBLIC_WOMPI_PUBLIC_KEY (len=${publicKey.length})`)
    return NextResponse.json({ error: 'Pasarela no configurada' }, { status: 500 })
  }

  const currency = 'COP'
  const reference = construirReferencia({
    restauranteId: rest.id,
    plan: plan as Plan,
    periodo: periodo as Periodo,
  })
  const signature = firmaIntegridad({ reference, amountInCents, currency, secret })

  // redirect-url apunta al mismo origen del request (localhost en dev, deploy en
  // prod). El plan NO se activa aqui: al volver, la UI muestra "procesando" y el
  // webhook confirma de forma asincrona.
  const origin = new URL(request.url).origin
  const redirectUrl = `${origin}/suscripcion?estado=procesando`

  const url = construirUrlCheckout({
    publicKey,
    currency,
    amountInCents,
    reference,
    signature,
    redirectUrl,
    customerEmail: user.email,
  })

  return NextResponse.json({ url, reference })
}
