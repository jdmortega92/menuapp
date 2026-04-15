'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { registrarConEmail, loginConGoogle } from '@/lib/auth'
import { createClient } from '@/lib/supabase-browser'

function RegistroContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const esGoogle = searchParams.get('google') === '1'
  const pasoInicial = searchParams.get('paso') === '2' ? 2 : 1
  const [paso, setPaso] = useState(pasoInicial)
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

  async function handleGoogle() {
    setError('')
    const { error } = await loginConGoogle()
    if (error) {
      setError('Error al conectar con Google')
    }
  }

  async function crearRestaurante(userId: string) {
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
        usuario_id: userId,
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
      return false
    }

    // Crear config_restaurante
    const { data: restData } = await supabase
      .from('restaurantes')
      .select('id')
      .eq('usuario_id', userId)
      .single()

    if (restData) {
      await supabase.from('config_restaurante').upsert({ restaurante_id: restData.id }, { onConflict: 'restaurante_id' })
    }

    return true
  }

  async function handleRegistro(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setCargando(true)

    if (esGoogle) {
      // Usuario ya autenticado con Google, solo crear restaurante
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setError('Sesión expirada. Intenta de nuevo.')
        setCargando(false)
        router.push('/login')
        return
      }

      const ok = await crearRestaurante(user.id)
      if (ok) router.push('/dashboard')
      setCargando(false)
    } else {
      // Registro normal con email/password
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

      const ok = await crearRestaurante(data.user.id)
      if (ok) router.push('/dashboard')
      setCargando(false)
    }
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
            onClick={() => (paso === 1 ? router.push('/login') : esGoogle ? router.push('/login') : setPaso(1))}
            style={{
              fontSize: '18px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            ←
          </span>
          <span style={{ fontSize: '18px', fontWeight: 500 }}>
            {esGoogle ? 'Completa tu registro' : 'Crear cuenta'}
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

              {/* Botón Google en paso 1 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--border-light)' }} />
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>o</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border-light)' }} />
              </div>
              <button onClick={handleGoogle} type="button" style={{
                width: '100%', padding: '12px', fontSize: '13px', fontWeight: 500,
                border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)',
                background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                fontFamily: 'var(--font-body)',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Registrarse con Google
              </button>
            </>
          )}

          {paso === 2 && (
            <>
              <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>
                {esGoogle ? 'Datos de tu negocio' : 'Crea tu cuenta'}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                {esGoogle ? 'Solo necesitamos lo básico para crear tu menú' : 'Con estos datos podrás iniciar sesión'}
              </p>

              {esGoogle ? (
                <>
                  {/* Nombre del negocio */}
                  <div style={{ marginBottom: '14px' }}>
                    <label className="label">Nombre del negocio *</label>
                    <input className="input" type="text" placeholder="Ej: La Parrilla de Juan"
                      value={nombre} onChange={(e) => setNombre(e.target.value)} required />
                  </div>
                  {/* Tipo */}
                  <div style={{ marginBottom: '14px' }}>
                    <label className="label">Tipo de negocio *</label>
                    <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)} required
                      style={{ color: tipo ? 'var(--text-primary)' : 'var(--text-tertiary)', appearance: 'none' }}>
                      <option value="" disabled>Selecciona</option>
                      {tiposNegocio.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
                    </select>
                  </div>
                  {/* Ciudad */}
                  <div style={{ marginBottom: '14px' }}>
                    <label className="label">Ciudad *</label>
                    <input className="input" type="text" placeholder="Ej: Medellín"
                      value={ciudad} onChange={(e) => setCiudad(e.target.value)} required />
                  </div>
                  {/* WhatsApp */}
                  <div style={{ marginBottom: '24px' }}>
                    <label className="label">WhatsApp del negocio *</label>
                    <input className="input" type="tel" placeholder="Ej: 300 123 4567"
                      value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} required />
                  </div>
                </>
              ) : (
                <>
                  {/* Resumen negocio */}
                  <div style={{
                    background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)',
                    padding: '12px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px',
                  }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '8px',
                      background: 'var(--color-accent-light)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: '14px', fontWeight: 600, color: 'var(--color-accent)', flexShrink: 0,
                    }}>
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
                    <input className="input" type="email" placeholder="tu@correo.com"
                      value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  {/* Password */}
                  <div style={{ marginBottom: '24px' }}>
                    <label className="label">Contraseña *</label>
                    <input className="input" type="password" placeholder="Mínimo 6 caracteres"
                      value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                  </div>
                </>
              )}

              {/* Error */}
              {error && (
                <div style={{
                  background: 'var(--color-danger-light)', color: 'var(--color-danger)',
                  padding: '12px', borderRadius: 'var(--radius-sm)', fontSize: '13px',
                  marginBottom: '16px', textAlign: 'center',
                }}>
                  {error}
                </div>
              )}

              {/* Botón crear */}
              <button type="submit" disabled={cargando} className="btn-accent"
                style={{ width: '100%', opacity: cargando ? 0.7 : 1, cursor: cargando ? 'not-allowed' : 'pointer' }}>
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
        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          ¿Ya tienes cuenta?{' '}
          <span onClick={() => router.push('/login')} style={{ color: 'var(--color-info)', cursor: 'pointer', fontWeight: 500 }}>
            Inicia sesión
          </span>
        </p>
      </div>
    </div>
  )
}
export default function RegistroPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}><div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Cargando...</div></div>}>
      <RegistroContent />
    </Suspense>
  )
}
