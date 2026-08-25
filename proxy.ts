import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Gate de sesión para toda la app (páginas + API), salvo login/callback.
// Solo verifica que haya una sesión válida de Supabase Auth -- la
// autorización fina por rol (owner/admin/socio) vive en cada Server
// Component/Route Handler vía lib/roles.ts, no acá, para no pegarle a la
// base de datos en cada request de cada asset.
const PUBLIC_PATHS = ['/login', '/auth/callback', '/manifest.json']
// Cualquier archivo estático de public/ (logo, favicons, manifest icons) --
// nunca son sensibles y layout.tsx los referencia en TODAS las páginas,
// incluida /login (sin sesión todavía). Bug real encontrado: antes solo
// /favicon.ico e /icons/* estaban permitidos, así que /logo.png y los
// favicon-*.png quedaban detrás del gate y se rompían en /login.
const STATIC_ASSET_RE = /\.(png|jpg|jpeg|svg|webp|ico|gif)$/i

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isPublic =
    PUBLIC_PATHS.some(p => pathname === p) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/screenshots') ||
    STATIC_ASSET_RE.test(pathname)

  if (isPublic) return NextResponse.next()

  let response = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) req.cookies.set(name, value)
          response = NextResponse.next({ request: req })
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
