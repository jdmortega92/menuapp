import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import { fechaColombia } from '@/lib/fechas'
import {
  cambioProgramadoVencido,
  debeExpirar,
  debeCobrarse,
  fechaCalendario,
  DIAS_ANTES_DE_COBRAR,
  type FuenteCobrable,
} from '@/lib/suscripciones'
import {
  notificarPlanVencido,
  notificarCambioAplicado,
  notificarCobroFallido,
} from '@/lib/email/notificaciones'
import { centavosDe, precioDe, type Periodo } from '@/lib/planes'
import { construirConsentimiento, construirReferenciaAutomatica, firmaIntegridad } from '@/lib/wompi'
import { cobrarConFuente, credencialesListas } from '@/lib/wompiApi'
import type { Plan } from '@/types'

// F4.b-2: EJECUTOR del ciclo de vida de la suscripcion. Lo invoca Vercel Cron
// (GET diario, "0 5 * * *" UTC = medianoche COT; ver vercel.json). Es el UNICO
// escritor del estado efectivo: los gates del producto siguen leyendo rest.plan
// tal cual, sin logica de fechas en ningun lado (una sola fuente de verdad).
//
// Tres barridos, todos RECONCILIADORES (<= y <, nunca "== hoy"): Vercel no
// reintenta una corrida fallida y la entrega es best-effort (puede saltarse o
// duplicar una ejecucion), asi que cada pasada tiene que arreglar TODO lo
// pendiente y ser idempotente. Correr dos veces el mismo dia no cambia nada:
// tras el primer barrido las filas ya no califican para el segundo.
//
// ┌─ EL ORDEN DE LOS BARRIDOS ES UNA REGLA DE NEGOCIO, NO UN DETALLE ─────────┐
// │ A cambios agendados -> B expirar -> C COBRAR. NO SE REORDENA.            │
// │                                                                          │
// │ C VA DE ULTIMO PORQUE:                                                   │
// │  - despues de A: una cancelacion que vence hoy YA bajo el plan cuando C   │
// │    mira la fila, asi que a quien cancelo no se le cobra. Cobrar antes de  │
// │    A le cobraria a alguien un plan que ya cancelo — el unico bug de esta  │
// │    familia que se mide en pesos (riesgo #4 de F4.c-1).                    │
// │  - despues de B: una fila ya vencida cae a gratis antes de que C la vea,  │
// │    asi que C jamas cobra una suscripcion que ya caduco.                   │
// │                                                                          │
// │ El orden NO es la unica defensa, a proposito: debeCobrarse tambien        │
// │ devuelve false con plan_programado pendiente y exige plan_expira >= hoy.  │
// │ El orden y la regla dicen lo mismo dos veces porque el orden vive en el   │
// │ llamador y una edicion futura puede invertirlo sin saber lo que rompe.    │
// └──────────────────────────────────────────────────────────────────────────┘
//
// fue_pago NO se toca en ninguna rama: es un latch one-way (STRATEGIC.2) y
// resetearlo volveria PUBLICAS las fotos que fotosGate mantiene ocultas para
// cuentas que bajaron de plan — seria una fuga de datos, no solo un bug de plan.
//
// Y LA REGLA MADRE DEL BARRIDO C (F4.c-2/Q2): EL CRON SOLO INICIA EL COBRO.
// Aqui NO se escribe plan, ni periodo_plan, ni plan_expira, ni fue_pago, ni una
// factura, y la respuesta de la API NO se interpreta como autorizacion (llega
// 201 con status "PENDING"). Quien otorga el plan es el webhook ya probado en
// produccion, que es el unico que ve el estado final de la transaccion.

// Se responde 200 con resumen aun con fallos parciales (Vercel no reintenta: un
// 500 solo pierde el trabajo que si salio). 500 se reserva para "no se pudo ni
// arrancar" (sin secreto, o el reloj COT no produjo una fecha usable).
interface Resumen {
  fecha: string
  aplicados: number
  expirados: number
  cobrosIniciados: number
  cobrosFallidos: number
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
  const resumen: Resumen = {
    fecha: hoy,
    aplicados: 0,
    expirados: 0,
    cobrosIniciados: 0,
    cobrosFallidos: 0,
    fallidos: 0,
    correosFallidos: 0,
  }

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

  // ── Barrido A: aplicar cambios agendados (F4.b-1) ── PRIMERO SIEMPRE ──
  // El filtro SQL acota; la decision final la toma la regla pura (misma
  // convencion de fechas que el resto del repo, sin depender del casteo de
  // Postgres entre date y timestamptz).
  //
  // VA PRIMERO POR DOS RAZONES, y hoy pesa mas la segunda:
  //  1. (F4.b-2) una fila que hoy bajo a gratis ya no califica para B, asi que
  //     nadie recibe dos correos por el mismo evento.
  //  2. (F4.c-5) una CANCELACION que vence hoy tiene que estar aplicada ANTES
  //     de que el barrido C mire la fila. Cobrarle a alguien el plan que
  //     cancelo es el peor bug de este archivo, y se evita aqui.
  const { data: programados, error: errProgramados } = await admin
    .from('restaurantes')
    .select('id, plan, plan_programado, fecha_cambio_programado, usuario_id, cobro_automatico')
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

    // DESARME AL APLICAR (F4.c-5). Cancelar ya apaga el cobro automatico en el
    // momento de cancelar (/suscripcion), asi que aqui casi siempre no hay nada
    // que apagar. Esta rama existe para las filas que se agendaron ANTES de esa
    // regla y para cualquier camino futuro que agende una bajada sin pasar por
    // esa pantalla: el sitio donde la cancelacion SE APLICA es el ultimo que
    // puede garantizar que nadie termina en gratis con la bandera armada.
    // Solo para bajadas a gratis: un cambio agendado ENTRE planes pagos (que
    // hoy no existe) no es una cancelacion y no debe tocar el opt-in.
    const desarmaCobro = planNuevo === 'gratis' && fila.cobro_automatico === true

    const { error } = await admin
      .from('restaurantes')
      .update({
        plan: planNuevo,
        plan_programado: null,
        fecha_cambio_programado: null,
        ...(desarmaCobro ? { cobro_automatico: false, cobro_automatico_desde: null } : {}),
      })
      .eq('id', fila.id)
    if (error) {
      // Una fila rota no puede tumbar el barrido: se cuenta y se sigue.
      console.error(`[cron/suscripciones] aplicar cambio fallo restaurante=${fila.id}:`, error.message)
      resumen.fallidos++
      continue
    }
    resumen.aplicados++

    // Evidencia del desarme, con el MISMO peso que le da la ruta del opt-in:
    // toda salida del cobro automatico deja una fila REVOCADO en la bitacora
    // append-only, sin importar quien la ejecute. Se enlaza la fuente viva si
    // existe (aqui puede no haberla: quitar el metodo tambien apaga el opt-in).
    // Si el insert falla NO se revierte el desarme — dejar a alguien con el
    // cobro armado porque no pudimos escribir un log es peor que perder
    // evidencia; misma decision que en /api/wompi/cobro-automatico.
    if (desarmaCobro) {
      const { data: fuenteViva } = await admin
        .from('fuentes_pago')
        .select('id')
        .eq('restaurante_id', fila.id)
        .eq('estado', 'AVAILABLE')
        .eq('predeterminada', true)
        .maybeSingle()
      const { error: errConsent } = await admin.from('consentimientos_pago').insert(
        construirConsentimiento({
          restauranteId: fila.id as string,
          fuentePagoId: fuenteViva?.id ?? null,
          evento: 'REVOCADO',
          motivo: 'suscripcion_cancelada',
        })
      )
      if (errConsent) {
        console.error(`[cron/suscripciones] consentimiento REVOCADO fallo restaurante=${fila.id}:`, errConsent.message)
      }
      console.info(`[cron/suscripciones] cobro automatico apagado al aplicar cancelacion restaurante=${fila.id}`)
    }

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

  // ── Barrido B: expirar planes pagos vencidos ── SEGUNDO ──
  // Corre DESPUES de A a proposito: una fila que hoy bajo a gratis ya no
  // califica aqui, asi que nadie recibe dos correos por el mismo evento.
  // Y ANTES de C: asi una fila ya vencida esta en gratis cuando C la mira, y C
  // nunca cobra una suscripcion caducada.
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

  // ── Barrido C: INICIAR el cobro automatico (F4.c-5) ── TERCERO, SIEMPRE ──
  // Ver el bloque de ORDEN al tope del archivo antes de mover esto de sitio.
  //
  // Lo que este barrido hace y lo que NO:
  //   HACE: elegir filas con debeCobrarse, reclamar el periodo (latch), firmar y
  //         mandar UN POST /v1/transactions por fila.
  //   NO HACE: escribir plan/periodo_plan/plan_expira/fue_pago, insertar
  //         facturas, ni tratar el 201 como "cobrado" (llega PENDING). Eso es
  //         del webhook. Aqui es donde habria vivido un doble otorgamiento y
  //         queda eliminado por diseno (F4.c-2/Q2).
  //
  // Sin llave privada NO se intenta nada: se salta el barrido entero en vez de
  // fallar fila por fila (y ensuciar el latch de todo el mundo con un error de
  // configuracion nuestro).
  if (credencialesListas('cron/suscripciones', ['privada'])) {
    const secretoIntegridad = (process.env.WOMPI_INTEGRITY_SECRET ?? '').trim()
    console.info(`[cron/suscripciones] WOMPI_INTEGRITY_SECRET len=${secretoIntegridad.length}`)
    if (!secretoIntegridad) {
      // Sin firma Wompi responde 422 ("Firma de integridad requerida no
      // enviada"): mejor no tocar a nadie que quemarle el latch a cada fila.
      console.error('[cron/suscripciones] falta WOMPI_INTEGRITY_SECRET; no se intenta ningun cobro')
      resumen.fallidos++
    } else {
      await barridoCobros(secretoIntegridad)
    }
  } else {
    console.error('[cron/suscripciones] sin llave privada; no se intenta ningun cobro')
    resumen.fallidos++
  }

  async function barridoCobros(secretoIntegridad: string) {
    // El filtro SQL solo ACOTA (baratamente) y jamas decide: la palabra final es
    // siempre de debeCobrarse, que es pura y esta testeada. Se piden filas con
    // cobro automatico y vencimiento dentro de la ventana [hoy, hoy+N].
    const limite = sumarDias(hoy, DIAS_ANTES_DE_COBRAR)
    const { data: candidatos, error: errCandidatos } = await admin
      .from('restaurantes')
      .select('id, plan, periodo_plan, plan_expira, cobro_automatico, plan_programado, usuario_id')
      .eq('cobro_automatico', true)
      .neq('plan', 'gratis')
      .not('plan_expira', 'is', null)
      .gte('plan_expira', hoy)
      .lte('plan_expira', limite)

    if (errCandidatos) {
      console.error('[cron/suscripciones] lectura de candidatos a cobro fallo:', errCandidatos.message)
      resumen.fallidos++
      return
    }
    if (!candidatos || candidatos.length === 0) return

    // Las fuentes se leen en UNA consulta aparte, no con un embed de PostgREST:
    // el embed depende de que se detecte la relacion por FK y de como se nombre,
    // y una consulta que se rompe en silencio aqui significa "nadie se renueva"
    // sin ningun error visible. Dos consultas explicitas, N filas, 2 viajes.
    const ids = candidatos.map((f) => f.id as string)
    const { data: fuentes, error: errFuentes } = await admin
      .from('fuentes_pago')
      .select('id, restaurante_id, estado, predeterminada, wompi_payment_source_id, ultimo_cobro_periodo')
      .in('restaurante_id', ids)
      .eq('estado', 'AVAILABLE')
      .eq('predeterminada', true)

    if (errFuentes) {
      console.error('[cron/suscripciones] lectura de fuentes de pago fallo:', errFuentes.message)
      resumen.fallidos++
      return
    }

    const porRestaurante = new Map<string, (FuenteCobrable & { id: string })>()
    for (const f of fuentes ?? []) {
      // El indice unico parcial garantiza UNA predeterminada por restaurante,
      // asi que aqui nunca hay que elegir; si algun dia hubiera dos, quedarse
      // con la primera es preferible a cobrar dos veces.
      const rid = f.restaurante_id as string
      if (!porRestaurante.has(rid)) {
        porRestaurante.set(rid, {
          id: f.id as string,
          estado: f.estado as string,
          predeterminada: f.predeterminada as boolean,
          wompi_payment_source_id: f.wompi_payment_source_id as number | null,
          ultimo_cobro_periodo: f.ultimo_cobro_periodo as string | null,
        })
      }
    }

    for (const fila of candidatos) {
      const restauranteId = fila.id as string
      const fuente = porRestaurante.get(restauranteId) ?? null

      if (!debeCobrarse({ ...fila, fuente }, hoy)) continue

      // A partir de aqui los tipos ya estan garantizados por la regla.
      const plan = fila.plan as Plan
      const periodo = fila.periodo_plan as Periodo
      const periodoFacturado = fechaCalendario(fila.plan_expira as string)
      const montoCentavos = centavosDe(plan, periodo)
      const paymentSourceId = fuente!.wompi_payment_source_id as number
      const fuenteId = fuente!.id

      // ── RECLAMO DEL PERIODO, ANTES DE TOCAR A WOMPI ──
      // Compare-and-swap sobre ultimo_cobro_periodo: si dos corridas del cron se
      // solapan, solo UNA se lleva el periodo y la otra ve 0 filas y se va.
      // Marcar ANTES de cobrar es deliberado y asimetrico: si el proceso muere
      // entre el reclamo y el POST, esta fila NO se cobra este periodo y el
      // usuario renueva a mano. Al reves (marcar despues) una caida entre el
      // POST y la escritura dejaria la puerta abierta a un segundo cobro
      // manana. Perder una renovacion se arregla con un correo; cobrar dos
      // veces se arregla devolviendo plata.
      // periodoFacturado sale de fechaCalendario: es 'YYYY-MM-DD' validado, por
      // eso puede interpolarse en el filtro .or() sin riesgo.
      const marcaTiempo = new Date().toISOString()
      const { data: reclamada, error: errReclamo } = await admin
        .from('fuentes_pago')
        .update({
          ultimo_cobro_periodo: periodoFacturado,
          ultimo_cobro_estado: 'INICIADO',
          ultimo_cobro_error: null,
          ultimo_cobro_en: marcaTiempo,
          updated_at: marcaTiempo,
        })
        .eq('id', fuenteId)
        .eq('estado', 'AVAILABLE')
        .or(`ultimo_cobro_periodo.is.null,ultimo_cobro_periodo.neq.${periodoFacturado}`)
        .select('id')

      if (errReclamo) {
        console.error(`[cron/suscripciones] reclamo de cobro fallo restaurante=${restauranteId}:`, errReclamo.message)
        resumen.fallidos++
        continue
      }
      if (!reclamada || reclamada.length === 0) {
        // Otra corrida ya se llevo este periodo. Es la idempotencia
        // funcionando, no un fallo: ni se cuenta ni se avisa.
        console.info(`[cron/suscripciones] cobro ya reclamado restaurante=${restauranteId}`)
        continue
      }

      // Destinatario y customer_email SIEMPRE desde NUESTROS datos. Wompi exige
      // customer_email en la transaccion; ese valor sale de auth.users, nunca de
      // un payload (misma regla de identidad que el webhook y /api/emails).
      const email = await emailDelDueno(fila.usuario_id as string | null)

      const fallar = async (razon: string) => {
        // El latch NO se suelta: la politica v1 es SIN escalera de reintentos
        // (F4-DECISIONES). Queda registrado que se intento y fallo, y el usuario
        // se entera por correo para pagar a mano mientras su plan sigue vivo.
        //
        // ── UN FALLO NO ESCRIBE EN facturas. NUNCA. ──
        // Tentador ("queda el rastro del intento") y equivocado, porque el
        // webhook decide por AUSENCIA: inserta solo `if (!existente)`, buscando
        // facturas.numero == reference (wompi/eventos). Una factura 'rechazada'
        // escrita aqui ocuparia esa referencia PARA SIEMPRE, y como la
        // referencia automatica es determinista (periodo, no timestamp), el
        // evento real que llegue despues por ese mismo periodo — incluido un
        // APPROVED tardio — ya no podria insertar su factura: el usuario
        // quedaria pagado, con plan otorgado y con un documento que dice
        // "rechazada" como unico registro de su cobro.
        // El rastro del intento vive en fuentes_pago (ultimo_cobro_*), que es
        // estado operativo y se sobreescribe. facturas es el libro contable: lo
        // escribe UNICAMENTE quien vio el desenlace de la transaccion, o sea el
        // webhook.
        resumen.cobrosFallidos++
        console.error(`[cron/suscripciones] cobro fallido restaurante=${restauranteId} causa=${razon}`)
        const { error: errMarca } = await admin
          .from('fuentes_pago')
          .update({
            ultimo_cobro_estado: 'FALLIDO',
            // Codigo corto de causa: nunca el cuerpo de Wompi, que puede traer
            // datos del usuario.
            ultimo_cobro_error: razon.slice(0, 60),
            updated_at: new Date().toISOString(),
          })
          .eq('id', fuenteId)
        if (errMarca) console.error(`[cron/suscripciones] marca de fallo no se pudo escribir restaurante=${restauranteId}`)

        if (!email) {
          resumen.correosFallidos++
          console.error(`[cron/suscripciones] sin destinatario para cobro fallido restaurante=${restauranteId}`)
          return
        }
        try {
          await notificarCobroFallido({
            to: email,
            plan,
            monto: precioDe(plan, periodo),
            planExpira: periodoFacturado,
          })
        } catch {
          resumen.correosFallidos++
          console.error(`[cron/suscripciones] email de cobro fallido no se envio restaurante=${restauranteId}`)
        }
      }

      if (!email) {
        // Sin correo del dueno no hay customer_email valido que mandarle a
        // Wompi. Se trata como fallo (y el aviso, obviamente, tampoco sale).
        await fallar('sin email del dueno')
        continue
      }

      const reference = construirReferenciaAutomatica({
        restauranteId,
        plan,
        periodo,
        periodoFacturado,
      })
      const signature = firmaIntegridad({
        reference,
        amountInCents: montoCentavos,
        currency: 'COP',
        secret: secretoIntegridad,
      })

      let cobro
      try {
        cobro = await cobrarConFuente(
          { amountInCents: montoCentavos, reference, customerEmail: email, paymentSourceId, signature },
          'cron/suscripciones'
        )
      } catch (err) {
        // Una fila rota JAMAS tumba el barrido: el resto de la gente tiene que
        // poder renovarse aunque esta fila explote.
        await fallar(err instanceof Error ? err.name : 'excepcion')
        continue
      }

      if (!cobro.ok) {
        // El 422 por referencia repetida cae aqui y es CORRECTO que asi sea: la
        // proteccion anti-doble-cobro de Wompi hizo su trabajo, no hay nada que
        // reintentar, y el usuario debe enterarse igual porque su renovacion no
        // ocurrio en esta corrida.
        await fallar(`transactions ${cobro.status} ${cobro.mensaje}`)
        continue
      }

      // 201 con status PENDING. Esto NO es "cobrado" y NO otorga nada: el plan
      // lo escribe el webhook cuando la transaccion llegue a APPROVED. Se
      // loguea el id de la transaccion (de Wompi, no personal) para poder
      // rastrear la pareja cron->webhook en produccion.
      resumen.cobrosIniciados++
      console.info(
        `[cron/suscripciones] cobro iniciado restaurante=${restauranteId} plan=${plan} ` +
          `periodo=${periodo} tx=${cobro.datos?.id ?? 'sin id'} estado=${cobro.datos?.status ?? 'sin estado'}`
      )
    }
  }

  // Una corrida vacia legitima y una rota TIENEN que verse distinto en los logs
  // de Vercel: por eso siempre se emite la linea, con los contadores.
  console.info(
    `[cron/suscripciones] fecha=${resumen.fecha} aplicados=${resumen.aplicados} ` +
      `expirados=${resumen.expirados} cobrosIniciados=${resumen.cobrosIniciados} ` +
      `cobrosFallidos=${resumen.cobrosFallidos} fallidos=${resumen.fallidos} ` +
      `correosFallidos=${resumen.correosFallidos}`
  )

  return NextResponse.json({ ok: true, ...resumen }, { status: 200 })
}

/** Suma dias a una fecha calendario. Solo para ACOTAR el filtro SQL del barrido
 *  C; quien decide de verdad es debeCobrarse (que usa restarDias, su inversa).
 *  Aritmetica UTC pura sobre componentes explicitos: sin reloj ni huso. */
function sumarDias(ymd: string, dias: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + dias))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}
