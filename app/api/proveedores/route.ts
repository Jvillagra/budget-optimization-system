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
  if (typeof id !== 'string') return NextResponse.json({ error: 'id es requerido' }, { status: 400 })

  // Renombrar y desactivar/reactivar son el mismo PATCH: cada campo se toca
  // solo si viene en el body, para que renombrar no reactive por accidente
  // un proveedor apagado (ni al reves).
  const cambios: { nombre?: string; es_activo?: boolean } = {}
  if (body?.nombre !== undefined) {
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
    if (!nombre) return NextResponse.json({ error: 'El nombre no puede quedar vacio' }, { status: 400 })
    cambios.nombre = nombre
  }
  if (body?.es_activo !== undefined) {
    if (typeof body.es_activo !== 'boolean') {
      return NextResponse.json({ error: 'es_activo debe ser booleano' }, { status: 400 })
    }
    cambios.es_activo = body.es_activo
  }
  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: previo } = await admin.from('proveedores').select('nombre, es_activo').eq('id', id).maybeSingle()
  if (!previo) return NextResponse.json({ error: 'Proveedor inexistente' }, { status: 404 })

  // Desactivar es la version reversible de "eliminar": no se borra nada, se
  // saca de los selectores. Pero si un segmento ya cerro su compra con este
  // proveedor, apagarlo dejaria esa compra apuntando a un proveedor que la
  // app ya no ofrece -- se bloquea hasta revertir la compra.
  if (cambios.es_activo === false) {
    const { data: comprometido } = await admin
      .from('compras_segmento').select('segmento').eq('proveedor_id', id)
    if (comprometido && comprometido.length > 0) {
      return NextResponse.json(
        { error: `No se puede desactivar: es el proveedor de la compra confirmada de ${comprometido.map(c => c.segmento).join(' y ')}.` },
        { status: 409 }
      )
    }
  }

  const { error } = await admin.from('proveedores').update(cambios).eq('id', id)
  if (error) {
    console.error('proveedores PATCH', error)
    return NextResponse.json({ error: 'No se pudo actualizar el proveedor' }, { status: 400 })
  }

  await logAudit('proveedores', 'update', id, {
    anterior: previo, cambios,
    actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })
  return NextResponse.json({ ok: true })
}
