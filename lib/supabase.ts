import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

// Lazy init para evitar fallos en build time cuando las env vars no están disponibles
let _client: SupabaseClient<Database> | null = null

export function getSupabaseClient(): SupabaseClient<Database> {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('Supabase env vars no configuradas. Ver .env.example')
    _client = createClient<Database>(url, key)
  }
  return _client
}

// Proxy que delega al cliente lazy — mantiene la API compatible con `supabase.from(...)` etc.
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    return (getSupabaseClient() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
