import { NextRequest, NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { ajustarCarritosDelProveedor } from '@/lib/ajuste-carritos'

// Reajuste de carritos pedido a mano.
//
// Guardar un precio ya reajusta solo (ver /api/precios-proveedor). Esta ruta
// existe para los dos casos en que eso no basta:
//
//  - el cambio de precio fue tan grande que el reajuste automático se frenó a
//    propósito y alguien lo confirma después de mirarlo;
//  - se quiere reajustar todo contra un proveedor sin tocar ningún precio
//    (por ejemplo, después de cambiarle el proveedor de compra a un socio).
//
// GET devuelve lo que cambiaría sin escribir nada, para poder mostrarlo antes
// de decidir. POST aplica.

async function resolver(req: NextRequest, aplicar: boolean) {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const proveedor_id = aplicar
    ? (await req.json().catch(() => null))?.proveedor_id
    : req.nextUrl.searchParams.get('proveedor_id')

  if (typeof proveedor_id !== 'string' || !proveedor_id) {
    return NextResponse.json({ error: 'proveedor_id es requerido' }, { status: 400 })
  }

  const resumen = await ajustarCarritosDelProveedor(proveedor_id, {
    aplicar,
    actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })

  return NextResponse.json({ ok: true, aplicado: aplicar, ...resumen })
}

export async function GET(req: NextRequest) {
  return resolver(req, false)
}

export async function POST(req: NextRequest) {
  return resolver(req, true)
}
