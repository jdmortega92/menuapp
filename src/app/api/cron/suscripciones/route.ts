import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import { fechaColombia } from '@/lib/fechas'
import { cambioProgramadoVencido, debeExpirar } from '@/lib/suscripciones'
import { notificarPlanVencido, notificarCambioAplicado } from '@/lib/email/notificaciones'

// F4.b-2: EJECUTOR del ciclo de vida de la suscripcion. Lo invoca Vercel Cron
// (GET diario, "0 5 * * *" UTC = medianoche COT; ver vercel.json). Es el UNICO
// escritor del estado efectivo: los gates del producto siguen leyendo rest.plan
// tal cual, sin logica de fechas en ningun lado (una sola fuente de verdad).
//
// Dos barridos, ambos RECONCILIADORES (<= y <, nunca "== hoy"): Vercel no
// reintenta una corrida fallida y la entrega es best-effort (puede saltarse o
// duplicar una ejecucion), asi que cada pasada tiene que arreglar TODO lo
// pendiente y ser idempotente. Correr dos veces el mismo dia no cambia nada:
// tras el primer barrido las filas ya no califican para el segundo.
//
// fue_pago NO se toca en ninguna rama: es un latch one-way (STRATEGIC.2) y
// resetearlo volveria PUBLICAS las fotos que fotosGate mantiene ocultas para
// cuentas que bajaron de plan — seria una fuga de datos, no solo un bug de plan.

// Se responde 200 con resumen aun con fallos parciales (Vercel no reintenta: un
// 500 solo pierde el trabajo que si salio). 500 se reserva para "no se pudo ni
// arrancar" (sin secreto, o el reloj COT no produjo una fecha usable).
interface Resumen {
  fecha: string
  aplicados: number
  expirados: number
  fallidos: number
  correosFallidos: number
}

export async function GET(request: Request) {
  // ── Guardia del secreto ──
  // .trim(): un valor pegado en Vercel con espacio/newline pasaria el chequeo de
  // "existe" y romperia la comparacion (misma clase de bug que ya nos mordio en
  // wompi/checkout). Se loguea el NOMBRE y la LONGITUD, jamas el valor.
  const secret = (process.env.CRON_SECRET ?? '').trim()
  console.info(`[cron/suscripciones] CRON_SECRET len=${secret.length}`)
  if (!secret) {
    console.error('[cron/suscripciones] falta CRON_SECRET')
    return NextResponse.json({ error: 'No configurado' }, { status: 500 })
  }

  // Comparacion TIMING-SAFE del header que manda Vercel ("Authorization:
  // Bearer <CRON_SECRET>"), nunca === sobre strings.
  const recibido = (request.headers.get('authorization') ?? '').trim()
  const esperado = `Bearer ${secret}`
  const a = Buffer.from(esperado, 'utf8')
  const b = Buffer.from(recibido, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // ── "Hoy" en Colombia ──
  // PRIMER uso server-side del formateador Intl con timeZone America/Bogota: si
  // el runtime no trae ICU completo esto degradaria en silencio a UTC y expiraria
  // gente un dia antes (familia BL.29). Se ASERTA la forma antes de escribir nada.
  const hoy = fechaColombia()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoy)) {
    console.error('[cron/suscripciones] fechaColombia() no devolvio YYYY-MM-DD; se aborta sin escribir')
    return NextResponse.json({ error: 'Reloj COT no disponible' }, { status: 500 })
  }

  const admin = createAdminClient()
  const resumen: Resumen = { fecha: hoy, aplicados: 0, expirados: 0, fallidos: 0, correosFallidos: 0 }

  // Destinatario SIEMPRE desde nuestros datos: usuario_id -> auth.users. Jamas
  // de un payload. Misma regla que /api/emails y el webhook de Wompi.
  async function emailDelDueno(usuarioId: string | null | undefined): Promise<string | undefined> {
    if (!usuarioId) return undefined
    const { data, error } = await admin.auth.admin.getUserById(usuarioId)
    if (error) {
      console.error('[cron/suscripciones] lookup del dueno fallo:', error.message)
      return undefined
    }
    return data?.user?.email ?? undefined
  }

  // ── Barrido A: aplicar cambios agendados (F4.b-1) ──
  // El filtro SQL acota; la decision final la toma la regla pura (misma
  // convencion de fechas que el resto del repo, sin depender del casteo de
  // Postgres entre date y timestamptz).
  const { data: programados, error: errProgramados } = await admin
    .from('restaurantes')
    .select('id, plan, plan_programado, fecha_cambio_programado, usuario_id')
    .not('plan_programado', 'is', null)
    .lte('fecha_cambio_programado', hoy)

  if (errProgramados) {
    // No aborta la corrida: el barrido B es independiente y puede salvarse.
    console.error('[cron/suscripciones] lectura de cambios agendados fallo:', errProgramados.message)
    resumen.fallidos++
  }

  for (const fila of programados ?? []) {
    if (!cambioProgramadoVencido(fila.fecha_cambio_programado, hoy)) continue
    const planNuevo = fila.plan_programado as string
    const planAnterior = (fila.plan as string | null) ?? 'gratis'

    const { error } = await admin
      .from('restaurantes')
      .update({ plan: planNuevo, plan_programado: null, fecha_cambio_programado: null })
      .eq('id', fila.id)
    if (error) {
      // Una fila rota no puede tumbar el barrido: se cuenta y se sigue.
      console.error(`[cron/suscripciones] aplicar cambio fallo restaurante=${fila.id}:`, error.message)
      resumen.fallidos++
      continue
    }
    resumen.aplicados++

    const to = await emailDelDueno(fila.usuario_id as string | null)
    if (to) {
      try {
        await notificarCambioAplicado({ to, planAnterior, planNuevo })
      } catch {
        // El cambio ya se aplico: el correo nunca revierte ni aborta.
        resumen.correosFallidos++
        console.error(`[cron/suscripciones] email de cambio aplicado fallo restaurante=${fila.id}`)
      }
    } else {
      resumen.correosFallidos++
      console.error(`[cron/suscripciones] sin destinatario para cambio aplicado restaurante=${fila.id}`)
    }
  }

  // ── Barrido B: expirar planes pagos vencidos ──
  // Corre DESPUES de A a proposito: una fila que hoy bajo a gratis ya no
  // califica aqui, asi que nadie recibe dos correos por el mismo evento.
  const { data: vencidos, error: errVencidos } = await admin
    .from('restaurantes')
    .select('id, plan, plan_expira, usuario_id')
    .neq('plan', 'gratis')
    .not('plan_expira', 'is', null)
    .lt('plan_expira', hoy)

  if (errVencidos) {
    console.error('[cron/suscripciones] lectura de vencidos fallo:', errVencidos.message)
    resumen.fallidos++
  }

  for (const fila of vencidos ?? []) {
    if (!debeExpirar(fila.plan as string, fila.plan_expira as string, hoy)) continue
    const planAnterior = fila.plan as string

    // plan_expira NO se limpia: queda como registro historico de hasta cuando
    // estuvo pago (lo lee /suscripcion para decir "Tu plan venció el ...").
    const { error } = await admin
      .from('restaurantes')
      .update({ plan: 'gratis' })
      .eq('id', fila.id)
    if (error) {
      console.error(`[cron/suscripciones] expirar fallo restaurante=${fila.id}:`, error.message)
      resumen.fallidos++
      continue
    }
    resumen.expirados++

    const to = await emailDelDueno(fila.usuario_id as string | null)
    if (to) {
      try {
        await notificarPlanVencido({ to, planAnterior })
      } catch {
        resumen.correosFallidos++
        console.error(`[cron/suscripciones] email de vencimiento fallo restaurante=${fila.id}`)
      }
    } else {
      resumen.correosFallidos++
      console.error(`[cron/suscripciones] sin destinatario para vencimiento restaurante=${fila.id}`)
    }
  }

  // Una corrida vacia legitima y una rota TIENEN que verse distinto en los logs
  // de Vercel: por eso siempre se emite la linea, con los contadores.
  console.info(
    `[cron/suscripciones] fecha=${resumen.fecha} aplicados=${resumen.aplicados} ` +
      `expirados=${resumen.expirados} fallidos=${resumen.fallidos} correosFallidos=${resumen.correosFallidos}`
  )

  return NextResponse.json({ ok: true, ...resumen }, { status: 200 })
}
