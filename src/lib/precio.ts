// Helper: formatea precios de forma segura (evita crashes si viene null/undefined)
export function formatoPrecio(valor: number | null | undefined): string {
  return (valor ?? 0).toLocaleString('es-CO')
}
