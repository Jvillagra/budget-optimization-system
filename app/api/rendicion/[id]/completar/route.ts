import { NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'
import { FOTOS_REQUERIDAS } from '@/lib/constants'

// Marca un beneficiario como "compra completa" para la rendición.
// Validación server-side de FOTOS_REQUERIDAS -- el front también deshabilita
// el botón, pero esta es la barrera real (el front se puede saltar).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const admin = getSupabaseAdmin()

  const { count, error: countError } = await admin
    .from('fotos_compra')
    .select('id', { count: 'exact', head: true })
    .eq('beneficiario_id', id)
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })

  if ((count ?? 0) < FOTOS_REQUERIDAS) {
    return NextResponse.json(
      { error: `Faltan fotos: tiene ${count ?? 0} de ${FOTOS_REQUERIDAS} requeridas.` },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('beneficiarios')
    .update({ compra_completa: true, compra_completa_at: now, compra_completa_by: ctx.userId })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await logAudit('beneficiarios', 'update', id, { compra_completa: true, by: ctx.userId })
  return NextResponse.json({ data })
}
