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
// e inserta el metadato.
//  - socio: solo para sí mismo (ignora cualquier beneficiarioId del body).
//  - staff: puede confirmar en nombre de cualquier beneficiario (mismo
//    patrón que el GET), indicado en el body.
export async function POST(req: NextRequest) {
  const ctx = await getViewerContext()

  const body = await req.json().catch(() => null)

  let beneficiarioId: string
  if (ctx.role === 'socio') {
    beneficiarioId = ctx.beneficiarioId
  } else if (isStaff(ctx)) {
    const bid = body?.beneficiarioId
    if (typeof bid !== 'string' || !bid) {
      return NextResponse.json({ error: 'beneficiarioId es requerido' }, { status: 400 })
    }
    beneficiarioId = bid
  } else {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const key = body?.key
  if (typeof key !== 'string' || !key.startsWith(`${beneficiarioId}/`)) {
    return NextResponse.json({ error: 'key inválida' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { count } = await admin
    .from('fotos_compra')
    .select('id', { count: 'exact', head: true })
    .eq('beneficiario_id', beneficiarioId)
  if ((count ?? 0) >= MAX_FOTOS_POR_SOCIO) {
    return NextResponse.json({ error: `Ya tienes el máximo de ${MAX_FOTOS_POR_SOCIO} fotos.` }, { status: 400 })
  }

  const { data, error } = await admin
    .from('fotos_compra')
    .insert({ beneficiario_id: beneficiarioId, r2_key: key })
    .select('id, uploaded_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Si quien sube es staff en nombre de otro, se deja trazado quién ejecutó
  // la acción (no solo el beneficiario dueño de la foto).
  const payload: Record<string, unknown> = { beneficiario_id: beneficiarioId, r2_key: key }
  if (isStaff(ctx)) payload.actor = { email: ctx.email, userId: ctx.userId, role: ctx.role }

  await logAudit('fotos_compra', 'insert', data.id, payload)
  return NextResponse.json({ data })
}

// DELETE: el socio borra su propia foto; el staff puede borrar la foto de
// cualquier beneficiario (mismo criterio que el GET, sin restringir a uno).
export async function DELETE(req: NextRequest) {
  const ctx = await getViewerContext()
  if (ctx.role !== 'socio' && !isStaff(ctx)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const { data: foto } = await admin
    .from('fotos_compra')
    .select('id, r2_key, beneficiario_id')
    .eq('id', id)
    .maybeSingle()

  const puedeBorrar = foto && (isStaff(ctx) || foto.beneficiario_id === ctx.beneficiarioId)
  if (!puedeBorrar) {
    return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  }

  await borrarFoto(foto.r2_key)
  const { error } = await admin.from('fotos_compra').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const payload: Record<string, unknown> | null = isStaff(ctx)
    ? { beneficiario_id: foto.beneficiario_id, actor: { email: ctx.email, userId: ctx.userId, role: ctx.role } }
    : null
  await logAudit('fotos_compra', 'delete', id, payload)
  return NextResponse.json({ ok: true })
}
