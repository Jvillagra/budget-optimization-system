import { NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

// Revierte la marca de "compra completa" (por ejemplo, si se aprobó por
// error o hay que revisar de nuevo). No borra fotos ni asignaciones.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const admin = getSupabaseAdmin()

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('beneficiarios')
    .update({ compra_completa: false, compra_completa_at: now, compra_completa_by: ctx.userId })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await logAudit('beneficiarios', 'update', id, { compra_completa: false, by: ctx.userId })
  return NextResponse.json({ data })
}
