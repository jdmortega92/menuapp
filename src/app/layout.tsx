import type { Metadata } from 'next'
import './globals.css'
import OnboardingProvider from '@/components/OnboardingProvider'
import { formatoPrecio } from '@/lib/precio'
import { PLANES } from '@/lib/planes'

export const metadata: Metadata = {
  title: 'MenuApp — El menú digital más inteligente de Colombia',
  description: `Crea tu menú digital con QR en 2 minutos. Sin PDF, sin Canva, sin complicaciones. Desde $${formatoPrecio(PLANES.basico.precioMensual)}/mes.`,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body>
        {children}
        <OnboardingProvider />
      </body>
    </html>
  )
}