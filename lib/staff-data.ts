import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import { EMAIL_QA_SOCIO } from './constants'
import type { Beneficiario, CatalogoInsumo, Asignacion, AyudaMemoria, Proveedor, PrecioProveedor } from './types'

// Datos que comparten las pantallas de staff (beneficiarios, precios,
// simulador). Los consumen las páginas server-side (app/<ruta>/page.tsx) y
// GET /api/data, que queda para el refresco desde el cliente.
//
// Antes cada una de esas pantallas era 'use client' y pedía /api/data al
// montar: en una navegación eso eran tres saltos en serie -- RSC de la
// página, chunk JS, y recién ahí el fetch (que volvía a pasar por el gate
// de sesión) -- medidos en 1,0-1,5 s desde Chile con buena conexión. Con
// los datos dentro del RSC queda un salto menos y ninguna llamada extra.

export type DatosStaff = {
  proveedores: Proveedor[]
  beneficiarios: Beneficiario[]
  catalogoInsumos: CatalogoInsumo[]
  asignaciones: Asignacion[]
  ayudaMemoria: AyudaMemoria[]
  preciosProveedor: PrecioProveedor[]
}

/** null si alguna consulta falló (ya logueado). Quien llama decide qué mostrar. */
export async function cargarDatosStaff(): Promise<DatosStaff | null> {
  const admin = getSupabaseAdmin()

  const [
    { data: proveedores, error: e1 },
    { data: beneficiarios, error: e2 },
    { data: catalogoInsumos, error: e3 },
    { data: asignaciones, error: e4 },
    { data: ayudaMemoria, error: e5 },
    { data: preciosProveedor, error: e6 },
  ] = await Promise.all([
    admin.from('proveedores').select('*').eq('es_activo', true).order('nombre'),
    admin.from('beneficiarios').select('*').order('segmento').order('nombre'),
    admin.from('catalogo_insumos').select('*').order('segmento').order('nombre'),
    admin.from('asignaciones').select('*, catalogo_insumos(*)'),
    admin.from('ayuda_memoria').select('*, catalogo_insumos(*)'),
    admin.from('precios_proveedor').select('*'),
  ])

  const error = e1 || e2 || e3 || e4 || e5 || e6
  if (error) {
    console.error('cargarDatosStaff', error)
    return null
  }

  // Oculto de las vistas staff: desde la migración 009 la marca es la
  // columna `es_prueba`, no un email hardcodeado. El filtro por email queda
  // de respaldo por si la migración no se aplicó todavía en algún entorno.
  const beneficiariosVisibles = ((beneficiarios ?? []) as (Beneficiario & { es_prueba?: boolean })[])
    .filter(ben => ben.es_prueba !== true && (ben.email?.toLowerCase() ?? null) !== EMAIL_QA_SOCIO)

  return {
    proveedores: (proveedores ?? []) as Proveedor[],
    beneficiarios: beneficiariosVisibles,
    catalogoInsumos: (catalogoInsumos ?? []) as CatalogoInsumo[],
    asignaciones: (asignaciones ?? []) as Asignacion[],
    ayudaMemoria: (ayudaMemoria ?? []) as AyudaMemoria[],
    preciosProveedor: (preciosProveedor ?? []) as PrecioProveedor[],
  }
}

export type RoleRow = { user_id: string; role: string; email: string }

/** Owners/admins con su email resuelto desde auth.users. La consumen
 *  app/admin/page.tsx (server) y GET /api/admin/roles (refresco). */
export async function cargarRoles(): Promise<RoleRow[] | null> {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from('app_roles').select('user_id, role, created_at').order('created_at')
  if (error) {
    console.error('cargarRoles', error)
    return null
  }
  const { data: usersData } = await admin.auth.admin.listUsers()
  const emailPorId = new Map((usersData?.users ?? []).map(u => [u.id, u.email]))
  return (data ?? []).map(r => ({ user_id: r.user_id, role: r.role, email: emailPorId.get(r.user_id) ?? '(sin login todavía)' }))
}
