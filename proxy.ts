import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

// Gate de contraseña compartida para toda la app (páginas + API), salvo el
// propio login. No reemplaza RLS -- la anon key puede seguir leyendo directo
// contra Supabase si alguien la extrae del bundle -- pero cierra el camino
// normal de uso y protege por completo las rutas de escritura, que ya no
// aceptan la anon key en absoluto (ver app/api/*/route.ts).
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/manifest.json', '/favicon.ico']

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isPublic =
    PUBLIC_PATHS.some(p => pathname === p) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/screenshots')

  if (isPublic) return NextResponse.next()

  const authed = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (authed) return NextResponse.next()

  if (pathname.startsWith('/api')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
