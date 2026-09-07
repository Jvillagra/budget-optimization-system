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
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params
  const admin = getSupabaseAdmin()

  const { count, error: countError } = await admin
    .from('fotos_compra')
    .select('id', { count: 'exact', head: true })
    .eq('beneficiario_id', id)
  if (countError) {
    console.error('completar count', countError)
    return NextResponse.json({ error: 'Error al verificar las fotos' }, { status: 500 })
  }

  if ((count ?? 0) < FOTOS_REQUERIDAS) {
    return NextResponse.json(
      { error: `Faltan fotos: tiene ${count ?? 0} de ${FOTOS_REQUERIDAS} requeridas.` },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()
  // maybeSingle + chequeo explícito: con .single(), un id inexistente
  // devolvía un error de Postgres crudo con status 400 en vez de un 404.
  const { data, error } = await admin
    .from('beneficiarios')
    .update({ compra_completa: true, compra_completa_at: now, compra_completa_by: ctx.userId })
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) {
    console.error('completar update', error)
    return NextResponse.json({ error: 'No se pudo marcar como completo' }, { status: 400 })
  }
  if (!data) return NextResponse.json({ error: 'Beneficiario inexistente' }, { status: 404 })

  await logAudit('beneficiarios', 'update', id, {
    compra_completa: true, fotos: count ?? 0,
    actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })
  return NextResponse.json({ data })
}
