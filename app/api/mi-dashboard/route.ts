import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { getViewerContext } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Gravatar: servicio público que asocia una foto de perfil a un email por
// hash MD5, sin necesitar login OAuth (el proyecto solo tiene Magic Link).
// d=404 hace que la URL falle si el socio nunca configuró una -- el cliente
// cae a un avatar de iniciales en el onError, no hay estado "cargando" falso.
function gravatarUrl(email: string): string {
  const hash = createHash('md5').update(email.trim().toLowerCase()).digest('hex')
  return `https://www.gravatar.com/avatar/${hash}?s=160&d=404`
}

// Datos propios de un socio -- nunca expone datos de otros beneficiarios.
// Incluye proveedores/precios (info pública de catálogo, no sensible) para
// poder calcular su costo total con la misma lógica que ya usa el resto de
// la app (lib/business-logic.ts calcularCostoCarrito).
export async function GET() {
  const ctx = await getViewerContext()
  if (ctx.role !== 'socio') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = getSupabaseAdmin()

  const [
    { data: beneficiario, error: e1 },
    { data: asignaciones, error: e2 },
    { data: proveedores, error: e3 },
    { data: preciosProveedor, error: e4 },
  ] = await Promise.all([
    admin.from('beneficiarios').select('*').eq('id', ctx.beneficiarioId).single(),
    admin.from('asignaciones').select('*, catalogo_insumos(*)').eq('beneficiario_id', ctx.beneficiarioId),
    admin.from('proveedores').select('*').eq('es_activo', true).order('nombre'),
    admin.from('precios_proveedor').select('*'),
  ])

  const error = e1 || e2 || e3 || e4
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si ya hay un proveedor real de compra registrado (staff lo setea en
  // /rendicion), se excluye del selector -- ya no tiene sentido "comparar"
  // con un proveedor con el que el socio ya no puede comprar el mismo insumo.
  const proveedoresDisponibles = beneficiario?.proveedor_compra_id
    ? (proveedores ?? []).filter(p => p.id !== beneficiario.proveedor_compra_id)
    : proveedores

  const avatarUrl = beneficiario?.email ? gravatarUrl(beneficiario.email) : null

  return NextResponse.json({ beneficiario, asignaciones, proveedores: proveedoresDisponibles, preciosProveedor, avatarUrl })
}
