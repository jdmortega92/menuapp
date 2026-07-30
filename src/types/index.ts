/* ============================================
   MENUAPP — TIPOS DE DATOS
   Todos los modelos de la aplicación
   ============================================ */

export type Plan = 'gratis' | 'basico' | 'pro'

export interface Usuario {
  id: string
  email: string
  nombre: string
  created_at: string
}

export interface Restaurante {
  id: string
  usuario_id: string
  nombre: string
  tipo: TipoNegocio
  ciudad: string
  whatsapp: string
  direccion?: string
  logo_url?: string
  foto_portada_url?: string
  descripcion?: string
  slug: string
  plan: Plan
  /** Latch one-way (STRATEGIC.2): true si la cuenta ALGUNA VEZ estuvo en un plan
   *  pago. Gobierna la regla de fotos del plan gratis (lib/fotosGate). Opcional
   *  porque los inserts de registro no lo escriben (default/backfill de la DB);
   *  ausente == nunca-pago para todos los consumidores (chequeos falsy). */
  fue_pago?: boolean
  /** Fin del ciclo pagado. Hoy NADIE la escribe (null en toda fila existente);
   *  el webhook de Wompi (F4.a-2) será su primer escritor. */
  plan_expira: string | null
  /** Cambio de plan DIFERIDO al fin del ciclo pagado (F4.b-1). Cancelar un plan
   *  pago con tiempo restante NO baja el plan: agenda el cambio aquí y deja
   *  plan/periodo_plan intactos hasta la fecha. Las escribe /suscripcion; el pago
   *  aprobado (webhook de Wompi) las LIMPIA — quien paga no se está bajando.
   *  Opcionales: columnas nuevas, las filas viejas llegan sin ellas. */
  plan_programado?: string | null
  fecha_cambio_programado?: string | null
  /** Opt-in EXPLICITO al cobro recurrente (F4.c-3). Local: no existe en Wompi.
   *  NO se deriva de "tiene una fuente de pago guardada" — guardar la tarjeta y
   *  autorizar que te cobren son dos decisiones distintas, y el usuario debe
   *  poder apagar la renovacion conservando el metodo. Lo lee el cron (F4.c-5).
   *  Opcional: columna nueva con default false; ausente == sin cobro automatico. */
  cobro_automatico?: boolean
  /** Cuando el usuario activo el cobro automatico. Local. Null si nunca lo activo. */
  cobro_automatico_desde?: string | null
  idioma: string
  color_principal: string
  tema: 'claro' | 'oscuro' | 'natural' | 'premium'
  created_at: string
  periodo_plan?: string
  codigo_referido?: string

  // ===== Onboarding =====
  /** Si el usuario cerró manualmente el widget de onboarding (no vuelve a aparecer) */
  onboarding_cerrado?: boolean
  /** Si el usuario ya visitó la página de QR al menos una vez */
  qr_generado?: boolean
    /** Si el usuario ya compartió/copió/descargó su menú al menos una vez */
  menu_compartido?: boolean
}

export type TipoNegocio =
  | 'restaurante'
  | 'cafeteria'
  | 'panaderia'
  | 'bar'
  | 'comida_rapida'
  | 'heladeria'
  | 'food_truck'
  | 'otro'

export interface Categoria {
  id: string
  restaurante_id: string
  nombre: string
  orden: number
  hora_inicio?: string
  hora_fin?: string
  visible: boolean
  created_at: string
}

export interface Variante {
  id: string
  plato_id: string
  nombre: string
  precio: number
  orden: number
  created_at: string
  updated_at: string
}

export interface Plato {
  id: string
  categoria_id: string
  restaurante_id: string
  nombre: string
  descripcion?: string
  precio: number
  precio_anterior?: number
  foto_url?: string
  disponible: boolean
  orden: number
  created_at: string
  updated_at?: string
  variantes?: Variante[]
}

export interface Combo {
  id: string
  restaurante_id: string
  nombre: string
  descripcion?: string
  precio: number
  precio_individual: number
  activo: boolean
  created_at: string
  // ───── New fields (optional, default null in DB) ─────
  dias?: DiaSemana[]
  horario_inicio?: string
  horario_fin?: string
}

// F8.5a — raw shape produced by useCombos (hook has no plato_variantes data).
// precioBase is the plato's sentinel price; consumers resolve variante info.
export interface ComboPlatoRaw {
  plato_id: string
  variante_id: string | null
  nombre: string       // plato's nombre
  precioBase: number   // plato.precio (sentinel)
}

// F8.5a — enriched shape used at display time (after the consumer resolves
// variante name + price from in-memory todosLosPlatos).
export interface ComboPlatoEnriquecido {
  plato_id: string
  variante_id: string | null
  nombre: string                  // plato's nombre
  varianteNombre: string | null   // variante's nombre (null if no variante)
  precioEfectivo: number          // variante.precio if variante_id set, else plato.precio
}

export interface ComboPlato {
  id: string
  combo_id: string
  plato_id: string
  variante_id?: string | null  // F8.1: nullable FK to plato_variantes
  platos?: { nombre: string; precio: number }
}

export type TipoPromo = 'dos_por_uno' | 'descuento'

export interface Promo {
  id: string
  restaurante_id: string
  nombre: string
  tipo: TipoPromo
  valor?: number
  dias: DiaSemana[]
  horario_inicio?: string
  horario_fin?: string
  fecha_limite?: string
  activo: boolean
  created_at: string
}

export interface PromoPlato {
  id: string
  promo_id: string
  plato_id: string
  variante_id?: string | null  // nullable FK to plato_variantes (NULL = aplica a todas las variantes)
}

export type DiaSemana = 'lun' | 'mar' | 'mie' | 'jue' | 'vie' | 'sab' | 'dom'

export interface PlatoDelDia {
  id: string
  restaurante_id: string
  plato_id: string
  variante_id?: string | null
  precio_especial: number
  horario_inicio: string
  horario_fin: string
  activo: boolean
  fecha: string
  created_at: string
}

export interface PlatoGanador {
  id: string
  restaurante_id: string
  plato_id: string
  variante_id?: string | null
  reconocimiento: string
  descripcion?: string
  activo: boolean
  created_at: string
}

export interface Calificacion {
  id: string
  plato_id: string
  restaurante_id: string
  estrellas: 1 | 2 | 3 | 4 | 5
  tags: TagCalificacion[]
  comentario?: string
  foto_url?: string
  created_at: string
}

export type TagCalificacion =
  | 'buena_porcion'
  | 'buen_sabor'
  | 'buena_presentacion'
  | 'buen_precio'
  | 'rapido'
  | 'fresco'

export interface Escaneo {
  id: string
  restaurante_id: string
  origen: 'qr_mesa' | 'enlace_web'
  mesa?: string
  fecha: string
  created_at: string
}

export interface VistaPlato {
  id: string
  plato_id: string
  restaurante_id: string
  fecha: string
  created_at: string
}

export interface PedidoWhatsapp {
  id: string
  restaurante_id: string
  productos: ProductoPedido[]
  total: number
  nota?: string
  fecha: string
  created_at: string
}

export interface ProductoPedido {
  plato_id: string
  nombre: string
  cantidad: number
  precio: number
}

export interface ConfigRestaurante {
  restaurante_id: string
  whatsapp_activo: boolean
  combos_activo: boolean
  promos_activo: boolean
  plato_dia_activo: boolean
  plato_ganador_activo: boolean
  calificaciones_activo: boolean
  sorprendeme_activo: boolean
}

export interface Referido {
  id: string
  restaurante_origen_id: string
  restaurante_invitado_id?: string
  nombre_invitado?: string
  estado: 'pendiente' | 'activo' | 'expirado'
  mes_gratis_aplicado: boolean
  created_at: string
}

/** Fila de la tabla facturas (F4.a-1). La escribe SOLO el service role via
 *  webhook de Wompi (F4.a-2); el dueño solo lee las suyas (RLS select).
 *  Columnas espejadas de la tabla REAL (verificadas contra prod): el tipo
 *  anterior usaba nombres legacy (creada_en/monto_centavos/...) que nunca
 *  existieron en la base y causaban 400 al ordenar. */
export interface Factura {
  id: string
  restaurante_id: string
  numero: string
  monto: number
  metodo_pago: string
  periodo_mes: number
  periodo_ano: number
  fecha_pago: string | null
  estado: 'pendiente' | 'aprobada' | 'rechazada' | 'anulada'
  created_at: string
}

export interface DatosFacturacion {
  restaurante_id: string
  nombre_fiscal: string
  nit?: string
  direccion_fiscal?: string
}

export interface Suscripcion {
  id: string
  restaurante_id: string
  plan: Plan
  periodo: 'mensual' | 'anual'
  metodo_pago: 'nequi' | 'pse' | 'tarjeta'
  fecha_inicio: string
  fecha_renovacion: string
  credito_referidos: number
  activa: boolean
}

/* ============================================
   FUENTES DE PAGO TOKENIZADAS (F4.c-3)
   Cobro recurrente. Ver ROADMAP-FIXES.md F4.c-1 (anatomia) y F4.c-2 (spike).
   Estas dos tablas las escribe SOLO el service role: el enrolamiento es 100%
   server-side porque POST y GET /v1/payment_sources exigen la llave PRIVADA
   (F4.c-2/Q1) — el navegador no puede ni crear la fuente en Wompi.
   ============================================ */

/** Tipos de fuente que Wompi permite GUARDAR como payment source. Los cuatro
 *  son almacenables (confirmado en el spike); hoy solo CARD y NEQUI tienen
 *  codigo de enrolamiento (F4.c-4 y F4.c-6). PSE y SU_PLUS no entran: no son
 *  tokenizables (PSE autoriza cada transaccion en el portal del banco). */
export type TipoFuentePago = 'CARD' | 'NEQUI' | 'DAVIPLATA' | 'BANCOLOMBIA_TRANSFER'

/** PENDING / AVAILABLE / ERROR espejan data.status de Wompi.
 *  VOIDED NO ESPEJA NADA: es un estado LOCAL nuestro. No existe endpoint para
 *  revocar una fuente normal (PUT .../void devuelve 422: solo aplica a fuentes
 *  PREAUTHORIZATION). VOIDED significa "DEJAMOS de cobrar contra esta fuente";
 *  la fuente SIGUE VIVA en Wompi y no hay forma de pedirle que la olvide. */
export type EstadoFuentePago = 'PENDING' | 'AVAILABLE' | 'ERROR' | 'VOIDED'

/** Fila de la tabla fuentes_pago. El dueno solo LEE las suyas (RLS select);
 *  no hay policies de escritura para authenticated, a proposito. */
export interface FuentePago {
  id: string
  restaurante_id: string
  /** data.id de POST /v1/payment_sources. Es un NUMERO en Wompi (ej. 357352),
   *  bigint en la DB. No es un string por mas que parezca un identificador. */
  wompi_payment_source_id: number
  /** data.type de la fuente de pago. */
  tipo: TipoFuentePago
  /** data.status de Wompi, salvo VOIDED que es nuestro. Ver EstadoFuentePago. */
  estado: EstadoFuentePago
  /** Local. La fuente que usara el cron de cobro (F4.c-5). Maximo una por
   *  restaurante (indice unico parcial en la DB). */
  predeterminada: boolean

  // ----- Display CARD -----
  /** VISA / MASTERCARD. ORIGEN UNICO: la respuesta de POST /v1/tokens/cards.
   *  public_data de la fuente NO trae brand y el GET de la fuente tampoco: se
   *  captura al TOKENIZAR o se pierde para siempre (solo reaparece en
   *  payment_method.extra de una transaccion ya cobrada). */
  marca: string | null
  /** public_data.last_four. Texto, no entero. */
  last_four: string | null
  /** public_data.bin. */
  bin: string | null
  /** public_data.card_holder. */
  titular: string | null
  /** exp_month de la tokenizacion, VERBATIM. La doc de Wompi los muestra
   *  transpuestos; el API responde bien. No se normaliza aqui: el spike no
   *  registro si el ano llega como "29" o "2029". */
  exp_mes: string | null
  /** exp_year de la tokenizacion, VERBATIM. Ver exp_mes. */
  exp_ano: string | null

  // ----- Display NEQUI -----
  /** Solo NEQUI. public_data devuelve phone Y phone_number duplicados y no trae
   *  "name"; se lee phone_number y se ENMASCARA antes de guardar (ej. ***1111).
   *  El numero completo no se persiste: Wompi ya lo tiene, nosotros solo pintamos. */
  telefono_enmascarado: string | null

  /** public_data.validity_ends_at de la FUENTE (~6 anos). NO confundir con el
   *  validity_ends_at del TOKEN de tarjeta, que dura ~2 dias. */
  vigencia_hasta: string | null
  /** Local. Cuando dejamos de cobrar contra esta fuente. Campo OPERATIVO (lo
   *  leen cron y UI); la evidencia formal es la fila REVOCADO de la bitacora. */
  revocada_en: string | null
  /** Local, texto libre en la DB. Convencion: usuario_solicito / cuenta_eliminada
   *  / fuente_fallida / plan_cancelado. */
  motivo_revocacion: string | null
  created_at: string
  updated_at: string
}

export type EventoConsentimiento = 'OTORGADO' | 'REVOCADO'

/** Fila de consentimientos_pago: bitacora APPEND-ONLY (trigger que bloquea
 *  UPDATE) del consentimiento de cobro recurrente. Existe porque NO podemos
 *  demostrar que Wompi olvido una fuente — lo unico evidenciable es nuestra
 *  propia conducta: que el usuario acepto, y que dejamos de cobrar. */
export interface ConsentimientoPago {
  id: string
  restaurante_id: string
  /** Null A PROPOSITO: el consentimiento se captura ANTES de que exista la
   *  fuente y la ventana es de 1 HORA (el token END_USER_POLICY expira a los
   *  3601s). Si el 3DS se alarga, la fila queda huerfana y ESO es el registro
   *  de que hubo que re-pedirlo. */
  fuente_pago_id: string | null
  evento: EventoConsentimiento
  /** claim contract_id del JWT END_USER_POLICY (472 en el spike). */
  politica_contract_id: number | null
  /** claim file_hash. Fija QUE texto acepto el usuario: el permalink apunta a un
   *  PDF que Wompi puede cambiar. */
  politica_file_hash: string | null
  /** PERMALINK del reglamento, NO el JWT. El JWT es de UN SOLO USO y expira en 1
   *  hora: guardado no prueba nada. Valor real capturado en el spike:
   *  https://wompi.com/assets/downloadble/reglamento-Usuarios-Colombia.pdf */
  politica_permalink: string | null
  /** claim contract_id del JWT PERSONAL_DATA_AUTH (439 en el spike). */
  datos_contract_id: number | null
  /** claim file_hash del PERSONAL_DATA_AUTH. Ver politica_file_hash. */
  datos_file_hash: string | null
  /** PERMALINK de la autorizacion de datos, NO el JWT. Ese token no trae claim
   *  exp (no caduca por tiempo) pero SIGUE siendo de un solo uso. Valor real:
   *  https://wompi.com/assets/downloadble/autorizacion-tratamiento-datos-personales.pdf */
  datos_permalink: string | null
  /** Solo para REVOCADO: por que dejamos de cobrar. */
  motivo: string | null
  ip: string | null
  user_agent: string | null
  created_at: string
}

export interface ItemPedido {
  plato: Plato
  cantidad: number
}

export interface Pedido {
  items: ItemPedido[]
  nota: string
  total: number
  restaurante: Restaurante
  origen: 'qr_mesa' | 'enlace_web'
  mesa?: string
}