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

/** Marca o desmarca una línea como "la paga el socio de su bolsillo"
 *  (migración 014). Es lo único que se puede cambiar de una línea existente:
 *  la cantidad se toca agregando (POST, que suma) o eliminando, y desde el
 *  2026-09-14 también la mueve el ajuste automático al presupuesto.
 *
 *  Por qué es un atributo de la línea y no una línea aparte: `asignaciones`
 *  tiene unique(beneficiario_id, insumo_id) desde la migración 012, así que
 *  un mismo insumo no puede estar dos veces en el carrito de un socio. Marcar
 *  la línea mueve TODA su cantidad al bolsillo del socio. */
export async function PATCH(req: NextRequest) {
  const ctx = await getViewerContext(); if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const id = body?.id
  const es_extra = body?.es_extra
  if (typeof id !== 'string') return NextResponse.json({ error: 'id es requerido' }, { status: 400 })
  if (typeof es_extra !== 'boolean') return NextResponse.json({ error: 'es_extra debe ser true o false' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const { data: previa } = await admin
    .from('asignaciones')
    .select('*, catalogo_insumos(*)')
    .eq('id', id)
    .maybeSingle()
  if (!previa) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const fila = previa as { beneficiario_id: string; es_extra?: boolean }
  const bloqueo = await bloqueadoPorCompra(fila.beneficiario_id)
  if (bloqueo) return NextResponse.json({ error: bloqueo }, { status: 409 })

  const { data, error } = await admin
    .from('asignaciones')
    .update({ es_extra })
    .eq('id', id)
    .select('*, catalogo_insumos(*)')
    .single()

  if (error || !data) {
    console.error('asignaciones PATCH', error)
    return NextResponse.json({ error: 'No se pudo actualizar la línea' }, { status: 400 })
  }

  await logAudit('asignaciones', 'update', id, {
    cambios: { es_extra },
    anterior: { es_extra: fila.es_extra === true },
    beneficiario_id: fila.beneficiario_id,
    actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })
  return NextResponse.json({ data })
}
