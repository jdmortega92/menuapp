'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { loginConEmail, loginConGoogle } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setCargando(true)

    const { error } = await loginConEmail(email, password)

    if (error) {
      setError('Correo o contraseña incorrectos')
      setCargando(false)
      return
    }

    router.push('/dashboard')
  }

  async function handleGoogle() {
    setError('')
    const { error } = await loginConGoogle()
    if (error) {
      setError('Error al conectar con Google')
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
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '32px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '-0.5px',
            }}
          >
            Menu
            <span style={{ color: 'var(--color-accent)' }}>App</span>
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              marginTop: '6px',
            }}
          >
            Tu menú digital en 2 minutos
          </p>
        </div>

        {/* Google */}
        <button
          onClick={handleGoogle}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light)',
            background: 'var(--bg-secondary)',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            color: 'var(--text-primary)',
            marginBottom: '16px',
            transition: 'all 150ms ease',
          }}
        >
          Continuar con Google
        </button>

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            margin: '20px 0',
          }}
        >
          <div
            style={{
              flex: 1,
              height: '1px',
              background: 'var(--border-light)',
            }}
          />
          <span
            style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}
          >
            o
          </span>
          <div
            style={{
              flex: 1,
              height: '1px',
              background: 'var(--border-light)',
            }}
          />
        </div>

        {/* Formulario */}
        <form onSubmit={handleLogin}>
          {/* Email */}
          <div style={{ marginBottom: '14px' }}>
            <label className="label">Correo electrónico</label>
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
          <div style={{ marginBottom: '8px' }}>
            <label className="label">Contraseña</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          {/* Olvidé contraseña */}
          <div
            style={{
              textAlign: 'right',
              marginBottom: '24px',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                color: 'var(--color-info)',
                cursor: 'pointer',
              }}
            >
              ¿Olvidaste tu contraseña?
            </span>
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

          {/* Botón login */}
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
            {cargando ? 'Entrando...' : 'Iniciar sesión'}
          </button>
        </form>

        {/* Link a registro */}
        <p
          style={{
            textAlign: 'center',
            marginTop: '24px',
            fontSize: '13px',
            color: 'var(--text-secondary)',
          }}
        >
          ¿No tienes cuenta?{' '}
          <span
            onClick={() => router.push('/registro')}
            style={{
              color: 'var(--color-info)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Regístrate gratis
          </span>
        </p>
      </div>
    </div>
  )
}