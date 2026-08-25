import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

// Toda escritura de negocio pasa por acá con el service_role key -- la anon
// key del cliente ya NO tiene permiso de INSERT/UPDATE/DELETE en Postgres
// (ver supabase/migrations/004_rls_write_lockdown.sql). Esto también permite
// validar la forma del payload en un solo lugar, algo que un simple
// `check (true)` de RLS no puede hacer.

export async function POST(req: NextRequest) {
  if (!(await requireAuth(req))) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const beneficiario_id = body?.beneficiario_id
  const insumo_id = body?.insumo_id
  const cantidad = Number(body?.cantidad)

  if (typeof beneficiario_id !== 'string' || typeof insumo_id !== 'string') {
    return NextResponse.json({ error: 'beneficiario_id e insumo_id son requeridos' }, { status: 400 })
  }
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return NextResponse.json({ error: 'cantidad debe ser un entero positivo' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('asignaciones')
    .insert({ beneficiario_id, insumo_id, cantidad })
    .select('*, catalogo_insumos(*)')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Error al crear la asignación' }, { status: 400 })
  }

  const row = data as unknown as { id: string }
  await logAudit('asignaciones', 'insert', row.id, { beneficiario_id, insumo_id, cantidad })
  return NextResponse.json({ data })
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAuth(req))) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })

  const { error } = await getSupabaseAdmin().from('asignaciones').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await logAudit('asignaciones', 'delete', id, null)
  return NextResponse.json({ ok: true })
}
