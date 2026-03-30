'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function CompletaPerfilPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [userName, setUserName] = useState('')

  // Datos del negocio
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [whatsapp, setWhatsapp] = useState('')

  const tiposNegocio = [
    { valor: 'restaurante', label: 'Restaurante' },
    { valor: 'cafeteria', label: 'Cafetería' },
    { valor: 'panaderia', label: 'Panadería' },
    { valor: 'bar', label: 'Bar' },
    { valor: 'comida_rapida', label: 'Comida rápida' },
    { valor: 'heladeria', label: 'Heladería' },
    { valor: 'food_truck', label: 'Food truck' },
    { valor: 'otro', label: 'Otro' },
  ]

  useEffect(() => {
    const supabase = createClient()
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserEmail(user.email || '')
        setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || '')
      } else {
        router.push('/login')
      }
    }
    getUser()
  }, [router])

  function generarSlug(nombre: string): string {
    return nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  async function handleCompletar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setCargando(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setError('Sesión expirada. Inicia sesión de nuevo.')
      setCargando(false)
      return
    }

    const slug = generarSlug(nombre)

    const { error: insertError } = await supabase
      .from('restaurantes')
      .insert({
        usuario_id: user.id,
        nombre,
        tipo,
        ciudad,
        whatsapp,
        slug,
        plan: 'gratis',
        idioma: 'es',
      })

    if (insertError) {
      if (insertError.message.includes('slug')) {
        setError('Ese nombre ya está en uso. Intenta con otro.')
      } else {
        setError('Error al crear el restaurante. Intenta de nuevo.')
      }
      setCargando(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'var(--bg-primary)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          animation: 'fadeInUp 0.5s ease',
        }}
      >
        {/* Barra de progreso */}
        <div
          style={{
            display: 'flex',
            gap: '4px',
            marginBottom: '28px',
          }}
        >
          <div
            style={{
              flex: 1,
              height: '3px',
              borderRadius: '2px',
              background: 'var(--color-info)',
            }}
          />
          <div
            style={{
              flex: 1,
              height: '3px',
              borderRadius: '2px',
              background: 'var(--color-info)',
            }}
          />
          <div
            style={{
              flex: 1,
              height: '3px',
              borderRadius: '2px',
              background: 'var(--border-light)',
            }}
          />
        </div>

        {/* Título */}
        <h2
          style={{
            fontSize: '20px',
            fontWeight: 500,
            marginBottom: '4px',
            fontFamily: 'var(--font-body)',
          }}
        >
          Completa tu perfil
        </h2>
        <p
          style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            marginBottom: '28px',
          }}
        >
          Cuéntanos sobre tu negocio para personalizar tu menú
        </p>

        {/* Google account info */}
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-md)',
            padding: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'var(--color-accent-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--color-accent)',
              flexShrink: 0,
            }}
          >
            {userName.charAt(0).toUpperCase() || 'U'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 500 }}>
              {userName}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
              {userEmail}
            </div>
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--color-green)',
            }}
          >
            Conectado
          </div>
        </div>

        {/* Formulario */}
        <form onSubmit={handleCompletar}>
          {/* Nombre del negocio */}
          <div style={{ marginBottom: '14px' }}>
            <label className="label">Nombre del negocio *</label>
            <input
              className="input"
              type="text"
              placeholder="Ej: La Parrilla de Juan"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </div>

          {/* Tipo de negocio */}
          <div style={{ marginBottom: '14px' }}>
            <label className="label">Tipo de negocio *</label>
            <select
              className="input"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              required
              style={{
                color: tipo ? 'var(--text-primary)' : 'var(--text-tertiary)',
                appearance: 'none',
              }}
            >
              <option value="" disabled>
                Selecciona
              </option>
              {tiposNegocio.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Ciudad */}
          <div style={{ marginBottom: '14px' }}>
            <label className="label">Ciudad *</label>
            <input
              className="input"
              type="text"
              placeholder="Ej: Medellín"
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
              required
            />
          </div>

          {/* WhatsApp */}
          <div style={{ marginBottom: '28px' }}>
            <label className="label">WhatsApp del negocio *</label>
            <input
              className="input"
              type="tel"
              placeholder="Ej: 300 123 4567"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              required
            />
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                background: 'var(--color-danger-light)',
                color: 'var(--color-danger)',
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                marginBottom: '16px',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}

          {/* Botón */}
          <button
            type="submit"
            disabled={cargando}
            className="btn-primary"
            style={{
              width: '100%',
              opacity: cargando ? 0.7 : 1,
              cursor: cargando ? 'not-allowed' : 'pointer',
            }}
          >
            {cargando ? 'Guardando...' : 'Continuar'}
          </button>

          <p
            style={{
              textAlign: 'center',
              marginTop: '12px',
              fontSize: '11px',
              color: 'var(--text-tertiary)',
            }}
          >
            Solo toma 30 segundos
          </p>
        </form>
      </div>
    </div>
  )
}