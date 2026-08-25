import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '../types'

// Cliente de Auth para Server Components / Route Handlers -- lee la sesión
// desde las cookies de Supabase Auth. Solo para saber "quién está
// logueado" (auth.getUser()); los datos de negocio siguen yendo por
// lib/supabase-admin.ts (service_role).
export async function getSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Se llama desde un Server Component sin permiso de escritura de
            // cookies -- el proxy.ts ya se encarga de refrescar la sesión.
          }
        },
      },
    }
  )
}
