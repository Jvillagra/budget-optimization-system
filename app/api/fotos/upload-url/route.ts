import { NextRequest, NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { validarTipoYTamano, urlFirmadaSubida, MAX_FOTOS_POR_SOCIO } from '@/lib/r2'
import { randomUUID } from 'crypto'

const EXT_POR_TIPO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

// Paso 1 de la subida: se pide una URL firmada de PUT. El archivo sube
// directo del navegador a Cloudflare R2 (no pasa por este servidor).
//  - socio: siempre para sí mismo (ignora cualquier beneficiarioId del body).
//  - staff (owner/admin): puede subir en nombre de cualquier beneficiario,
//    indicado explícitamente en el body -- caso de socios sin experiencia
//    digital o sin correo, a quienes un admin les carga la foto desde /rendicion.
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

  const contentType = body?.contentType
  const size = Number(body?.size)

  if (typeof contentType !== 'string' || !Number.isFinite(size)) {
    return NextResponse.json({ error: 'contentType y size son requeridos' }, { status: 400 })
  }
  const errorValidacion = validarTipoYTamano(contentType, size)
  if (errorValidacion) return NextResponse.json({ error: errorValidacion }, { status: 400 })

  const admin = getSupabaseAdmin()
  const { count } = await admin
    .from('fotos_compra')
    .select('id', { count: 'exact', head: true })
    .eq('beneficiario_id', beneficiarioId)
  if ((count ?? 0) >= MAX_FOTOS_POR_SOCIO) {
    return NextResponse.json({ error: `Ya tienes el máximo de ${MAX_FOTOS_POR_SOCIO} fotos.` }, { status: 400 })
  }

  const ext = EXT_POR_TIPO[contentType] ?? 'jpg'
  const key = `${beneficiarioId}/${randomUUID()}.${ext}`
  const uploadUrl = await urlFirmadaSubida(key, contentType)

  return NextResponse.json({ uploadUrl, key })
}
