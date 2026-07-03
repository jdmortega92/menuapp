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
 *  webhook de Wompi (F4.a-2); el dueño solo lee las suyas (RLS select). */
export interface Factura {
  id: string
  restaurante_id: string
  wompi_transaction_id: string | null
  referencia: string
  plan: string
  periodo: string
  monto_centavos: number
  estado: 'pendiente' | 'aprobada' | 'rechazada' | 'anulada'
  creada_en: string
  pagada_en: string | null
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