import { NextRequest, NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const ctx = await getViewerContext(); if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : ''
  if (!nombre) return NextResponse.json({ error: 'nombre es requerido' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin()
    .from('proveedores')
    .insert({ nombre, es_activo: true })
    .select()
    .single()

  if (error || !data) {
    console.error('proveedores POST', error)
    return NextResponse.json({ error: 'No se pudo crear el proveedor' }, { status: 400 })
  }

  await logAudit('proveedores', 'insert', data.id, {
    nombre, actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getViewerContext(); if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const id = body?.id
  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : ''
  if (typeof id !== 'string' || !nombre) {
    return NextResponse.json({ error: 'id y nombre son requeridos' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: previo } = await admin.from('proveedores').select('nombre').eq('id', id).maybeSingle()
  if (!previo) return NextResponse.json({ error: 'Proveedor inexistente' }, { status: 404 })

  const { error } = await admin.from('proveedores').update({ nombre }).eq('id', id)
  if (error) {
    console.error('proveedores PATCH', error)
    return NextResponse.json({ error: 'No se pudo actualizar el proveedor' }, { status: 400 })
  }

  await logAudit('proveedores', 'update', id, {
    nombre_anterior: previo.nombre, nombre,
    actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })
  return NextResponse.json({ ok: true })
}
