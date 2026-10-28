// Camino COMPARTIDO "aplicar pago aprobado" (CIERRE 5a). SOLO SERVIDOR: usa el
// cliente de service role. Lo llaman:
//   - el webhook /api/wompi/eventos (origen 'webhook'), que traduce el resultado
//     a EXACTAMENTE las respuestas HTTP de antes (lib/pagos/transaccion.respuestaWebhook);
//   - el retorno del checkout /api/wompi/confirmar-pago (origen 'retorno');
//   - la conciliacion del cron, lib/pagos/conciliarCobros (origen 'conciliacion',
//     CIERRE 5b), cuando el GET a Wompi muestra un APPROVED que el webhook no trajo.
// Es idempotente por construccion: la factura con numero == reference es la
// huella, y aplicar_pago_aprobado la inserta con ON CONFLICT (numero) DO NOTHING,
// asi que el segundo que llegue (webhook o retorno) recibe 'duplicado' y no
// escribe nada ni manda correo.

import { createAdminClient } from '@/lib/supabase-admin'
import {
  calcularPlanExpira,
  esReferenciaAutomatica,
  esRenovacion,
  parsearReferencia,
  periodoDeReferenciaAutomatica,
  type WompiTransaction,
} from '@/lib/wompi'
import { centavosDe, precioDe } from '@/lib/planes'
import { fechaColombia } from '@/lib/fechas'
import { notificarPlanActivo, notificarRenovacionCobrada } from '@/lib/email/notificaciones'
import { esIdTransaccionValido, motivoMontoInvalido, type ResultadoAplicar } from './transaccion'
import { FILTRO_ORIGEN_APROBADO } from './cobroEstado'

export type OrigenPago = 'webhook' | 'retorno' | 'conciliacion'

const ETIQUETA: Record<OrigenPago, string> = {
  webhook: 'wompi/eventos',
  retorno: 'wompi/confirmar-pago',
  conciliacion: 'cron/conciliacion',
}

/** Aplica una transaccion APPROVED. El llamador garantiza status === 'APPROVED'
 *  (el webhook por la firma, el retorno por el GET a Wompi). */
export async function aplicarTransaccionAprobada(
  transaction: WompiTransaction,
  origen: OrigenPago
): Promise<ResultadoAplicar> {
  const etq = ETIQUETA[origen]
  const reference = transaction.reference
  // La referencia la emitimos nosotros (embebe restaurante/plan/periodo).
  const parsed = typeof reference === 'string' ? parsearReferencia(reference) : null
  if (!reference || !parsed) return { tipo: 'referencia_invalida' }
  const { restauranteId, plan, periodo } = parsed

  // Defensa en profundidad: monto = precio real Y moneda COP (D-LOW-1).
  const motivo = motivoMontoInvalido(transaction, plan, periodo)
  if (motivo) {
    // Sin otorgar plan, pero como ERROR con todo lo necesario para reconciliar a
    // mano (C-6): un APPROVED con monto o moneda distintos es plata cobrada sin
    // plan otorgado. Reintentar no cambia el monto.
    if (motivo === 'monto') {
      console.error(
        `[${etq}] monto no coincide, no se otorga plan reference=${reference} ` +
          `restaurante=${restauranteId} esperado=${centavosDe(plan, periodo)} recibido=${transaction.amount_in_cents}`
      )
    } else {
      console.error(
        `[${etq}] moneda no coincide, no se otorga plan reference=${reference} ` +
          `restaurante=${restauranteId} esperado=COP recibido=${transaction.currency}`
      )
    }
    return { tipo: 'monto_invalido' }
  }
  if (transaction.currency === undefined || transaction.currency === null) {
    // No bloquea: Wompi Colombia es solo COP y el monto ya cuadro. Queda el rastro.
    console.warn(`[${etq}] transaccion sin moneda, se asume COP reference=${reference} restaurante=${restauranteId}`)
  }

  const admin = createAdminClient()

  // Idempotencia: la factura con numero == reference es la huella del pago.
  const { data: existente } = await admin
    .from('facturas')
    .select('id, estado')
    .eq('numero', reference)
    .maybeSingle()
  // Ya procesado: no re-escribir ni duplicar factura.
  if (existente?.estado === 'aprobada') {
    await marcarCobroAutomaticoAprobado(admin, transaction, restauranteId, etq)
    return { tipo: 'duplicado' }
  }

  // Estado ANTERIOR de la fila: plan/periodo/vencimiento para decidir si esto
  // es una renovacion, y usuario_id como unica fuente valida del destinatario.
  const { data: restPrev } = await admin
    .from('restaurantes')
    .select('plan, periodo_plan, plan_expira, usuario_id')
    .eq('id', restauranteId)
    .maybeSingle()
  if (!restPrev) {
    // Reintentar no crea el restaurante: queda en el log para revisar.
    console.error(`[${etq}] restaurante no existe reference=${reference} restaurante=${restauranteId}`)
    return { tipo: 'restaurante_inexistente' }
  }
  // El plan REAL de la fila antes del RPC, sin default: el retorno lo devuelve
  // para decidir el aviso de desbloqueo, y un 'gratis' inventado lo dispararia.
  // (El correo conserva su default de siempre dentro de notificarPlanActivo.)
  const planAnterior = (restPrev?.plan as string | null | undefined) ?? null
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
  // FACTURA + PLAN EN UNA SOLA TRANSACCION (CIERRE 3, C-1 / D-HIGH-2): la
  // funcion inserta la factura con ON CONFLICT (numero) DO NOTHING y solo si
  // entro actualiza el plan, condicionado a que la fila siga como se leyo
  // arriba. Todo o nada. Un pago CANCELA cualquier bajada agendada.
  const [ano, mes] = fechaColombia().split('-').map(Number)
  const { data: resultado, error: rpcErr } = await admin.rpc('aplicar_pago_aprobado', {
    p_restaurante_id: restauranteId,
    p_numero: reference,
    p_monto: transaction.amount_in_cents! / 100,
    p_metodo_pago: transaction.payment_method_type ?? 'wompi',
    p_periodo_mes: mes,
    p_periodo_ano: ano,
    p_fecha_pago: fechaColombia(),
    p_plan: plan,
    p_periodo: periodo,
    p_plan_expira: planExpira,
    // El estado ANTERIOR tal cual se leyo: la funcion solo escribe si la fila
    // sigue igual, asi que lo que se calculo arriba sigue siendo valido.
    p_prev_plan: restPrev.plan ?? null,
    p_prev_periodo: restPrev.periodo_plan ?? null,
    p_prev_plan_expira: restPrev.plan_expira ?? null,
  })
  if (rpcErr) {
    if (rpcErr.code === 'MA409') {
      // La fila cambio entre la lectura y la escritura (otro evento, el cron, el
      // retorno). No se escribio nada; el reintento de Wompi recalcula.
      console.warn(`[${etq}] conflicto, Wompi reintentara reference=${reference} restaurante=${restauranteId}`)
      return { tipo: 'conflicto' }
    }
    console.error(`[${etq}] aplicar_pago_aprobado fallo reference=${reference}:`, rpcErr.message)
    return { tipo: 'error' }
  }
  // Otra entrega (o el otro camino) ya escribio factura y plan: ni plan ni correo.
  if (resultado === 'duplicado') {
    await marcarCobroAutomaticoAprobado(admin, transaction, restauranteId, etq)
    return { tipo: 'duplicado' }
  }
  if (resultado !== 'aplicado') {
    console.error(`[${etq}] aplicar_pago_aprobado devolvio un valor inesperado reference=${reference}: ${String(resultado)}`)
    return { tipo: 'error' }
  }
  await marcarCobroAutomaticoAprobado(admin, transaction, restauranteId, etq)

  // Email SOLO con 'aplicado' (quien aplico es quien avisa). No rompe el flujo
  // si falla. El destinatario sale SIEMPRE de NUESTROS datos: restaurante ->
  // usuario_id -> auth.users (via service role). JAMAS de
  // transaction.customer_email: quien paga en el formulario de Wompi puede ser
  // un contador o socio. Si no se resuelve el correo, no se envia (fail-closed).
  let emailDueno: string | undefined
  if (usuarioId) {
    const { data: authData, error: authErr } = await admin.auth.admin.getUserById(usuarioId)
    if (authErr) console.error(`[${etq}] lookup del dueno fallo:`, authErr.message)
    emailDueno = authData?.user?.email ?? undefined
  }
  // Se loguea el RESULTADO, nunca el valor: un no-envio debe ser diagnosticable.
  console.info(
    `[${etq}] destinatario resuelto=${Boolean(emailDueno)} restaurante=${restauranteId}` +
      (usuarioId ? '' : ' (sin usuario_id)')
  )
  if (emailDueno) {
    try {
      // F4.c-5: un COBRO AUTOMATICO no es un cambio de plan y no puede usar el
      // correo de cambio de plan (con plan_nuevo === plan_anterior, cambioPlan
      // diria "Solo cambió la facturación"). Se elige por la FORMA de la
      // referencia, que la emitimos nosotros.
      if (esReferenciaAutomatica(reference)) {
        await notificarRenovacionCobrada({
          to: emailDueno,
          plan,
          periodo,
          monto: precioDe(plan, periodo),
          planExpira,
        })
      } else {
        await notificarPlanActivo({
          to: emailDueno,
          plan,
          periodo,
          planAnterior: planAnterior ?? undefined,
          // Mismo plan + mismo periodo = renovación (la misma regla que extendió
          // plan_expira arriba): correo de renovación, no de cambio de periodo.
          periodoAnterior: (restPrev.periodo_plan as string | null | undefined) ?? null,
          planExpira,
        })
      }
    } catch {
      console.error(`[${etq}] envio de email fallo (plan ya activo)`)
    }
  }

  return { tipo: 'aplicado', plan, periodo, planAnterior, planExpira }
}

// ── Marca de exito del cobro automatico (CIERRE 5b) ──────────────────────
// La UNICA escritura de ultimo_cobro_estado = 'APROBADO'. Va aqui, en el camino
// compartido, porque es el unico sitio que vio el desenlace (webhook, retorno o
// conciliacion). Con 'aplicado' Y con 'duplicado': si el webhook aplico el plan
// pero esta marca fallo, la reentrega o la conciliacion la completan.
// Solo para referencias automaticas: un pago manual no reclamo ningun periodo.
// Desde cualquier estado menos APROBADO: un APPROVED es plata cobrada y gana
// sobre FALLIDO o REVISION. Best-effort: el plan ya quedo bien y un fallo aqui
// no cambia el resultado (la fila queda como estaba y la conciliacion la mira).
// Exportada para la conciliacion (CIERRE 5b): cuando la factura aprobada ya
// existe, la conciliacion completa ESTA misma marca, con el mismo CAS.
export type MarcaAprobado = 'marcado' | 'sin_cambio' | 'error'

export async function marcarCobroAutomaticoAprobado(
  admin: ReturnType<typeof createAdminClient>,
  transaction: Pick<WompiTransaction, 'id' | 'reference'>,
  restauranteId: string,
  etq: string
): Promise<MarcaAprobado> {
  const reference = transaction.reference
  if (typeof reference !== 'string' || !esReferenciaAutomatica(reference)) return 'sin_cambio'
  const periodoFacturado = periodoDeReferenciaAutomatica(reference)
  if (!periodoFacturado) return 'sin_cambio'
  try {
    const { data: marcada, error } = await admin
      .from('fuentes_pago')
      .update({
        ultimo_cobro_estado: 'APROBADO',
        ultimo_cobro_error: null,
        ...(esIdTransaccionValido(transaction.id) ? { ultimo_cobro_tx_id: transaction.id } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('restaurante_id', restauranteId)
      .eq('ultimo_cobro_periodo', periodoFacturado)
      .or(FILTRO_ORIGEN_APROBADO)
      .select('id')
    if (error) {
      console.error(`[${etq}] marca APROBADO no se pudo escribir restaurante=${restauranteId}:`, error.message)
      return 'error'
    }
    if (marcada && marcada.length > 0) {
      console.info(`[${etq}] cobro automatico APROBADO restaurante=${restauranteId} periodo=${periodoFacturado}`)
      return 'marcado'
    }
    return 'sin_cambio'
  } catch {
    console.error(`[${etq}] marca APROBADO lanzo restaurante=${restauranteId}`)
    return 'error'
  }
}
