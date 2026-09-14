import { NextRequest, NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'
import { familiaDeNombre } from '@/lib/business-logic'

// Gestión del catálogo de productos (polines, mallas, polietileno). Calcado
// de /api/proveedores a propósito: mismo guard, misma forma de PATCH parcial
// y mismo audit con el valor anterior. Hasta 2026-09-13 no existía ninguna
// vía para tocar `catalogo_insumos` desde la app -- corregir el nombre o el
// formato de venta de un insumo obligaba a entrar a la base a mano.

const SEGMENTOS = ['Invernadero', 'Cierre Perimetral', 'Ambos'] as const
type SegmentoCat = (typeof SEGMENTOS)[number]

function leerSegmento(v: unknown): SegmentoCat | null {
  return typeof v === 'string' && (SEGMENTOS as readonly string[]).includes(v) ? (v as SegmentoCat) : null
}

export async function POST(req: NextRequest) {
  const ctx = await getViewerContext(); if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : ''
  const formato_venta = typeof body?.formato_venta === 'string' ? body.formato_venta.trim() : ''
  const segmento = leerSegmento(body?.segmento)

  if (!nombre) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
  if (!formato_venta) return NextResponse.json({ error: 'El formato de venta es requerido' }, { status: 400 })
  if (!segmento) {
    return NextResponse.json({ error: `El segmento debe ser uno de: ${SEGMENTOS.join(', ')}` }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('catalogo_insumos')
    .insert({ nombre, formato_venta, segmento, es_activo: true })
    .select()
    .single()

  if (error || !data) {
    console.error('catalogo-insumos POST', error)
    return NextResponse.json({ error: 'No se pudo crear el insumo' }, { status: 400 })
  }

  await logAudit('catalogo_insumos', 'insert', (data as { id: string }).id, {
    nombre, formato_venta, segmento,
    actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getViewerContext(); if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const id = body?.id
  if (typeof id !== 'string') return NextResponse.json({ error: 'id es requerido' }, { status: 400 })

  // Cada campo se toca solo si viene en el body: renombrar no puede
  // reactivar de rebote un insumo apagado, ni al revés.
  const cambios: { nombre?: string; formato_venta?: string; segmento?: SegmentoCat; es_activo?: boolean } = {}

  if (body?.nombre !== undefined) {
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
    if (!nombre) return NextResponse.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 })
    cambios.nombre = nombre
  }
  if (body?.formato_venta !== undefined) {
    const formato = typeof body.formato_venta === 'string' ? body.formato_venta.trim() : ''
    if (!formato) return NextResponse.json({ error: 'El formato de venta no puede quedar vacío' }, { status: 400 })
    cambios.formato_venta = formato
  }
  if (body?.segmento !== undefined) {
    const segmento = leerSegmento(body.segmento)
    if (!segmento) {
      return NextResponse.json({ error: `El segmento debe ser uno de: ${SEGMENTOS.join(', ')}` }, { status: 400 })
    }
    cambios.segmento = segmento
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
  const { data: previo } = await admin
    .from('catalogo_insumos').select('nombre, formato_venta, segmento, es_activo').eq('id', id).maybeSingle()
  if (!previo) return NextResponse.json({ error: 'Insumo inexistente' }, { status: 404 })

  // Desactivar un insumo que está en el carrito de alguien lo sacaría de los
  // selectores mientras sigue sumando en su total: la pantalla mostraría una
  // línea de un producto que la app dice que ya no existe. Se bloquea, y el
  // mensaje dice a cuántos socios afecta para que se pueda ir a arreglarlo.
  if (cambios.es_activo === false) {
    const { count } = await admin
      .from('asignaciones').select('beneficiario_id', { count: 'exact', head: true }).eq('insumo_id', id)
    if (count && count > 0) {
      return NextResponse.json(
        { error: `No se puede desactivar: está en el carrito de ${count} socio${count === 1 ? '' : 's'}. Sácalo de esos carritos primero.` },
        { status: 409 }
      )
    }
  }

  // Renombrar puede romper el programa entero, y en silencio. El sistema
  // todavía reconoce las familias por cómo empieza el nombre (ver
  // familiaDeNombre): si "Polines (4 a 5 cm)" pasa a llamarse "Postes", la
  // simulación deja a los 29 socios en "Catálogo incompleto", el ajuste al
  // presupuesto se queda sin el insumo que absorbe el saldo y la revisión de
  // carritos pierde su vara. Nada de eso da error en pantalla: simplemente
  // deja de funcionar. Hasta que exista una columna `categoria` de verdad, el
  // nombre es también el dato, y por eso se puede editar todo MENOS la
  // palabra con que empieza.
  if (cambios.nombre) {
    const familiaAntes = familiaDeNombre(previo.nombre)
    const familiaAhora = familiaDeNombre(cambios.nombre)
    if (familiaAntes !== familiaAhora) {
      const comoEmpezaba = previo.nombre.trim().split(/\s+/)[0]
      return NextResponse.json(
        {
          error: familiaAntes === 'otro'
            ? `El nombre no puede empezar con "${cambios.nombre.trim().split(/\s+/)[0]}": esa palabra le diría al sistema que es ${familiaAhora}, y se usaría para calcular los carritos. Elige otro comienzo.`
            : `El nombre tiene que seguir empezando con "${comoEmpezaba}": así reconoce el sistema que es ${familiaAntes}, y de eso dependen el simulador y el ajuste al presupuesto. Puedes cambiar el resto del nombre.`,
        },
        { status: 409 }
      )
    }
  }

  const { error } = await admin.from('catalogo_insumos').update(cambios).eq('id', id)
  if (error) {
    console.error('catalogo-insumos PATCH', error)
    return NextResponse.json({ error: 'No se pudo actualizar el insumo' }, { status: 400 })
  }

  await logAudit('catalogo_insumos', 'update', id, {
    anterior: previo, cambios,
    actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })
  return NextResponse.json({ ok: true })
}
