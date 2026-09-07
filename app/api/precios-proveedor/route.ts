import { NextRequest, NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const ctx = await getViewerContext(); if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

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

  const admin = getSupabaseAdmin()
  const { data: previo } = await admin
    .from('precios_proveedor')
    .select('precio_unitario')
    .eq('proveedor_id', proveedor_id)
    .eq('insumo_id', insumo_id)
    .maybeSingle()

  const { error } = await admin
    .from('precios_proveedor')
    .upsert({ proveedor_id, insumo_id, precio_unitario }, { onConflict: 'proveedor_id,insumo_id' })

  if (error) {
    console.error('precios-proveedor POST', error)
    return NextResponse.json({ error: 'No se pudo guardar el precio' }, { status: 400 })
  }

  // El precio anterior es el dato que importa en una auditoría de compras:
  // sin él, el log solo dice que alguien tocó una celda.
  await logAudit('precios_proveedor', 'update', `${proveedor_id}_${insumo_id}`, {
    precio_anterior: previo?.precio_unitario ?? null,
    precio_unitario,
    actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })
  return NextResponse.json({ ok: true })
}
