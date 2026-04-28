'use client'

import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks'
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus'
import OnboardingChecklist from '@/components/OnboardingChecklist'

/**
 * Rutas privadas donde el widget de onboarding debe aparecer.
 * Se muestra solo en estas rutas, no en las públicas (login, registro, menú público).
 */
const RUTAS_PRIVADAS = [
  '/dashboard',
  '/menu',
  '/qr',
  '/config',
  '/suscripcion',
  '/referidos',
  '/facturas',
]

/**
 * Provider del widget de onboarding.
 *
 * Renderiza el OnboardingChecklist en todas las rutas privadas (dashboard, menu,
 * qr, config, etc.), permitiendo al usuario seguir el flujo del checklist sin
 * tener que volver siempre al dashboard.
 *
 * El widget se actualiza automáticamente vía Supabase Realtime: cualquier
 * INSERT/UPDATE/DELETE en las tablas relevantes (categorias, platos, horarios,
 * visitas_menu, restaurantes) dispara un re-cálculo en tiempo real.
 *
 * No renderiza nada si:
 * - El usuario no está autenticado (no hay restaurante)
 * - La ruta actual no es privada (login, registro, menú público)
 */
export default function OnboardingProvider() {
  const pathname = usePathname()
  const { restaurante: rest } = useAuth()
  const onboardingStatus = useOnboardingStatus(rest)

  

  // Solo mostrar en rutas privadas
  const esRutaPrivada = RUTAS_PRIVADAS.some(ruta => pathname?.startsWith(ruta))
  if (!esRutaPrivada) {
   
    return null
  }

  // No mostrar si no hay restaurante autenticado
  if (!rest) {
    
    return null
  }

  
  return <OnboardingChecklist status={onboardingStatus} />
}