import 'server-only'
import { createHash } from 'crypto'
import { getSupabaseAdmin } from './supabase-admin'
import { urlFirmadaLectura } from './r2'
import type { Beneficiario, Asignacion, Proveedor, PrecioProveedor } from './types'

// Datos propios de un socio. Los consumen /api/mi-dashboard y la página
// server-side app/mi-dashboard/page.tsx, que es la que resuelve la PRIMERA
// carga -- antes el navegador tenía que hidratar y recién ahí disparar dos
// fetch encadenados (/api/mi-dashboard y /api/fotos), cada uno pasando de
// nuevo por el gate de sesión.

// Gravatar: servicio público que asocia una foto de perfil a un email por
// hash MD5, sin necesitar login OAuth (el proyecto solo tiene Magic Link).
// d=404 hace que la URL falle si el socio nunca configuró una -- el cliente
// cae a un avatar de iniciales en el onError, no hay estado "cargando" falso.
function gravatarUrl(email: string): string {
  const hash = createHash('md5').update(email.trim().toLowerCase()).digest('hex')
  return `https://www.gravatar.com/avatar/${hash}?s=160&d=404`
}

export type FotoSocio = { id: string; uploaded_at: string; url: string }

export type MiDashboardData = {
  beneficiario: Beneficiario
  asignaciones: Asignacion[]
  proveedores: Proveedor[]
  preciosProveedor: PrecioProveedor[]
  avatarUrl: string | null
}

export async function cargarMiDashboard(beneficiarioId: string): Promise<
  { ok: true; data: MiDashboardData } | { ok: false; error: unknown }
> {
  const admin = getSupabaseAdmin()

  const [
    { data: beneficiario, error: e1 },
    { data: asignaciones, error: e2 },
    { data: proveedores, error: e3 },
    { data: preciosProveedor, error: e4 },
  ] = await Promise.all([
    admin.from('beneficiarios').select('*').eq('id', beneficiarioId).single(),
    admin.from('asignaciones').select('*, catalogo_insumos(*)').eq('beneficiario_id', beneficiarioId),
    admin.from('proveedores').select('*').eq('es_activo', true).order('nombre'),
    admin.from('precios_proveedor').select('*'),
  ])

  const error = e1 || e2 || e3 || e4
  if (error) return { ok: false, error }

  // Si ya hay un proveedor real de compra registrado (staff lo setea en
  // /rendicion), se excluye del selector -- ya no tiene sentido "comparar"
  // con un proveedor con el que el socio ya no puede comprar el mismo insumo.
  const proveedoresDisponibles = beneficiario?.proveedor_compra_id
    ? (proveedores ?? []).filter(p => p.id !== beneficiario.proveedor_compra_id)
    : (proveedores ?? [])

  return {
    ok: true,
    data: {
      // El cliente de Supabase tipa `segmento` como string; Beneficiario lo
      // estrecha a la union Segmento (la columna tiene el CHECK que lo
      // garantiza, ver supabase/migrations).
      beneficiario: beneficiario as Beneficiario,
      asignaciones: (asignaciones ?? []) as Asignacion[],
      proveedores: proveedoresDisponibles as Proveedor[],
      preciosProveedor: (preciosProveedor ?? []) as PrecioProveedor[],
      avatarUrl: beneficiario?.email ? gravatarUrl(beneficiario.email) : null,
    },
  }
}

/** Fotos de comprobante de un beneficiario, con URL firmada de lectura. */
export async function cargarFotosDeBeneficiario(beneficiarioId: string): Promise<FotoSocio[]> {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('fotos_compra')
    .select('id, r2_key, uploaded_at')
    .eq('beneficiario_id', beneficiarioId)
    .order('uploaded_at', { ascending: true })

  if (error) {
    console.error('cargarFotosDeBeneficiario', error)
    return []
  }

  return Promise.all(
    (data ?? []).map(async f => ({
      id: f.id,
      uploaded_at: f.uploaded_at,
      url: await urlFirmadaLectura(f.r2_key),
    }))
  )
}
