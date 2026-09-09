'use client'

import type { Database } from '../types'

// Cliente de Auth para el navegador. Solo se usa para pedir el Magic Link
// (signInWithOtp) -- nunca para leer/escribir datos de negocio (eso va por
// /api/* con service_role) ni para guardar la sesión: el canje del link o
// del código lo hace POST /api/auth/session y la sesión vive en cookies
// que escribe el servidor.
//
// Es createClient de supabase-js a secas, NO createBrowserClient de
// @supabase/ssr: ese fuerza `flowType: 'pkce'` DESPUÉS de mezclar las
// opciones que le pasamos (ver node_modules/@supabase/ssr/dist/main/
// createBrowserClient.js), así que el `flowType: 'implicit'` que teníamos
// antes se ignoraba en silencio. Con PKCE el token del correo sale con
// prefijo `pkce_` y exige el code_verifier guardado en el navegador que
// pidió el link -- rompe abrirlo desde el celular o desde otro navegador,
// que es el caso normal de un socio.
// El `import()` es dinamico a proposito: supabase-js son 62KB gz y este
// cliente solo hace falta cuando alguien aprieta "Enviar link" en /login --
// la unica pantalla que lo usa, y la unica que ve una persona sin sesion,
// muchas veces desde un celular en terreno. Estatico, esos 62KB eran el 70%
// del JS de /login y se descargaban antes de que se pudiera escribir el
// email. Ahora viajan en su propio chunk, recien al enviar.
export async function getSupabaseBrowserClient() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: 'implicit',
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  )
}
