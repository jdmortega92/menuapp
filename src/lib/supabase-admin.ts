import { createClient } from '@supabase/supabase-js'

// Cliente de service role: SOLO servidor. SUPABASE_SERVICE_ROLE_KEY nunca
// lleva prefijo NEXT_PUBLIC_ y BYPASA RLS por completo, asi que este modulo
// jamas debe importarse desde codigo de cliente. Primer consumidor: el webhook
// de Wompi (F4.a-2), que escribe plan/plan_expira/factura sin sesion de usuario.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
