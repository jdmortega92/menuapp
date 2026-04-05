'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { registrarConEmail } from '@/lib/auth'

export default function RegistroPage() {
  const router = useRouter()
  const [paso, setPaso] = useState(1)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  // Datos del formulario
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

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

  async function handleRegistro(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setCargando(true)

    // 1. Crear cuenta en Supabase Auth
    const { data, error: authError } = await registrarConEmail(email, password)

    if (authError) {
      setError('Error al crear la cuenta. Intenta con otro correo.')
      setCargando(false)
      return
    }

    if (!data.user) {
      setError('Error inesperado. Intenta de nuevo.')
      setCargando(false)
      return
    }

    // 2. Crear restaurante en la base de datos
    const { createClient } = await import('@/lib/supabase-browser')
    const supabase = createClient()

    const slug = nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    const { error: dbError } = await supabase
      .from('restaurantes')
      .insert({
        usuario_id: data.user.id,
        nombre,
        tipo,
        ciudad,
        whatsapp,
        slug,
        plan: 'gratis',
        idioma: 'es',
      })

    if (dbError) {
      if (dbError.message.includes('slug')) {
        setError('Ese nombre ya está en uso. Intenta con otro.')
      } else {
        setError('Error al crear el restaurante: ' + dbError.message)
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
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '28px',
          }}
        >
          <span
            onClick={() => (paso === 1 ? router.push('/login') : setPaso(1))}
            style={{
              fontSize: '18px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            ←
          </span>
          <span style={{ fontSize: '18px', fontWeight: 500 }}>
            Crear cuenta
          </span>
        </div>

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
              background: paso >= 2 ? 'var(--color-info)' : 'var(--border-light)',
            }}
          />
        </div>

        <form onSubmit={paso === 1 ? (e) => { e.preventDefault(); setPaso(2) } : handleRegistro}>
          {paso === 1 && (
            <>
              <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>
                Datos de tu negocio
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                Solo necesitamos lo básico para empezar
              </p>

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
              <div style={{ marginBottom: '24px' }}>
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

              {/* Botón siguiente */}
              <button
                type="submit"
                className="btn-primary"
                style={{ width: '100%' }}
              >
                Siguiente
              </button>
            </>
          )}

          {paso === 2 && (
            <>
              <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>
                Crea tu cuenta
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                Con estos datos podrás iniciar sesión
              </p>

              {/* Resumen negocio */}
              <div
                style={{
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
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
                  {nombre.charAt(0).toUpperCase() || 'N'}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{nombre || 'Tu negocio'}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    {tiposNegocio.find((t) => t.valor === tipo)?.label || 'Tipo'} · {ciudad || 'Ciudad'}
                  </div>
                </div>
              </div>

              {/* Email */}
              <div style={{ marginBottom: '14px' }}>
                <label className="label">Correo electrónico *</label>
                <input
                  className="input"
                  type="email"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: '24px' }}>
                <label className="label">Contraseña *</label>
                <input
                  className="input"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
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

              {/* Botón crear */}
              <button
                type="submit"
                disabled={cargando}
                className="btn-accent"
                style={{
                  width: '100%',
                  opacity: cargando ? 0.7 : 1,
                  cursor: cargando ? 'not-allowed' : 'pointer',
                }}
              >
                {cargando ? 'Creando cuenta...' : 'Crear mi menú gratis'}
              </button>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '12px' }}>
                Al crear tu cuenta aceptas nuestros{' '}
                <span onClick={() => router.push('/legal')} style={{ color: 'var(--color-info)', cursor: 'pointer' }}>términos y condiciones</span>
                {' '}y{' '}
                <span onClick={() => router.push('/legal')} style={{ color: 'var(--color-info)', cursor: 'pointer' }}>política de privacidad</span>
              </div>
            </>
          )}
        </form>

        {/* Link a login */}
        <p
          style={{
            textAlign: 'center',
            marginTop: '20px',
            fontSize: '13px',
            color: 'var(--text-secondary)',
          }}
        >
          ¿Ya tienes cuenta?{' '}
          <span
            onClick={() => router.push('/login')}
            style={{
              color: 'var(--color-info)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Inicia sesión
          </span>
        </p>
      </div>
    </div>
  )
}