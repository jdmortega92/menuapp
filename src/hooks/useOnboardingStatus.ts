'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import type { Restaurante } from '@/types'

/**
 * Representa un paso del checklist de onboarding.
 */
export interface OnboardingPaso {
  /** Identificador único del paso */
  id: string
  /** Título corto del paso (visible en el widget) */
  titulo: string
  /** Descripción complementaria */
  descripcion: string
  /** Ruta a la que navegar al hacer click en el paso */
  href: string
  /** Si el paso ya está completado */
  completado: boolean
}

/**
 * Estado completo del onboarding.
 */
export interface OnboardingStatus {
  /** Lista ordenada de los pasos con su estado de completitud */
  pasos: OnboardingPaso[]
  /** Cantidad de pasos completados */
  totalCompletados: number
  /** Cantidad total de pasos (6 para Gratis, 7 para Básico/Pro) */
  totalPasos: number
  /** Porcentaje de progreso (0-100) */
  porcentaje: number
  /** Si el usuario cerró manualmente el widget */
  cerrado: boolean
  /** Si el widget debe mostrarse */
  mostrar: boolean
  /** Si todavía está cargando datos iniciales */
  cargando: boolean
  /** Cierra el widget permanentemente (persiste en Supabase) */
  cerrarWidget: () => Promise<void>
}

// El total de pasos depende del plan: Gratis no incluye logo (6 pasos), Básico/Pro sí (7 pasos)
const TOTAL_PASOS_GRATIS = 6
const TOTAL_PASOS_PAGO = 7

/**
 * Estado interno del restaurante que el hook mantiene actualizado vía Realtime.
 *
 * Algunos campos (como qr_generado, onboarding_cerrado) pueden cambiar después
 * del primer render sin que useAuth() lo refleje. Por eso mantenemos copias
 * locales que se actualizan cuando Supabase notifica cambios.
 */
interface CamposRestauranteRealtime {
  qr_generado: boolean
  onboarding_cerrado: boolean
  logo_url: string | null
  nombre: string
  ciudad: string
  whatsapp: string
}

/**
 * Hook que detecta automáticamente el estado del onboarding del restaurante.
 *
 * Estrategia de actualización profesional con Supabase Realtime:
 * - Carga inicial al montar el componente
 * - Suscripción en tiempo real a cambios en las tablas relevantes
 *   (categorias, platos, horarios, visitas_menu, restaurantes)
 * - Cualquier INSERT/UPDATE/DELETE dispara un re-cálculo automático
 *
 * Esto significa que el widget refleja el estado actual de la base de datos
 * con latencia <100ms, sin necesidad de polling, refresh-on-navigate, o
 * notificaciones manuales desde cada página.
 *
 * @param restaurante Restaurante actual (puede ser null durante carga inicial)
 * @returns Estado completo del onboarding y función para cerrarlo
 */
export function useOnboardingStatus(
  restaurante: Restaurante | null,
  // pathname se mantiene como parámetro opcional por retrocompatibilidad,
  // pero ya no se usa internamente porque Realtime lo reemplaza
  _pathname?: string
): OnboardingStatus {
  const [pasos, setPasos] = useState<OnboardingPaso[]>([])
  const [cargando, setCargando] = useState(true)

  // Mantenemos copias locales de campos del restaurante que pueden cambiar
  // después del montaje inicial (ej: qr_generado se actualiza al visitar /qr)
  const [camposRest, setCamposRest] = useState<CamposRestauranteRealtime | null>(null)

  // Ref para evitar llamadas concurrentes a detectarPasos
  const detectandoRef = useRef(false)

  /**
   * Detecta el estado de cada paso consultando las tablas de Supabase.
   * Se llama en el montaje inicial y cada vez que Realtime notifica cambios.
   */
  const detectarPasos = useCallback(async (restId: string) => {
   
    if (detectandoRef.current) {
      
      return
    }
    detectandoRef.current = true

    try {
      const supabase = createClient()

      // Detección en paralelo: 5 queries independientes que corren juntas
      // Incluimos una query al restaurante para tener datos frescos de qr_generado, etc.
      const [
        restauranteRes,
        categoriasRes,
        platosRes,
        horariosRes,
        visitasRes,
      ] = await Promise.all([
        supabase
          .from('restaurantes')
          .select('nombre, ciudad, whatsapp, logo_url, qr_generado, onboarding_cerrado, plan, menu_compartido')
          .eq('id', restId)
          .single(),
        supabase.from('categorias').select('id', { count: 'exact', head: true }).eq('restaurante_id', restId),
        supabase.from('platos').select('id', { count: 'exact', head: true }).eq('restaurante_id', restId),
        supabase.from('horarios').select('id', { count: 'exact', head: true }).eq('restaurante_id', restId),
        supabase.from('visitas_menu').select('id', { count: 'exact', head: true }).eq('restaurante_id', restId),
      ])

      // Si la query del restaurante falló, no podemos calcular nada
      if (!restauranteRes.data) {
        
        setCargando(false)
        return
      }

      const restData = restauranteRes.data

      // Actualizar copia local de campos del restaurante (fuente de verdad de Supabase)
      setCamposRest({
        qr_generado: !!restData.qr_generado,
        onboarding_cerrado: !!restData.onboarding_cerrado,
        logo_url: restData.logo_url || null,
        nombre: restData.nombre || '',
        ciudad: restData.ciudad || '',
        whatsapp: restData.whatsapp || '',
      })

      const datosCompletos = !!(restData.nombre && restData.ciudad && restData.whatsapp)
      const tieneLogo = !!restData.logo_url
      const tieneCategorias = (categoriasRes.count || 0) > 0
      const tienePlatos = (platosRes.count || 0) > 0
      const tieneHorarios = (horariosRes.count || 0) > 0
      const tieneVisitas = (visitasRes.count || 0) > 0

      // El paso "logo" solo aplica a planes pagos (Básico/Pro), no a Gratis
      const planActual = restData.plan || 'gratis'
      const incluyeLogo = planActual !== 'gratis'

      const pasosBase: OnboardingPaso[] = [
        {
          id: 'datos',
          titulo: 'Completa los datos del negocio',
          descripcion: 'Nombre, ciudad y WhatsApp',
          href: '/config',
          completado: datosCompletos,
        },
      ]

      if (incluyeLogo) {
        pasosBase.push({
          id: 'logo',
          titulo: 'Sube tu logo',
          descripcion: 'Para que tu menú se vea profesional',
          href: '/config',
          completado: tieneLogo,
        })
      }

      pasosBase.push(
        {
          id: 'categoria',
          titulo: 'Crea tu primera categoría',
          descripcion: 'Ej: Entradas, Platos fuertes, Bebidas',
          href: '/menu',
          completado: tieneCategorias,
        },
        {
          id: 'plato',
          titulo: 'Agrega tu primer plato',
          descripcion: 'Con nombre, precio y descripción',
          href: '/menu',
          completado: tienePlatos,
        },
        {
          id: 'horarios',
          titulo: 'Configura los horarios',
          descripcion: 'Cuándo está abierto tu restaurante',
          href: '/config',
          completado: tieneHorarios,
        },
        {
          id: 'qr',
          titulo: 'Genera tu código QR',
          descripcion: 'Imprímelo y ponlo en las mesas',
          href: '/qr',
          // QR se completa si el usuario marcó qr_generado o si ya hay visitas
          completado: !!restData.qr_generado || tieneVisitas,
        },
        {
          id: 'compartir',
          titulo: 'Comparte tu menú',
          descripcion: 'Por QR, WhatsApp o redes sociales',
          href: '/qr',
          // Compartir se completa si: el usuario hizo click en alguna acción de compartir,
          // O si el menú ya recibió al menos 1 visita (validación real de uso)
          completado: !!restData.menu_compartido || tieneVisitas,
        }
      )

     
      setPasos(pasosBase)
      setCargando(false)
    } finally {
      detectandoRef.current = false
    }
  }, [])

  // EFECTO 1: Carga inicial cuando llega el restaurante.
  //
  // Importante: NO marcamos cargando=false cuando no hay restaurante.
  // Mantenemos cargando=true para evitar que el widget se renderice
  // momentáneamente con pasos vacíos durante el primer render
  // (mientras useAuth todavía está resolviendo).
  useEffect(() => {
    
    if (!restaurante?.id) {
      
      return
    }

    
    setCargando(true)
    detectarPasos(restaurante.id)
  }, [restaurante?.id, detectarPasos])

  // EFECTO 2: Suscripción a cambios en tiempo real (Supabase Realtime)
  // Escucha cambios en las 5 tablas relevantes y re-detecta los pasos automáticamente.
  useEffect(() => {
    if (!restaurante?.id) return

    const supabase = createClient()
    const restId = restaurante.id

    // Función que se llama cuando Realtime detecta un cambio relevante
    const manejarCambio = () => {
      detectarPasos(restId)
    }

    // Canal único que escucha los 5 tipos de cambios.
    // Filtramos por restaurante_id para recibir solo eventos de este negocio.
    const canal = supabase
      .channel(`onboarding-${restId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categorias', filter: `restaurante_id=eq.${restId}` },
        manejarCambio
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'platos', filter: `restaurante_id=eq.${restId}` },
        manejarCambio
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'horarios', filter: `restaurante_id=eq.${restId}` },
        manejarCambio
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'visitas_menu', filter: `restaurante_id=eq.${restId}` },
        manejarCambio
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'restaurantes', filter: `id=eq.${restId}` },
        manejarCambio
      )
      .subscribe()

    // Cleanup: desuscribirse al desmontar o al cambiar el restaurante
    return () => {
      supabase.removeChannel(canal)
    }
  }, [restaurante?.id, detectarPasos])

  // Función para cerrar el widget permanentemente
  const cerrarWidget = useCallback(async () => {
    if (!restaurante?.id) return

    // Optimistic update local
    setCamposRest(prev => prev ? { ...prev, onboarding_cerrado: true } : prev)

    const supabase = createClient()
    const { error } = await supabase
      .from('restaurantes')
      .update({ onboarding_cerrado: true })
      .eq('id', restaurante.id)

    if (error) {
      // Si falla, revertimos
      setCamposRest(prev => prev ? { ...prev, onboarding_cerrado: false } : prev)
    }
    // Si tiene éxito, Realtime nos confirmará el cambio
  }, [restaurante?.id])

  // Cálculos derivados
  const totalPasos = pasos.length || (restaurante?.plan === 'gratis' ? TOTAL_PASOS_GRATIS : TOTAL_PASOS_PAGO)
  const totalCompletados = pasos.filter(p => p.completado).length
  const porcentaje = totalPasos > 0
    ? Math.round((totalCompletados / totalPasos) * 100)
    : 0

  const cerrado = camposRest?.onboarding_cerrado === true
  // El widget se muestra si: NO está cerrado Y hay pasos pendientes Y ya cargó
  const mostrar = !cerrado && totalCompletados < totalPasos && !cargando

  return {
    pasos,
    totalCompletados,
    totalPasos,
    porcentaje,
    cerrado,
    mostrar,
    cargando,
    cerrarWidget,
  }
}