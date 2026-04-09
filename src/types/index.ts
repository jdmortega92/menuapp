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
  plan_expira: string
  idioma: string
  color_principal: string
  tema: 'claro' | 'oscuro' | 'natural' | 'premium'
  created_at: string
  periodo_plan?: string
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
  horario_inicio?: string
  horario_fin?: string
  visible: boolean
  created_at: string
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
}

export interface ComboPlato {
  id: string
  combo_id: string
  plato_id: string
}

export type TipoPromo = 'dos_por_uno' | 'descuento' | 'precio_especial' | 'gratis'

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
}

export type DiaSemana = 'lun' | 'mar' | 'mie' | 'jue' | 'vie' | 'sab' | 'dom'

export interface PlatoDelDia {
  id: string
  restaurante_id: string
  plato_id: string
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
  menu_por_horario_activo: boolean
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

export interface Factura {
  id: string
  restaurante_id: string
  numero: string
  monto: number
  estado: 'pagada' | 'pendiente' | 'fallida'
  metodo_pago: 'nequi' | 'pse' | 'tarjeta'
  periodo_mes: number
  periodo_ano: number
  fecha_pago: string
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