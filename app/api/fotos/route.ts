import { NextRequest, NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { urlFirmadaLectura, borrarFoto, MAX_FOTOS_POR_SOCIO } from '@/lib/r2'
import { logAudit } from '@/lib/audit'

// GET: lista de fotos con URL firmada de lectura.
//  - socio: siempre las suyas.
//  - owner/admin: las de cualquier beneficiario, vía ?beneficiarioId=.
export async function GET(req: NextRequest) {
  const ctx = await getViewerContext()
  if (!ctx.role) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let beneficiarioId: string
  if (ctx.role === 'socio') {
    beneficiarioId = ctx.beneficiarioId
  } else if (isStaff(ctx)) {
    const qp = req.nextUrl.searchParams.get('beneficiarioId')
    if (!qp) return NextResponse.json({ error: 'beneficiarioId es requerido' }, { status: 400 })
    beneficiarioId = qp
  } else {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('fotos_compra')
    .select('id, r2_key, uploaded_at')
    .eq('beneficiario_id', beneficiarioId)
    .order('uploaded_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const fotos = await Promise.all(
    (data ?? []).map(async f => ({
      id: f.id,
      uploaded_at: f.uploaded_at,
      url: await urlFirmadaLectura(f.r2_key),
    }))
  )

  return NextResponse.json({ fotos, max: MAX_FOTOS_POR_SOCIO })
}

// POST: confirma una subida ya hecha directo a R2 (ver /api/fotos/upload-url)
// e inserta el metadato. Solo el propio socio.
export async function POST(req: NextRequest) {
  const ctx = await getViewerContext()
  if (ctx.role !== 'socio') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const key = body?.key
  if (typeof key !== 'string' || !key.startsWith(`${ctx.beneficiarioId}/`)) {
    return NextResponse.json({ error: 'key inválida' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { count } = await admin
    .from('fotos_compra')
    .select('id', { count: 'exact', head: true })
    .eq('beneficiario_id', ctx.beneficiarioId)
  if ((count ?? 0) >= MAX_FOTOS_POR_SOCIO) {
    return NextResponse.json({ error: `Ya tienes el máximo de ${MAX_FOTOS_POR_SOCIO} fotos.` }, { status: 400 })
  }

  const { data, error } = await admin
    .from('fotos_compra')
    .insert({ beneficiario_id: ctx.beneficiarioId, r2_key: key })
    .select('id, uploaded_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await logAudit('fotos_compra', 'insert', data.id, { beneficiario_id: ctx.beneficiarioId, r2_key: key })
  return NextResponse.json({ data })
}

// DELETE: el socio borra su propia foto (borra en R2 y el metadato).
export async function DELETE(req: NextRequest) {
  const ctx = await getViewerContext()
  if (ctx.role !== 'socio') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const { data: foto } = await admin
    .from('fotos_compra')
    .select('id, r2_key, beneficiario_id')
    .eq('id', id)
    .maybeSingle()

  if (!foto || foto.beneficiario_id !== ctx.beneficiarioId) {
    return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  }

  await borrarFoto(foto.r2_key)
  const { error } = await admin.from('fotos_compra').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await logAudit('fotos_compra', 'delete', id, null)
  return NextResponse.json({ ok: true })
}
