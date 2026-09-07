import { NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { EMAIL_QA_SOCIO } from '@/lib/constants'
import type { Beneficiario } from '@/lib/types'

// Único punto de lectura para el cliente. Antes cada página pegaba directo a
// Supabase con la anon key (visible en el bundle) -- cualquiera que la
// extrajera podía leer todo sin pasar por el password gate de la app (ver
// SELECT-only en 004_rls_write_lockdown.sql). Ahora las lecturas también
// pasan por acá con service_role, detrás del mismo gate que las escrituras;
// la anon key ya no tiene ningún uso legítimo en el cliente.

export async function GET() {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

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
    console.error('data GET', error)
    return NextResponse.json({ error: 'Error al cargar los datos' }, { status: 500 })
  }

  // Oculto de las vistas staff: desde la migración 009 la marca es la
  // columna `es_prueba`, no un email hardcodeado. El filtro por email queda
  // de respaldo por si la migración no se aplicó todavía en algún entorno.
  const beneficiariosVisibles = ((beneficiarios ?? []) as (Beneficiario & { es_prueba?: boolean })[])
    .filter(ben => ben.es_prueba !== true && (ben.email?.toLowerCase() ?? null) !== EMAIL_QA_SOCIO)

  return NextResponse.json({
    proveedores,
    beneficiarios: beneficiariosVisibles,
    catalogoInsumos,
    asignaciones,
    ayudaMemoria,
    preciosProveedor,
  })
}
