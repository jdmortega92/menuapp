// Id de sesión por-visita (por pestaña): se crea una vez y se cachea en
// sessionStorage; sobrevive re-renders y navegación dentro de la pestaña, y
// muere al cerrarla → nueva visita/re-escaneo = nueva sesión. Lo comparten los
// tres inserts de logging (visitas_menu, vistas_platos, pedidos_whatsapp) para
// permitir un embudo real por sesión. Solo se llama en effects / callbacks
// (cliente, post-hidratación), nunca en render.
export function getSessionId(): string {
  if (typeof window === 'undefined') return '' // SSR guard — nunca tocar sessionStorage en el server
  const KEY = 'menuapp_session_id'
  let id = window.sessionStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    window.sessionStorage.setItem(KEY, id)
  }
  return id
}

// Guard de visita única por sesión y por restaurante (BL.34). Scope por
// restaurante para que escanear un segundo menú en la misma pestaña sí loguee
// su visita. INVARIANTE: marcarVisitaLogueada debe llamarse ANTES de disparar
// el insert (StrictMode re-dispara el efecto back-to-back; un flag post-insert
// no previene el segundo insert).
const VISITA_KEY_PREFIX = 'menuapp_visita_logged_'

export function visitaYaLogueada(restauranteId: string): boolean {
  if (typeof window === 'undefined') return false
  return !!window.sessionStorage.getItem(VISITA_KEY_PREFIX + restauranteId)
}

export function marcarVisitaLogueada(restauranteId: string): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(VISITA_KEY_PREFIX + restauranteId, '1')
}
