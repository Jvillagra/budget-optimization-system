import { NextRequest, NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'
import { segmentosConfirmados } from '@/lib/compras-segmento'
import type { Segmento } from '@/lib/types'

/** 409 si el segmento del beneficiario ya tiene la compra confirmada: a esa
 *  altura las cantidades son lo que se compro de verdad, y cambiarlas
 *  descuadraria la rendicion. Se revierte la compra primero. */
async function bloqueadoPorCompra(beneficiario_id: string): Promise<string | null> {
  const { data: ben } = await getSupabaseAdmin()
    .from('beneficiarios').select('segmento').eq('id', beneficiario_id).maybeSingle()
  if (!ben) return null
  const confirmados = await segmentosConfirmados()
  return confirmados.has(ben.segmento as Segmento)
    ? `${ben.segmento} ya tiene la compra confirmada. Revierte la compra para cambiar las cantidades.`
    : null
}

// Toda escritura de negocio pasa por acá con el service_role key -- la anon
// key del cliente ya NO tiene permiso de INSERT/UPDATE/DELETE en Postgres
// (ver supabase/migrations/004_rls_write_lockdown.sql). Esto también permite
// validar la forma del payload en un solo lugar, algo que un simple
// `check (true)` de RLS no puede hacer.

export async function POST(req: NextRequest) {
  const ctx = await getViewerContext(); if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const beneficiario_id = body?.beneficiario_id
  const insumo_id = body?.insumo_id
  const cantidad = Number(body?.cantidad)

  if (typeof beneficiario_id !== 'string' || typeof insumo_id !== 'string') {
    return NextResponse.json({ error: 'beneficiario_id e insumo_id son requeridos' }, { status: 400 })
  }
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return NextResponse.json({ error: 'cantidad debe ser un entero positivo' }, { status: 400 })
  }

  const bloqueo = await bloqueadoPorCompra(beneficiario_id)
  if (bloqueo) return NextResponse.json({ error: bloqueo }, { status: 409 })

  // Un insumo tiene UNA fila por socio (migración 012: unique
  // beneficiario_id+insumo_id). Si ya está en el carrito, "Agregar" suma
  // sobre la cantidad existente en vez de abrir una segunda línea -- que es
  // lo que el staff espera al apretar el botón dos veces, y lo que evita que
  // vuelvan a aparecer carritos como el de Ana Luz Huisca, con el mismo
  // insumo repetido tres veces y un conteo de ítems que no significaba nada.
  const admin = getSupabaseAdmin()
  const { data: existente } = await admin
    .from('asignaciones')
    .select('id, cantidad')
    .eq('beneficiario_id', beneficiario_id)
    .eq('insumo_id', insumo_id)
    .maybeSingle()

  if (existente) {
    const previa = (existente as { id: string; cantidad: number }).cantidad
    const nuevaCantidad = previa + cantidad
    const { data, error } = await admin
      .from('asignaciones')
      .update({ cantidad: nuevaCantidad })
      .eq('id', (existente as { id: string }).id)
      .select('*, catalogo_insumos(*)')
      .single()

    if (error || !data) {
      console.error('asignaciones POST (suma)', error)
      return NextResponse.json({ error: 'No se pudo actualizar la asignación' }, { status: 400 })
    }

    await logAudit('asignaciones', 'update', (existente as { id: string }).id, {
      beneficiario_id, insumo_id, cantidad_anterior: previa, cantidad_agregada: cantidad,
      cantidad: nuevaCantidad,
      actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
    })
    return NextResponse.json({ data })
  }

  const { data, error } = await admin
    .from('asignaciones')
    .insert({ beneficiario_id, insumo_id, cantidad })
    .select('*, catalogo_insumos(*)')
    .single()

  if (error || !data) {
    console.error('asignaciones POST', error)
    return NextResponse.json({ error: 'No se pudo crear la asignación' }, { status: 400 })
  }

  const row = data as unknown as { id: string }
  await logAudit('asignaciones', 'insert', row.id, {
    beneficiario_id, insumo_id, cantidad,
    actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })
  return NextResponse.json({ data })
}

export async function DELETE(req: NextRequest) {
  const ctx = await getViewerContext(); if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })

  // Se lee la fila ANTES de borrarla: el audit_log guardaba payload null,
  // así que quedaba un row_id que ya no resuelve a nada y ningún registro de
  // qué se borró. Un log así no sirve para auditar.
  const admin = getSupabaseAdmin()
  const { data: previa } = await admin
    .from('asignaciones')
    .select('*, catalogo_insumos(*)')
    .eq('id', id)
    .maybeSingle()
  if (!previa) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const bloqueo = await bloqueadoPorCompra((previa as { beneficiario_id: string }).beneficiario_id)
  if (bloqueo) return NextResponse.json({ error: bloqueo }, { status: 409 })

  const { error } = await admin.from('asignaciones').delete().eq('id', id)
  if (error) {
    console.error('asignaciones DELETE', error)
    return NextResponse.json({ error: 'No se pudo eliminar la asignación' }, { status: 400 })
  }

  await logAudit('asignaciones', 'delete', id, {
    anterior: previa,
    actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })
  return NextResponse.json({ ok: true })
}

/** Cambia la cantidad de una línea existente. Es lo que necesita quien mira
 *  el carrito y ve "Polines × 13": corregir el 13, no agregar y restar.
 *
 *  Un insumo tiene UNA fila por socio (migración 012), así que `id` alcanza.
 *  La cantidad de polines escrita a mano dura hasta el siguiente cambio de
 *  precio: los polines son el saldo (lib/business-logic.ts, ajuste). */
export async function PATCH(req: NextRequest) {
  const ctx = await getViewerContext(); if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const id = body?.id
  const cantidad = Number(body?.cantidad)
  if (typeof id !== 'string') return NextResponse.json({ error: 'id es requerido' }, { status: 400 })
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return NextResponse.json({ error: 'cantidad debe ser un entero positivo' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: previa } = await admin
    .from('asignaciones')
    .select('*, catalogo_insumos(*)')
    .eq('id', id)
    .maybeSingle()
  if (!previa) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const fila = previa as { beneficiario_id: string; insumo_id: string; cantidad: number }
  const bloqueo = await bloqueadoPorCompra(fila.beneficiario_id)
  if (bloqueo) return NextResponse.json({ error: bloqueo }, { status: 409 })

  const { data, error } = await admin
    .from('asignaciones')
    .update({ cantidad })
    .eq('id', id)
    .select('*, catalogo_insumos(*)')
    .single()

  if (error || !data) {
    console.error('asignaciones PATCH', error)
    return NextResponse.json({ error: 'No se pudo actualizar la línea' }, { status: 400 })
  }

  await logAudit('asignaciones', 'update', id, {
    beneficiario_id: fila.beneficiario_id, insumo_id: fila.insumo_id,
    cantidad_anterior: fila.cantidad, cantidad,
    actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })
  return NextResponse.json({ data })
}
