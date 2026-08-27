import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Establece la sesión de Supabase Auth escribiendo las cookies desde el
// servidor (Set-Cookie), no desde el browser client (document.cookie).
// Motivo: en un ícono de "Agregar a inicio" en iOS sin service worker,
// WebKit (ITP) trata el storage script-writable -- document.cookie
// incluido -- con un cap de retención mucho más agresivo que las cookies
// puestas por un Set-Cookie real del servidor, lo que hacía que la sesión
// se perdiera y volviera a pedir magic link con cada apertura del ícono.
// /auth/callback y el "pegar link" de /login mandan acá los tokens/código/
// OTP en vez de resolverlos ellos mismos con el browser client.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const { accessToken, refreshToken, tokenHash, type, code } = body as {
    accessToken?: string
    refreshToken?: string
    tokenHash?: string
    type?: string
    code?: string
  }

  let response = NextResponse.json({ ok: true })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          response = NextResponse.json({ ok: true })
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        },
      },
    }
  )

  const result = accessToken && refreshToken
    ? await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
    : tokenHash
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: (type ?? 'magiclink') as 'magiclink' })
      : code
        ? await supabase.auth.exchangeCodeForSession(code)
        : { error: { message: 'Faltan tokens de sesión' } as { message: string }, data: { session: null } }

  if (result.error || !result.data.session) {
    return NextResponse.json({ error: result.error?.message ?? 'Sesión inválida' }, { status: 401 })
  }

  return response
}
