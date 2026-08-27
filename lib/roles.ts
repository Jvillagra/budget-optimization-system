import 'server-only'
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
 */
export async function getViewerContext(): Promise<ViewerContext> {
  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) return { role: null, userId: null, email: null, beneficiarioId: null }

  const admin = getSupabaseAdmin()

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
      .eq('email', user.email)
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
    .eq('email', user.email)
    .maybeSingle()
  if (ben) {
    return { role: 'socio', userId: user.id, email: user.email, beneficiarioId: ben.id, nombreSocio: ben.nombre }
  }

  return { role: null, userId: user.id, email: user.email, beneficiarioId: null }
}

export function isStaff(ctx: ViewerContext): ctx is Extract<ViewerContext, { role: 'owner' | 'admin' }> {
  return ctx.role === 'owner' || ctx.role === 'admin'
}
