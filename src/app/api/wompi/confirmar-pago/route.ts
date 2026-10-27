import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { obtenerTransaccion } from '@/lib/wompiApi'
import { aplicarTransaccionAprobada } from '@/lib/pagos/aplicarTransaccion'
import {
  esIdTransaccionValido,
  estadoRetornoDeResultado,
  estadoRetornoDeStatus,
  referenciaEsDelRestaurante,
} from '@/lib/pagos/transaccion'

// CIERRE 5a: confirmacion del pago al VOLVER del checkout de Wompi. Wompi
// redirige a /suscripcion?...&id=<transaccion>&env=...; la pagina llama aqui
// para no depender de que el webhook llegue a tiempo (sin esto el dueno veia el
// vencimiento viejo justo despues de pagar y podia pagar dos veces).
//
// Identidad SIEMPRE de la sesion: el restaurante se lee por usuario_id, nunca
// del body; el body solo trae el id de la transaccion. Si la transaccion no es
// de ESTE restaurante (o no existe), 404 sin detalles: esta ruta no puede
// servir para averiguar nada de otro restaurante.
//
// Si la transaccion es APPROVED se aplica por EL MISMO camino del webhook
// (lib/pagos/aplicarTransaccion): idempotente via aplicar_pago_aprobado, asi
// que si el webhook ya la aplico esto devuelve 'duplicado' y no escribe nada ni
// manda correo. El env del query string se ignora: el entorno lo resuelve el
// servidor por las llaves (CIERRE 4).

const ETQ = 'wompi/confirmar-pago'
const NO_ENCONTRADA = () => NextResponse.json({ error: 'No encontrada' }, { status: 404 })

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body invalido' }, { status: 400 })
  }
  const { id } = (body ?? {}) as Record<string, unknown>
  if (!esIdTransaccionValido(id)) {
    return NextResponse.json({ error: 'Id invalido' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: rest, error: restError } = await supabase
    .from('restaurantes')
    .select('id')
    .eq('usuario_id', user.id)
    .maybeSingle()
  if (restError || !rest) {
    console.error(`[${ETQ}] lectura de restaurante fallo:`, restError?.message)
    return NextResponse.json({ estado: 'error' })
  }

  const tx = await obtenerTransaccion(id, ETQ)
  if (!tx.ok) {
    // Red caida o 5xx: transitorio, la pagina reintenta. 4xx (id inexistente o
    // de otro entorno): no hay nada que confirmar.
    if (tx.status === 0 || tx.status >= 500) {
      console.error(`[${ETQ}] Wompi no disponible (${tx.status}) restaurante=${rest.id}`)
      return NextResponse.json({ estado: 'pendiente' })
    }
    return NO_ENCONTRADA()
  }

  const transaccion = tx.datos
  if (!transaccion || !referenciaEsDelRestaurante(transaccion.reference, rest.id)) {
    return NO_ENCONTRADA()
  }

  if (transaccion.status !== 'APPROVED') {
    return NextResponse.json({ estado: estadoRetornoDeStatus(transaccion.status) })
  }

  const resultado = await aplicarTransaccionAprobada(transaccion, 'retorno')
  const estado = estadoRetornoDeResultado(resultado)
  if (estado !== 'aprobado') {
    if (estado === 'error') {
      console.error(`[${ETQ}] no se pudo aplicar resultado=${resultado.tipo} restaurante=${rest.id}`)
    }
    return NextResponse.json({ estado })
  }

  // Lo que la pagina necesita mostrar, leido DESPUES de aplicar (si fue
  // 'duplicado', es lo que dejo el webhook). planAnterior solo se conoce cuando
  // ESTE camino aplico; con 'duplicado' la pagina usa el plan que guardo antes
  // de ir al checkout.
  const { data: actual } = await supabase
    .from('restaurantes')
    .select('plan, periodo_plan, plan_expira')
    .eq('id', rest.id)
    .maybeSingle()

  return NextResponse.json({
    estado: 'aprobado',
    plan: actual?.plan ?? (resultado.tipo === 'aplicado' ? resultado.plan : null),
    periodo: actual?.periodo_plan ?? (resultado.tipo === 'aplicado' ? resultado.periodo : null),
    plan_expira: actual?.plan_expira ?? (resultado.tipo === 'aplicado' ? resultado.planExpira : null),
    planAnterior: resultado.tipo === 'aplicado' ? resultado.planAnterior : null,
  })
}
