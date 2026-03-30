import { createClient } from './supabase-browser'

export async function registrarConEmail(email: string, password: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signUp({ email, password })
  return { data, error }
}

export async function loginConEmail(email: string, password: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function loginConGoogle() {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  })
  return { data, error }
}

export async function cerrarSesion() {
  const supabase = createClient()
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function obtenerUsuario() {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error }
}

export async function recuperarPassword(email: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  })
  return { data, error }
}