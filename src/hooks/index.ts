'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import type { Usuario, Restaurante, Plan, ConfigRestaurante } from '@/types'

// ── useAuth: estado del usuario ──
export function useAuth() {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [restaurante, setRestaurante] = useState<Restaurante | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    let isMounted = true // Flag para prevenir updates en componentes desmontados

    async function obtenerSesion() {
      // getSession() lee del storage local sin adquirir lock (más rápido y sin conflictos)
      // A diferencia de getUser() que siempre hace una llamada al servidor
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user

      if (!isMounted) return // Cleanup: si el componente se desmontó, no actualizar estado

      if (user) {
        setUsuario({
          id: user.id,
          email: user.email || '',
          nombre: user.user_metadata?.nombre || '',
          created_at: user.created_at,
        })

        const { data: rest } = await supabase
          .from('restaurantes')
          .select('*')
          .eq('usuario_id', user.id)
          .single()

        if (!isMounted) return // Verificar de nuevo después del await async

        if (rest) setRestaurante(rest)
      }

      if (isMounted) setCargando(false)
    }

    obtenerSesion()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!isMounted) return

        if (session?.user) {
          setUsuario({
            id: session.user.id,
            email: session.user.email || '',
            nombre: session.user.user_metadata?.nombre || '',
            created_at: session.user.created_at,
          })
        } else {
          setUsuario(null)
          setRestaurante(null)
        }
      }
    )

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  return { usuario, restaurante, cargando }
}

// ── usePlan: verificar funciones por plan ──
export function usePlan(plan: Plan) {
  const esGratis = plan === 'gratis'
  const esBasico = plan === 'basico'
  const esPro = plan === 'pro'

  return {
    plan,
    esGratis,
    esBasico,
    esPro,
    puede: {
      platosIlimitados: esBasico || esPro,
      categoriasIlimitadas: esBasico || esPro,
      subirFotos: esBasico || esPro,
      qrPersonalizado: esBasico || esPro,
      verGrafica: esBasico || esPro,
      verPlatosMasVistos: esBasico || esPro,
      verHorariosPico: esBasico || esPro,
      marcarAgotado: esBasico || esPro,
      menuPorHorario: esBasico || esPro,
      personalizarColor: esBasico || esPro,
      personalizarBanner: esBasico || esPro,
      crearCombos: esPro,
      crearPromos: esPro,
      platoDia: esPro,
      platoGanador: esPro,
      calificaciones: esPro,
      embudoConversion: esPro,
      vistaVsPedido: esPro,
      comparacionPeriodos: esPro,
      mejoresPeoresDias: esPro,
      reportePDF: esPro,
      pedidosWhatsappStats: esPro,
      calificacionPromedio: esPro,
    },
    limites: {
      maxPlatos: esGratis ? 10 : Infinity,
      maxCategorias: esGratis ? 1 : Infinity,
    },
  }
}

// ── useConfig: configuración del restaurante ──
export function useConfig() {
  const [config, setConfig] = useState<ConfigRestaurante | null>(null)
  const [cargando, setCargando] = useState(true)

  async function cargarConfig(restauranteId: string) {
    const supabase = createClient()
    const { data } = await supabase
      .from('config_restaurante')
      .select('*')
      .eq('restaurante_id', restauranteId)
      .single()

    if (data) setConfig(data)
    setCargando(false)
  }

  async function actualizarConfig(
    restauranteId: string,
    campo: keyof ConfigRestaurante,
    valor: boolean
  ) {
    const supabase = createClient()
    await supabase
      .from('config_restaurante')
      .update({ [campo]: valor })
      .eq('restaurante_id', restauranteId)

    setConfig((prev) => prev ? { ...prev, [campo]: valor } : null)
  }

  return { config, cargando, cargarConfig, actualizarConfig }
}

// ── useOrigen: detectar QR o enlace web ──
export function useOrigen() {
  const [origen, setOrigen] = useState<'qr_mesa' | 'enlace_web'>('enlace_web')
  const [mesa, setMesa] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const qr = params.get('qr')

      if (qr) {
        setOrigen('qr_mesa')
        setMesa(qr)
      }
    }
  }, [])

  return { origen, mesa, esQR: origen === 'qr_mesa', esWeb: origen === 'enlace_web' }
}