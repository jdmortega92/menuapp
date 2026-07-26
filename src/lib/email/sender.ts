import { Resend } from 'resend'

// Remitente de todos los correos transaccionales. Dominio menuapp.com.co
// verificado en Resend (2026-07-26): ya entrega a cualquier destinatario.
// Cambiar SOLO aqui (mismo patron que PUBLIC_BASE_URL en lib/urls.ts).
export const EMAIL_FROM = 'MenuApp <no-reply@menuapp.com.co>'

interface EnviarEmailParams {
  to: string
  subject: string
  html: string
  text: string
}

// Solo servidor: RESEND_API_KEY no lleva prefijo NEXT_PUBLIC_ a propósito.
// El cliente se crea dentro de la función para que un build sin la
// variable no falle al importar el módulo.
export async function enviarEmail({ to, subject, html, text }: EnviarEmailParams) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  return resend.emails.send({ from: EMAIL_FROM, to, subject, html, text })
}
