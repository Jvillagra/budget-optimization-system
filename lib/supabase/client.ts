'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '../types'

// Cliente de Auth para el navegador. Solo se usa para login/logout
// (signInWithOtp, signOut, getSession) -- nunca para leer/escribir datos de
// negocio, eso sigue yendo por /api/* con service_role.
export function getSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
