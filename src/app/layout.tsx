import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MenuApp — El menú digital más inteligente de Colombia',
  description:
    'Crea tu menú digital con QR en 2 minutos. Sin PDF, sin Canva, sin complicaciones. Desde $15.000/mes.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}