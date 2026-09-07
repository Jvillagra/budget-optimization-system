import { NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

// Revierte la marca de "compra completa" (por ejemplo, si se aprobó por
// error o hay que revisar de nuevo). No borra fotos ni asignaciones.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params
  const admin = getSupabaseAdmin()

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('beneficiarios')
    .update({ compra_completa: false, compra_completa_at: now, compra_completa_by: ctx.userId })
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) {
    console.error('revertir update', error)
    return NextResponse.json({ error: 'No se pudo revertir la marca' }, { status: 400 })
  }
  if (!data) return NextResponse.json({ error: 'Beneficiario inexistente' }, { status: 404 })

  await logAudit('beneficiarios', 'update', id, {
    compra_completa: false,
    actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })
  return NextResponse.json({ data })
}
