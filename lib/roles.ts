import 'server-only'
import { cache } from 'react'
import { getSupabaseServerClient } from './supabase/server'
import { getSupabaseAdmin } from './supabase-admin'

export type ViewerContext =
  | { role: 'owner' | 'admin'; userId: string; email: string; beneficiarioId: string | null; nombreSocio?: string }
  | { role: 'socio'; userId: string; email: string; beneficiarioId: string; nombreSocio: string }
  | { role: null; userId: string; email: string; beneficiarioId: null } // logueado pero sin acceso provisto
  | { role: null; userId: null; email: null; beneficiarioId: null } // no autenticado

/**
 * Resuelve quién es el usuario autenticado y qué puede ver:
 * 1. Si su auth.users.id está en app_roles -> owner/admin, acceso total.
 * 2. Si no, se busca su email en beneficiarios -> socio, acceso solo a lo suyo.
 * 3. Si no matchea ninguno -> autenticado pero sin acceso (cuenta no provista).
 *
 * Envuelto en cache() de React: se memoiza POR REQUEST, no entre requests.
 * Una carga de /mi-dashboard lo invocaba tres veces (el layout raíz para la
 * navegación, el layout de sección para el guard de rol, y la página para
 * saber de qué beneficiario cargar datos) y cada llamada era un getUser()
 * contra Supabase más una o dos consultas. Ahora la primera resuelve y las
 * otras dos leen el mismo resultado.
 */
// Rol resuelto por usuario, compartido ENTRE requests mientras la instancia
// de la función siga caliente. Las dos consultas (app_roles + beneficiarios)
// se hacían en cada página, cada RSC de navegación y cada /api/*, y el rol
// de una persona cambia una vez cada muchos días. Un admin recién agregado
// o quitado tarda hasta ROL_TTL_MS en verse reflejado: aceptable.
const ROL_TTL_MS = 60_000
const rolCache = new Map<string, { ctx: ViewerContext; at: number }>()

export const getViewerContext = cache(async function getViewerContext(): Promise<ViewerContext> {
  const supabase = await getSupabaseServerClient()
  // Verificación local del JWT, sin round-trip a Supabase Auth -- ver el
  // comentario en proxy.ts. `sub` y `email` vienen en los claims.
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  const user = claims?.sub ? { id: claims.sub as string, email: claims.email as string | undefined } : null
  if (!user || !user.email) return { role: null, userId: null, email: null, beneficiarioId: null }

  const cacheado = rolCache.get(user.id)
  if (cacheado && Date.now() - cacheado.at < ROL_TTL_MS) return cacheado.ctx
  const ctx = await resolverRol(user.id, user.email)
  rolCache.set(user.id, { ctx, at: Date.now() })
  return ctx
})

async function resolverRol(userId: string, userEmail: string): Promise<ViewerContext> {
  const user = { id: userId, email: userEmail }
  const admin = getSupabaseAdmin()
  // Supabase Auth normaliza el email a minúsculas; beneficiarios.email es
  // `text unique`, que distingue Juan@x.com de juan@x.com. Sin normalizar,
  // un socio cargado con mayúsculas nunca matcheaba y entraba como "cuenta
  // sin acceso". La migración 009 normaliza lo existente; esto cubre lo que
  // se cargue a mano después.
  const emailNorm = user.email.trim().toLowerCase()

  const { data: roleRow } = await admin
    .from('app_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (roleRow) {
    // Un owner/admin puede a la vez ser socio (mismo email en beneficiarios)
    // -- caso real: María Inés. No cambia su role ni su acceso de staff,
    // solo le suma beneficiarioId para que pueda usar /mi-dashboard también.
    const { data: benPropio } = await admin
      .from('beneficiarios')
      .select('id, nombre')
      .ilike('email', emailNorm)
      .maybeSingle()
    return {
      role: roleRow.role as 'owner' | 'admin',
      userId: user.id,
      email: user.email,
      beneficiarioId: benPropio?.id ?? null,
      ...(benPropio ? { nombreSocio: benPropio.nombre } : {}),
    }
  }

  const { data: ben } = await admin
    .from('beneficiarios')
    .select('id, nombre')
    .ilike('email', emailNorm)
    .maybeSingle()
  if (ben) {
    return { role: 'socio', userId: user.id, email: user.email, beneficiarioId: ben.id, nombreSocio: ben.nombre }
  }

  return { role: null, userId: user.id, email: user.email, beneficiarioId: null }
}

export function isStaff(ctx: ViewerContext): ctx is Extract<ViewerContext, { role: 'owner' | 'admin' }> {
  return ctx.role === 'owner' || ctx.role === 'admin'
}
