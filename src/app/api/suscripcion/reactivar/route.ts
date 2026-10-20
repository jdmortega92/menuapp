import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

// CIERRE 1 — DESHACER UNA CANCELACION AGENDADA (patron "Restart membership").
// Reemplaza el UPDATE del navegador que limpiaba plan_programado y
// fecha_cambio_programado. Solo limpia esas dos columnas: el plan nunca se bajo,
// asi que no hay nada que restaurar.
//
// NO REENCIENDE cobro_automatico, A PROPOSITO (decision vigente): reactivar el
// plan NO es pedir que le vuelvan a sacar plata sola. Encender la renovacion
// sigue siendo un acto explicito en la tarjeta de metodo de pago.

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Identidad SIEMPRE desde la sesion (misma regla que /api/wompi/*).
  const { data: rest, error: restError } = await supabase
    .from('restaurantes')
    .select('id')
    .eq('usuario_id', user.id)
    .maybeSingle()
  if (restError || !rest) {
    console.error('[suscripcion/reactivar] lectura de restaurante fallo:', restError?.message)
    return NextResponse.json({ error: 'Restaurante no disponible' }, { status: 500 })
  }

  const admin = createAdminClient()
  const { data: filas, error: errUpd } = await admin
    .from('restaurantes')
    .update({ plan_programado: null, fecha_cambio_programado: null })
    .eq('id', rest.id)
    .not('plan_programado', 'is', null)
    .select('id')
  if (errUpd) {
    console.error('[suscripcion/reactivar] update fallo:', errUpd.message)
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 })
  }

  // 0 filas = no habia nada agendado (ya reactivada, o el cron ya la aplico):
  // idempotente, la pagina revalida y pinta el estado real.
  const reactivada = Boolean(filas && filas.length > 0)
  console.info(`[suscripcion/reactivar] restaurante=${rest.id} reactivada=${reactivada}`)
  return NextResponse.json({ ok: true, ...(reactivada ? {} : { idempotente: true }) }, { status: 200 })
}
