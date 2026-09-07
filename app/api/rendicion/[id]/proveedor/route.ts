import { NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

// Setea (o limpia, con proveedorId null) el proveedor REAL con el que un
// beneficiario compró. Distinto de "marcar completo": esto es un dato,
// no un estado -- puede setearse antes o después de compra_completa.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params

  // Antes se hacía `await req.json() as { proveedorId }` sin red: un body
  // vacío o mal formado tiraba una excepción no controlada (500).
  const body = await req.json().catch(() => null)
  const proveedorId = body?.proveedorId ?? null
  if (proveedorId !== null && typeof proveedorId !== 'string') {
    return NextResponse.json({ error: 'proveedorId inválido' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  if (proveedorId) {
    const { data: proveedor, error: provError } = await admin
      .from('proveedores')
      .select('id')
      .eq('id', proveedorId)
      .eq('es_activo', true)
      .maybeSingle()
    if (provError) {
      console.error('proveedor lookup', provError)
      return NextResponse.json({ error: 'Error al validar el proveedor' }, { status: 500 })
    }
    if (!proveedor) return NextResponse.json({ error: 'Proveedor inválido o inactivo' }, { status: 400 })
  }

  const { data: previo } = await admin
    .from('beneficiarios')
    .select('proveedor_compra_id')
    .eq('id', id)
    .maybeSingle()

  const { data, error } = await admin
    .from('beneficiarios')
    .update({ proveedor_compra_id: proveedorId })
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) {
    console.error('proveedor update', error)
    return NextResponse.json({ error: 'No se pudo registrar el proveedor' }, { status: 400 })
  }
  if (!data) return NextResponse.json({ error: 'Beneficiario inexistente' }, { status: 404 })

  await logAudit('beneficiarios', 'update', id, {
    proveedor_compra_id_anterior: previo?.proveedor_compra_id ?? null,
    proveedor_compra_id: proveedorId,
    actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })
  return NextResponse.json({ data })
}
