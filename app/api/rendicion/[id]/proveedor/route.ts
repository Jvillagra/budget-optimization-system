import { NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

// Setea (o limpia, con proveedorId null) el proveedor REAL con el que un
// beneficiario compró. Distinto de "marcar completo": esto es un dato,
// no un estado -- puede setearse antes o después de compra_completa.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { proveedorId } = await req.json() as { proveedorId: string | null }

  const admin = getSupabaseAdmin()

  if (proveedorId) {
    const { data: proveedor, error: provError } = await admin
      .from('proveedores')
      .select('id')
      .eq('id', proveedorId)
      .eq('es_activo', true)
      .maybeSingle()
    if (provError) return NextResponse.json({ error: provError.message }, { status: 500 })
    if (!proveedor) return NextResponse.json({ error: 'Proveedor inválido o inactivo' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('beneficiarios')
    .update({ proveedor_compra_id: proveedorId })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await logAudit('beneficiarios', 'update', id, { proveedor_compra_id: proveedorId, by: ctx.userId })
  return NextResponse.json({ data })
}
