import { PUBLIC_BASE_URL } from '@/lib/urls'
import { envolverHtml, escaparHtml } from './base'

export interface EmailRenderizado {
  subject: string
  html: string
  text: string
}

// Correo de bienvenida al crear el restaurante (F3). Copy corto y cálido:
// saluda por nombre, 3 pasos rápidos y CTA al editor de menú.
export function bienvenida(nombreRestaurante: string): EmailRenderizado {
  const nombre = escaparHtml(nombreRestaurante)
  const urlMenu = `${PUBLIC_BASE_URL}/menu`

  const html = envolverHtml(`
          <h1 style="font-size:20px;color:#2A2523;margin:0 0 12px;">¡Bienvenido, ${nombre}!</h1>
          <p style="font-size:14px;line-height:1.6;color:#2A2523;margin:0 0 20px;">
            Tu cuenta en MenuApp ya está lista. En unos minutos puedes tener tu menú digital funcionando:
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="font-size:14px;line-height:1.9;color:#2A2523;">
              <span style="color:#E85D24;font-weight:bold;">1.</span> Crea tu menú con tus platos y precios<br>
              <span style="color:#E85D24;font-weight:bold;">2.</span> Genera tu código QR<br>
              <span style="color:#E85D24;font-weight:bold;">3.</span> Compártelo con tus clientes
            </td></tr>
          </table>
          <a href="${urlMenu}" style="display:inline-block;background-color:#E85D24;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:8px;">Crear mi menú</a>
  `)

  const text = [
    `¡Bienvenido, ${nombreRestaurante}!`,
    '',
    'Tu cuenta en MenuApp ya está lista. En unos minutos puedes tener tu menú digital funcionando:',
    '',
    '1. Crea tu menú con tus platos y precios',
    '2. Genera tu código QR',
    '3. Compártelo con tus clientes',
    '',
    `Crea tu menú aquí: ${urlMenu}`,
  ].join('\n')

  return {
    subject: `¡Bienvenido a MenuApp, ${nombreRestaurante}!`,
    html,
    text,
  }
}
