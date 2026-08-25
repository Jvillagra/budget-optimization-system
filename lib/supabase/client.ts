'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '../types'

// Cliente de Auth para el navegador. Solo se usa para login/logout
// (signInWithOtp, signOut, getSession) -- nunca para leer/escribir datos de
// negocio, eso sigue yendo por /api/* con service_role.
export function getSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // PKCE exige abrir el Magic Link en el MISMO navegador donde se
        // pidió (requiere el code_verifier guardado localmente) -- rompe el
        // caso normal de "pido el link y lo abro desde Gmail/el teléfono".
        // Implicit flow no tiene esa restricción: el token de sesión viaja
        // en el propio link del email.
        flowType: 'implicit',
      },
    }
  )
}
