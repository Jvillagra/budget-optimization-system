import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  if (!(await requireAuth(req))) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const proveedor_id = body?.proveedor_id
  const insumo_id = body?.insumo_id
  const precio_unitario = body?.precio_unitario === null ? null : Number(body?.precio_unitario)

  if (typeof proveedor_id !== 'string' || typeof insumo_id !== 'string') {
    return NextResponse.json({ error: 'proveedor_id e insumo_id son requeridos' }, { status: 400 })
  }
  if (precio_unitario !== null && (!Number.isFinite(precio_unitario) || precio_unitario < 0)) {
    return NextResponse.json({ error: 'precio_unitario inválido' }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin()
    .from('precios_proveedor')
    .upsert({ proveedor_id, insumo_id, precio_unitario }, { onConflict: 'proveedor_id,insumo_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await logAudit('precios_proveedor', 'update', `${proveedor_id}_${insumo_id}`, { precio_unitario })
  return NextResponse.json({ ok: true })
}
