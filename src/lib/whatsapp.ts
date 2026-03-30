import { ItemPedido, Restaurante } from '@/types'

export function generarMensajePedido(
  restaurante: Restaurante,
  items: ItemPedido[],
  nota?: string
): string {
  const lineas = items.map(
    (item) =>
      `- ${item.cantidad} ${item.plato.nombre} $${item.plato.precio.toLocaleString('es-CO')}`
  )

  const total = items.reduce(
    (sum, item) => sum + item.plato.precio * item.cantidad,
    0
  )

  let mensaje = `Hola! Vi tu menú en ${restaurante.nombre} y quiero pedir:\n`
  mensaje += lineas.join('\n')
  if (nota) {
    mensaje += `\nNota: ${nota}`
  }
  mensaje += `\nTotal: $${total.toLocaleString('es-CO')}`

  return mensaje
}

export function generarEnlaceWhatsApp(whatsapp: string, mensaje: string): string {
  const numero = whatsapp.replace(/[\s\-\(\)]/g, '')
  const numeroCompleto = numero.startsWith('57') ? numero : `57${numero}`
  return `https://wa.me/${numeroCompleto}?text=${encodeURIComponent(mensaje)}`
}

export function abrirWhatsApp(
  restaurante: Restaurante,
  items: ItemPedido[],
  nota?: string
) {
  const mensaje = generarMensajePedido(restaurante, items, nota)
  const url = generarEnlaceWhatsApp(restaurante.whatsapp, mensaje)
  window.open(url, '_blank')
}