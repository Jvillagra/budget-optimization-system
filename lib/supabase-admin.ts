import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

// Cliente con service_role: bypassa RLS. Úsalo SOLO dentro de Route Handlers
// (app/api/**/route.ts) o Server Components — nunca lo importes desde un
// archivo 'use client'. El paquete `server-only` hace que el build falle si
// alguien lo intenta importar desde código de cliente.

let _admin: SupabaseClient<Database> | null = null

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (!_admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurada')
    _admin = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _admin
}
