// ── Reglas puras del ciclo de vida de la suscripcion (F4.b-2) ──
// Deciden QUE le toca a una fila; no tocan DB, red ni reloj: la fecha de "hoy"
// entra por parametro (siempre fechaColombia(), COT). Asi el cron es testeable
// sin mockear tiempo y la regla no puede divergir entre sitios.
//
// Todas las comparaciones son entre strings 'YYYY-MM-DD': ordenarlos
// lexicograficamente ES ordenarlos cronologicamente, y no hay Date de por medio
// que pueda arrastrar el huso del servidor (familia BL.29 — Vercel Cron corre en
// UTC, y entre 00:00 y 04:59 UTC el dia UTC ya es el SIGUIENTE en Colombia).

// Normaliza lo que devuelve Postgres ('2026-08-27' o
// '2026-08-27T00:00:00+00:00') a la fecha calendario 'YYYY-MM-DD'. Devuelve ''
// si no calza o si mes/dia estan fuera de rango: la forma sola no basta,
// '2026-13-01' pasa el regex y compararia como fecha real.
export function fechaCalendario(valor: string | null | undefined): string {
  const ymd = (valor ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ''
  const [, mes, dia] = ymd.split('-').map(Number)
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return ''
  return ymd
}

// Un cambio agendado se aplica cuando SU fecha ya llego: <=, no ==. El cron es
// best-effort (Vercel no reintenta y puede saltarse una corrida), asi que cada
// pasada tiene que barrer TODO lo vencido, no solo lo de hoy.
export function cambioProgramadoVencido(
  fechaCambio: string | null | undefined,
  hoy: string
): boolean {
  const fecha = fechaCalendario(fechaCambio)
  if (!fecha) return false
  return fecha <= hoy
}

// Un plan pago vence cuando su fecha YA PASO: < estricto. El dia del
// vencimiento todavia es del usuario (pago hasta el final de ese dia).
// Sin fecha valida no se expira nada: es preferible dejar un plan de mas que
// quitarle a alguien lo que pago por un dato sucio.
export function debeExpirar(
  plan: string | null | undefined,
  planExpira: string | null | undefined,
  hoy: string
): boolean {
  if (!plan || plan === 'gratis') return false
  const fecha = fechaCalendario(planExpira)
  if (!fecha) return false
  return fecha < hoy
}

// ── Cobro automatico (F4.c-5) ────────────────────────────────────────────
// La regla que decide si a una fila le toca COBRO. No cobra: solo responde
// si/no. Vale la pena releer la regla de arquitectura antes de tocarla: el cron
// SOLO INICIA el cobro y el webhook otorga el plan (F4.c-2/Q2), asi que un
// "true" de mas aqui es plata del usuario, no un bug de estado.

/** Cuantos dias ANTES de plan_expira se intenta el cobro.
 *
 *  N=3, y el numero importa por tres razones distintas:
 *  1. COLCHON DE FALLO. Si el cobro se cae, al usuario le quedan 3 dias de plan
 *     VIVO para recibir el correo y pagar a mano antes de que el barrido de
 *     expiracion lo baje a gratis. Cobrar el mismo dia del vencimiento no deja
 *     margen: un fallo = plan caido sin aviso util.
 *  2. VENTANA, NO UN DIA. Vercel Cron es best-effort (puede saltarse una
 *     corrida), asi que la elegibilidad tiene que durar varios dias o una
 *     corrida perdida se traduce en una renovacion perdida. Con N=3 hay tres
 *     oportunidades; el latch por periodo (ultimo_cobro_periodo) garantiza que
 *     solo UNA de las tres cobre.
 *  3. TAN CORTO COMO SE PUEDA. Cada dia de anticipacion es un dia mas en que una
 *     cancelacion llega tarde. 3 es el minimo que cumple 1 y 2.
 *  Cobrar antes NO le quema dias a nadie: el webhook renueva EXTENDIENDO desde
 *  plan_expira, no desde hoy (F4.b-1, bug B). */
export const DIAS_ANTES_DE_COBRAR = 3

/** Resta dias a una fecha calendario 'YYYY-MM-DD'. Devuelve '' si la entrada no
 *  es una fecha usable.
 *
 *  Usa Date.UTC solo como ARITMETICA de calendario (maneja solo el desborde de
 *  mes y de anio), igual que el clamp de fin de mes de calcularPlanExpira: los
 *  tres componentes entran explicitos y se leen con getUTC*, asi que ni el huso
 *  del servidor ni su reloj participan. La prohibicion de esta familia de reglas
 *  es el RELOJ del servidor, no el objeto Date como calculadora. */
export function restarDias(valor: string | null | undefined, dias: number): string {
  const fecha = fechaCalendario(valor)
  if (!fecha) return ''
  const [y, m, d] = fecha.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d - dias))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** La fuente de pago del restaurante, en la forma minima que la regla necesita.
 *  null = no hay fuente viva. */
export interface FuenteCobrable {
  estado?: string | null
  predeterminada?: boolean | null
  wompi_payment_source_id?: number | null
  /** Latch POR PERIODO: el plan_expira que se estaba pagando en el ultimo
   *  intento. Espejo local del 422 "La referencia ya ha sido usada" de Wompi. */
  ultimo_cobro_periodo?: string | null
}

/** La fila de restaurantes, en la forma minima que la regla necesita. */
export interface FilaCobro {
  plan?: string | null
  periodo_plan?: string | null
  plan_expira?: string | null
  cobro_automatico?: boolean | null
  plan_programado?: string | null
  fuente?: FuenteCobrable | null
}

const PLANES_COBRABLES = new Set(['basico', 'pro'])
const PERIODOS_COBRABLES = new Set(['mensual', 'anual'])

/** true SOLO si a esta fila le toca cobro automatico hoy. Fail-closed en todas
 *  las ramas: ante cualquier duda NO se cobra y el usuario cae a la renovacion
 *  manual, que es el lado barato de equivocarse.
 *
 *  Las siete condiciones, y por que cada una existe:
 *  1. OPT-IN EXPLICITO. cobro_automatico===true, nunca "tiene fuente guardada":
 *     guardar el metodo y autorizar el cobro son dos decisiones distintas
 *     (F4.c-3). Un undefined de una fila vieja NO es un si.
 *  2. PLAN COBRABLE. basico o pro, no "distinto de gratis": el monto sale de
 *     centavosDe(plan, periodo) y un plan desconocido se tarificaria en silencio.
 *  3. PERIODO COBRABLE. Misma razon: periodo_plan es texto libre en la DB y
 *     cualquier valor raro se cobraria como mensual.
 *  4. SIN CAMBIO AGENDADO. Quien cancelo NO SE COBRA, jamas. Hoy el orden de
 *     barridos (cambios agendados ANTES del cobro) ya lo evitaria, pero ese
 *     orden es una propiedad del llamador y una edicion futura puede invertirlo
 *     sin saber lo que rompe (era el riesgo #4 de F4.c-1). Aqui queda FIJADO en
 *     la regla, que es lo unico que no depende de en que orden se llame.
 *  5. FUENTE COBRABLE. AVAILABLE + predeterminada + con id numerico de Wompi.
 *     PENDING/ERROR/VOIDED no cobran: no hay contra que cobrar.
 *  6. VENTANA. plan_expira valido y hoy dentro de [plan_expira-N, plan_expira].
 *     El extremo superior es la ultima oportunidad si Vercel se salto corridas;
 *     por debajo del inferior todavia es demasiado pronto.
 *  7. LATCH POR PERIODO. Si ya se intento el cobro de ESTE plan_expira, no se
 *     vuelve a intentar: sin reintentos silenciosos (F4-DECISIONES). El latch se
 *     suelta solo cuando el webhook mueve plan_expira, o sea cuando el cobro de
 *     verdad prospero. */
export function debeCobrarse(fila: FilaCobro, hoy: string): boolean {
  if (fila.cobro_automatico !== true) return false
  if (!fila.plan || !PLANES_COBRABLES.has(fila.plan)) return false
  if (!fila.periodo_plan || !PERIODOS_COBRABLES.has(fila.periodo_plan)) return false
  if (fila.plan_programado) return false

  const fuente = fila.fuente
  if (!fuente) return false
  if (fuente.estado !== 'AVAILABLE') return false
  if (fuente.predeterminada !== true) return false
  if (typeof fuente.wompi_payment_source_id !== 'number') return false

  const expira = fechaCalendario(fila.plan_expira)
  if (!expira) return false
  if (hoy > expira) return false
  const desde = restarDias(expira, DIAS_ANTES_DE_COBRAR)
  if (!desde || hoy < desde) return false

  // El latch guarda el plan_expira del intento anterior: se compara contra la
  // fecha CALENDARIO por si Postgres devolvio un timestamptz.
  if (fechaCalendario(fuente.ultimo_cobro_periodo) === expira) return false

  return true
}

// ── Guarda de ENCENDIDO del opt-in (F4.c-5) ──────────────────────────────
// La regla que decide si una fila puede ARMAR cobro_automatico. Vive aqui, y no
// suelta dentro de la ruta, por la misma razon que debeCobrarse: es una regla
// sobre plata, y una regla sobre plata tiene que ser probable sin levantar
// Supabase ni Next. La ruta la aplica; nadie mas decide esto por su cuenta.
//
// SOLO GOBIERNA EL ENCENDIDO. Apagar NUNCA se consulta ni se bloquea: salir
// tiene que ser mas facil que entrar, y una fila que ya quedo en un estado
// contradictorio tiene que poder apagarse SIEMPRE.

/** La fila de restaurantes en la forma minima que necesita la guarda. */
export interface FilaActivacion {
  plan?: string | null
  /** Cancelacion o bajada YA AGENDADA (F4.b-1). Truthy = pendiente. */
  plan_programado?: string | null
  /** Hay una fuente AVAILABLE + predeterminada contra la cual cobrar. */
  hayFuente: boolean
}

/** Por que NO se puede encender. null = se puede. */
export type BloqueoActivacion = 'sin_fuente' | 'plan_no_cobrable' | 'cancelacion_pendiente'

/** El motivo por el que esta fila no puede armar el cobro automatico, o null si
 *  puede. Fail-closed: ante un dato ausente o raro NO se arma.
 *
 *  1. SIN FUENTE. Encender sin nada contra que cobrar deja un opt-in verdadero
 *     que el cron nunca podra ejecutar, y la UI diciendo "Se renueva el X".
 *  2. PLAN NO COBRABLE. Se exige la MISMA lista cerrada que usa debeCobrarse, no
 *     "distinto de gratis": armar un plan que la regla del cron va a rechazar es
 *     prometer una renovacion que no va a ocurrir.
 *  3. CANCELACION PENDIENTE — el que produjo la fila contradictoria en
 *     produccion (cobro_automatico=true junto a plan_programado='gratis'). Ojo
 *     con el campo: durante una cancelacion agendada, plan SIGUE siendo el plan
 *     pago (esa es toda la idea de F4.b-1, el usuario conserva lo que pago), asi
 *     que mirar plan NO ve la cancelacion. La cancelacion vive en
 *     plan_programado y solo ahi.
 *
 *     Y se RECHAZA, no se reinterpreta: encender la renovacion NO es deshacer una
 *     cancelacion. Tratarlo como reactivacion implicita revertiria un "para" del
 *     usuario a cambio de que tocara otro control — exactamente el movimiento
 *     que no se hace con plata ajena. Deshacer la cancelacion es Reactivar, que
 *     es un boton propio y explicito (/suscripcion). */
export function bloqueoDeActivacion(fila: FilaActivacion): BloqueoActivacion | null {
  if (!fila.hayFuente) return 'sin_fuente'
  if (!fila.plan || !PLANES_COBRABLES.has(fila.plan)) return 'plan_no_cobrable'
  if (fila.plan_programado) return 'cancelacion_pendiente'
  return null
}
