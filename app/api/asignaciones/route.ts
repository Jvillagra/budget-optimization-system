import { NextRequest, NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'
import { segmentosConfirmados } from '@/lib/compras-segmento'
import type { Segmento, Proveedor } from '@/lib/types'
import { proveedorPorDefecto } from '@/lib/business-logic'
import { ajustarCarritosDelProveedor } from '@/lib/ajuste-carritos'

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

/** Cambia una línea existente: la cantidad, el proveedor con el que se
 *  cotiza (migración 017; null = el del socio), o los dos.
 *
 *  Un insumo tiene UNA fila por socio (migración 012), así que `id` alcanza.
 *  Cambiar el proveedor reajusta ese carrito al presupuesto ahí mismo: si el
 *  polietileno pasa a un proveedor más caro, los polines tienen que bajar en
 *  la misma operación, o la ficha quedaría sobre presupuesto sin decirlo. La
 *  cantidad de polines escrita a mano dura hasta el siguiente cambio de
 *  precio: los polines son el saldo (lib/business-logic.ts, ajuste). */
export async function PATCH(req: NextRequest) {
  const ctx = await getViewerContext(); if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const id = body?.id
  if (typeof id !== 'string') return NextResponse.json({ error: 'id es requerido' }, { status: 400 })

  const cambios: { cantidad?: number; proveedor_id?: string | null } = {}
  if (body?.cantidad !== undefined) {
    const cantidad = Number(body.cantidad)
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      return NextResponse.json({ error: 'cantidad debe ser un entero positivo' }, { status: 400 })
    }
    cambios.cantidad = cantidad
  }
  const admin = getSupabaseAdmin()
  if (body?.proveedor_id !== undefined) {
    const proveedor_id = body.proveedor_id
    if (proveedor_id !== null && typeof proveedor_id !== 'string') {
      return NextResponse.json({ error: 'proveedor_id debe ser un id o null' }, { status: 400 })
    }
    if (proveedor_id) {
      const { data: prov } = await admin.from('proveedores').select('id, es_activo').eq('id', proveedor_id).maybeSingle()
      if (!prov || !(prov as { es_activo: boolean }).es_activo) {
        return NextResponse.json({ error: 'Ese proveedor no existe o está desactivado' }, { status: 400 })
      }
    }
    cambios.proveedor_id = proveedor_id
  }
  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: 'Nada que cambiar: manda cantidad o proveedor_id' }, { status: 400 })
  }

  const { data: previa } = await admin
    .from('asignaciones')
    .select('*, catalogo_insumos(*)')
    .eq('id', id)
    .maybeSingle()
  if (!previa) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const fila = previa as { beneficiario_id: string; insumo_id: string; cantidad: number; proveedor_id: string | null }
  const bloqueo = await bloqueadoPorCompra(fila.beneficiario_id)
  if (bloqueo) return NextResponse.json({ error: bloqueo }, { status: 409 })

  const { data, error } = await admin
    .from('asignaciones')
    .update(cambios)
    .eq('id', id)
    .select('*, catalogo_insumos(*)')
    .single()

  if (error || !data) {
    console.error('asignaciones PATCH', error)
    return NextResponse.json({ error: 'No se pudo actualizar la línea' }, { status: 400 })
  }

  await logAudit('asignaciones', 'update', id, {
    beneficiario_id: fila.beneficiario_id, insumo_id: fila.insumo_id,
    cambios, anterior: { cantidad: fila.cantidad, proveedor_id: fila.proveedor_id ?? null },
    actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })

  // Con otro proveedor cambia el costo de la línea, y con él el saldo que va
  // a polines. El ajuste se dispara contra el proveedor nuevo (o el del
  // socio, si volvió a null) y solo para este socio.
  let ajuste = null
  if (cambios.proveedor_id !== undefined) {
    const proveedorQueDispara = cambios.proveedor_id ?? (await proveedorDelSocio(fila.beneficiario_id))
    if (proveedorQueDispara) {
      ajuste = await ajustarCarritosDelProveedor(proveedorQueDispara, {
        aplicar: true, soloBeneficiarioId: fila.beneficiario_id,
        actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
      })
    }
  }
  return NextResponse.json({ data, ajuste })
}

/** Proveedor por defecto de un socio: el confirmado, y si no el de
 *  referencia (misma regla que la rendición y el ajuste). */
async function proveedorDelSocio(beneficiarioId: string): Promise<string | null> {
  const admin = getSupabaseAdmin()
  const [{ data: ben }, { data: provs }] = await Promise.all([
    admin.from('beneficiarios').select('proveedor_compra_id').eq('id', beneficiarioId).maybeSingle(),
    admin.from('proveedores').select('*').eq('es_activo', true),
  ])
  const confirmado = (ben as { proveedor_compra_id: string | null } | null)?.proveedor_compra_id
  return confirmado ?? proveedorPorDefecto((provs ?? []) as Proveedor[])?.id ?? null
}
