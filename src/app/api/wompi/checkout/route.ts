import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { centavosDe, type Periodo } from '@/lib/planes'
import { construirReferencia, firmaIntegridad, construirUrlCheckout } from '@/lib/wompi'
import { fechaColombia, fechaLargaColombia } from '@/lib/fechas'
import { fechaCalendario } from '@/lib/suscripciones'
import {
  clasificarCambio,
  esperaVencimiento,
  nombreConPeriodo,
  textoEsperaVencimiento,
} from '@/lib/cambioPlan'
import { cobroEnVuelo, MENSAJE_COBRO_EN_VUELO } from '@/lib/pagos/cobroEstado'
import type { Plan } from '@/types'

// PIECE 1 (F4.a-2): crea el checkout de Wompi para un plan pago. La identidad
// NUNCA sale del body (mismo patron que /api/emails): el usuario viene de la
// sesion y el restaurante se lee por usuario_id. El body solo trae plan+periodo.
// El monto viene de lib/planes (jamas hardcodeado) y el secreto de integridad
// nunca se expone al navegador (solo se devuelve la URL ya firmada).

const PLANES_PAGOS = ['basico', 'pro']
const PERIODOS_VALIDOS = ['mensual', 'anual']
const VIGENCIA_CHECKOUT_MS = 30 * 60 * 1000

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
    .select('id, plan, periodo_plan, plan_expira')
    .eq('usuario_id', user.id)
    .maybeSingle()
  if (restError || !rest) {
    console.error('[wompi/checkout] lectura de restaurante fallo:', restError?.message)
    return NextResponse.json({ error: 'Restaurante no disponible' }, { status: 500 })
  }

  // ── COBRO AUTOMATICO EN VUELO (CIERRE 6a, D-HIGH-3) ──
  // Con el cobro del periodo vigente INICIADO o en REVISION, un pago manual
  // puede cobrar dos veces (referencias distintas: ni el latch ni el 422 de
  // Wompi lo frenan). Cualquier fuente, no solo la viva: una revocada despues
  // del reclamo sigue teniendo el cobro en vuelo. Si la lectura falla, NO se
  // cobra (fail-closed: es plata).
  const { data: fuentes, error: fuentesError } = await supabase
    .from('fuentes_pago')
    .select('ultimo_cobro_estado, ultimo_cobro_periodo')
    .eq('restaurante_id', rest.id)
    .in('ultimo_cobro_estado', ['INICIADO', 'REVISION'])
  if (fuentesError) {
    console.error('[wompi/checkout] lectura de fuentes fallo:', fuentesError.message)
    return NextResponse.json({ error: 'No pudimos iniciar el pago. Intenta de nuevo.' }, { status: 500 })
  }
  const enVuelo = cobroEnVuelo(fuentes ?? [], rest.plan_expira as string | null)
  if (enVuelo) {
    console.info(`[wompi/checkout] pago manual bloqueado por cobro automatico ${enVuelo} restaurante=${rest.id}`)
    return NextResponse.json({ error: MENSAJE_COBRO_EN_VUELO[enVuelo] }, { status: 409 })
  }

  // ── BAJADAS: se eligen al vencer (CIERRE 6a) ──
  // Una bajada de plan o un paso a mensual con tiempo pagado por delante no se
  // cobra: le quemaria al usuario lo que ya pago. La MISMA regla que pinta la
  // hoja informativa de /suscripcion (lib/cambioPlan).
  const hoy = fechaColombia()
  const actual = {
    plan: rest.plan as string | null,
    periodo: rest.periodo_plan as string | null,
    planExpira: rest.plan_expira as string | null,
  }
  const objetivo = { plan: plan as Plan, periodo: periodo as Periodo }
  const clase = clasificarCambio(actual, objetivo, hoy)
  if (esperaVencimiento(clase, actual, hoy)) {
    const planActual = rest.plan as Plan
    const periodoActual: Periodo = rest.periodo_plan === 'anual' ? 'anual' : 'mensual'
    const mensaje = textoEsperaVencimiento(
      nombreConPeriodo(planActual, periodoActual),
      fechaLargaColombia(fechaCalendario(rest.plan_expira as string | null)),
      nombreConPeriodo(objetivo.plan, objetivo.periodo)
    )
    return NextResponse.json({ error: mensaje }, { status: 409 })
  }

  const amountInCents = centavosDe(plan as Plan, periodo as Periodo)
  if (amountInCents <= 0) {
    return NextResponse.json({ error: 'Monto invalido' }, { status: 400 })
  }

  // Se hace trim: un valor con espacios/newline pegado en Vercel pasaria el
  // check de "existe" pero rompe la firma. Solo se loguea que FALTA (S-1,
  // CIERRE 5a): ni el valor ni su longitud.
  const secret = (process.env.WOMPI_INTEGRITY_SECRET ?? '').trim()
  const publicKey = (process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY ?? '').trim()
  if (!secret) {
    console.error('[wompi/checkout] falta WOMPI_INTEGRITY_SECRET')
    return NextResponse.json({ error: 'Pasarela no configurada' }, { status: 500 })
  }
  if (!publicKey) {
    console.error('[wompi/checkout] falta NEXT_PUBLIC_WOMPI_PUBLIC_KEY')
    return NextResponse.json({ error: 'Pasarela no configurada' }, { status: 500 })
  }

  const currency = 'COP'
  const reference = construirReferencia({
    restauranteId: rest.id,
    plan: plan as Plan,
    periodo: periodo as Periodo,
  })
  // CIERRE 6a: el checkout vence a los 30 minutos. Un enlace sin vencimiento
  // podia quedar abierto en una pestana y pagarse dias despues, encima de un
  // cobro automatico que el cron ya hizo (la otra mitad de D-HIGH-3). El mismo
  // valor entra en la firma y en la URL, o Wompi rechaza la firma.
  const expirationTime = new Date(Date.now() + VIGENCIA_CHECKOUT_MS).toISOString()
  const signature = firmaIntegridad({ reference, amountInCents, currency, secret, expirationTime })

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
    expirationTime,
  })

  return NextResponse.json({ url, reference })
}
