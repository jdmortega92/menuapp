'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import PasswordInput from '@/components/ui/PasswordInput'
import { isPasswordValid, getPasswordError } from '@/lib/passwordValidation'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [nuevaPassword, setNuevaPassword] = useState('')
  const [confirmarPassword, setConfirmarPassword] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [exito, setExito] = useState(false)
  const [error, setError] = useState('')
  const [sesionValida, setSesionValida] = useState(false)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function verificar() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setSesionValida(true)
      }
      setCargando(false)
    }
    verificar()
  }, [])

  async function handleReset() {
    if (!isPasswordValid(nuevaPassword)) {
      setError(getPasswordError(nuevaPassword) || 'La contraseña no cumple los requisitos de seguridad')
      return
    }
    if (nuevaPassword !== confirmarPassword) {
      setError('Las contraseñas no coinciden')
      return
    }
    setGuardando(true)
    setError('')
    const supabase = createClient()
    const { error: err } = await supabase.auth.updateUser({ password: nuevaPassword })
    setGuardando(false)
    if (err) {
      setError('Error al cambiar la contraseña. Intenta de nuevo.')
      return
    }
    setExito(true)
    setTimeout(() => router.push('/dashboard'), 3000)
  }

  if (cargando) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 500, fontFamily: 'var(--font-display)' }}>Menu<span style={{ color: 'var(--color-accent)' }}>App</span></div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>Verificando enlace...</div>
        </div>
      </div>
    )
  }

  if (!sesionValida) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', padding: '20px' }}>
        <div style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚠️</div>
          <div style={{ fontSize: '18px', fontWeight: 500, marginBottom: '8px' }}>Enlace expirado o inválido</div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.6 }}>
            Este enlace de recuperación ya no es válido. Solicita uno nuevo desde la página de inicio de sesión.
          </div>
          <button onClick={() => router.push('/login')} className="btn-primary" style={{ padding: '12px 24px', fontSize: '13px' }}>
            Ir al inicio de sesión
          </button>
        </div>
      </div>
    )
  }

  if (exito) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', padding: '20px' }}>
        <div style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>✓</div>
          <div style={{ fontSize: '18px', fontWeight: 500, marginBottom: '8px' }}>Contraseña actualizada</div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Tu contraseña se cambió correctamente. Serás redirigido al dashboard en unos segundos.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '400px', animation: 'fadeInUp 0.5s ease' }}>

        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
            Menu<span style={{ color: 'var(--color-accent)' }}>App</span>
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '6px' }}>Restablecer contraseña</p>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Nueva contraseña</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Crea una contraseña segura para proteger tu cuenta.
          </div>

          <div style={{ marginBottom: '12px' }}>
            <PasswordInput
              value={nuevaPassword}
              onChange={setNuevaPassword}
              placeholder="Nueva contraseña"
              showValidation={true}
            />
          </div>

          <div style={{ marginBottom: '10px' }}>
            <PasswordInput
              value={confirmarPassword}
              onChange={setConfirmarPassword}
              placeholder="Confirmar contraseña"
            />
          </div>

          {nuevaPassword && confirmarPassword && nuevaPassword !== confirmarPassword && (
            <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '10px' }}>Las contraseñas no coinciden</div>
          )}

          {error && (
            <div style={{ background: 'var(--color-danger-light)', color: 'var(--color-danger)', padding: '10px', borderRadius: 'var(--radius-sm)', fontSize: '12px', marginBottom: '10px', textAlign: 'center' }}>
              {error}
            </div>
          )}

          <button onClick={handleReset}
            disabled={!isPasswordValid(nuevaPassword) || nuevaPassword !== confirmarPassword || guardando}
            className="btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: '14px', opacity: (!isPasswordValid(nuevaPassword) || nuevaPassword !== confirmarPassword) ? 0.5 : 1, cursor: (!isPasswordValid(nuevaPassword) || nuevaPassword !== confirmarPassword) ? 'not-allowed' : 'pointer' }}>
            {guardando ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </div>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
          <span onClick={() => router.push('/login')} style={{ color: 'var(--color-info)', cursor: 'pointer' }}>Volver al inicio de sesión</span>
        </p>
      </div>
    </div>
  )
}