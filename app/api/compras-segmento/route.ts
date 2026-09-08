import { NextRequest, NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'
import type { Segmento } from '@/lib/types'

const SEGMENTOS: Segmento[] = ['Invernadero', 'Cierre Perimetral']

/**
 * Confirmar / revertir la compra de un segmento.
 *
 * Confirmar congela el precio pagado de cada insumo que ese segmento tiene
 * asignado: `precios_proveedor` se sigue editando después (hace falta para
 * cotizar el otro proyecto, y "Polines" es un insumo compartido), así que
 * sin el snapshot un cambio de precio posterior movería el total de una
 * rendición ya cerrada.
 */
export async function POST(req: NextRequest) {
  const ctx = await getViewerContext(); if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const segmento = body?.segmento as Segmento
  const proveedor_id = body?.proveedor_id

  if (!SEGMENTOS.includes(segmento)) {
    return NextResponse.json({ error: 'segmento inválido' }, { status: 400 })
  }
  if (typeof proveedor_id !== 'string') {
    return NextResponse.json({ error: 'proveedor_id es requerido' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  const { data: proveedor } = await admin
    .from('proveedores').select('id, nombre, es_activo').eq('id', proveedor_id).maybeSingle()
  if (!proveedor) return NextResponse.json({ error: 'Proveedor inexistente' }, { status: 404 })
  if (!proveedor.es_activo) {
    return NextResponse.json({ error: 'Ese proveedor está desactivado' }, { status: 400 })
  }

  const { data: yaConfirmada } = await admin
    .from('compras_segmento').select('segmento').eq('segmento', segmento).maybeSingle()
  if (yaConfirmada) {
    return NextResponse.json({ error: 'Ese proyecto ya tiene la compra confirmada' }, { status: 409 })
  }

  // Insumos que este segmento realmente compra = los asignados a sus socios.
  const { data: bens } = await admin.from('beneficiarios').select('id').eq('segmento', segmento)
  const idsSegmento = (bens ?? []).map(b => b.id)
  const { data: asigs } = idsSegmento.length
    ? await admin.from('asignaciones').select('insumo_id').in('beneficiario_id', idsSegmento)
    : { data: [] as { insumo_id: string }[] }
  const insumoIds = [...new Set((asigs ?? []).map(a => a.insumo_id))]

  if (insumoIds.length === 0) {
    return NextResponse.json(
      { error: 'Este proyecto todavía no tiene insumos asignados a ningún socio' },
      { status: 400 }
    )
  }

  const { data: precios } = await admin
    .from('precios_proveedor')
    .select('insumo_id, precio_unitario')
    .eq('proveedor_id', proveedor_id)
    .in('insumo_id', insumoIds)
  const precioPorInsumo = new Map((precios ?? []).map(p => [p.insumo_id, p.precio_unitario]))

  const { error: errCompra } = await admin.from('compras_segmento').insert({
    segmento,
    proveedor_id,
    confirmada_by: ctx.email ?? null,
  })
  if (errCompra) {
    console.error('compras-segmento POST', errCompra)
    return NextResponse.json({ error: 'No se pudo confirmar la compra' }, { status: 400 })
  }

  // Si el snapshot falla la compra queda sin precios congelados, que es
  // exactamente lo que había que evitar: se deshace la confirmación entera.
  const filas = insumoIds.map(insumo_id => ({
    segmento,
    insumo_id,
    precio_unitario: precioPorInsumo.get(insumo_id) ?? null,
  }))
  const { error: errPrecios } = await admin.from('compras_segmento_precio').insert(filas)
  if (errPrecios) {
    console.error('compras-segmento POST snapshot', errPrecios)
    await admin.from('compras_segmento').delete().eq('segmento', segmento)
    return NextResponse.json({ error: 'No se pudo guardar el detalle de la compra' }, { status: 400 })
  }

  await logAudit('compras_segmento', 'insert', segmento, {
    segmento,
    proveedor_id,
    proveedor_nombre: proveedor.nombre,
    insumos_congelados: filas.length,
    actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const ctx = await getViewerContext(); if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const segmento = req.nextUrl.searchParams.get('segmento') as Segmento | null
  if (!segmento || !SEGMENTOS.includes(segmento)) {
    return NextResponse.json({ error: 'segmento inválido' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: previa } = await admin
    .from('compras_segmento').select('*').eq('segmento', segmento).maybeSingle()
  if (!previa) return NextResponse.json({ error: 'Ese proyecto no tiene compra confirmada' }, { status: 404 })

  // El snapshot de precios se va en cascada (FK on delete cascade).
  const { error } = await admin.from('compras_segmento').delete().eq('segmento', segmento)
  if (error) {
    console.error('compras-segmento DELETE', error)
    return NextResponse.json({ error: 'No se pudo revertir la compra' }, { status: 400 })
  }

  await logAudit('compras_segmento', 'delete', segmento, {
    anterior: previa,
    actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })
  return NextResponse.json({ ok: true })
}
