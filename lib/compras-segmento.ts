import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import type { Segmento, CompraSegmento, PrecioCongelado } from './types'

// Estado "compra confirmada" por segmento -- ver
// supabase/migrations/010_compra_confirmada_por_segmento.sql.
//
// Una fila en `compras_segmento` significa que ese proyecto ya se compró:
// se fija el proveedor, se congela el precio pagado de cada insumo y las
// asignaciones del segmento dejan de aceptar cambios. Revertir es borrar la
// fila; el snapshot se va en cascada.

export type EstadoCompras = {
  compras: CompraSegmento[]
  preciosCongelados: PrecioCongelado[]
}

export const SIN_COMPRAS: EstadoCompras = { compras: [], preciosCongelados: [] }

/** SIN_COMPRAS si la consulta falla: una compra confirmada que no se puede
 *  leer debe degradar a "todavía se puede editar", nunca dejar la pantalla
 *  en blanco. El error queda logueado. */
export async function cargarComprasSegmento(): Promise<EstadoCompras> {
  const admin = getSupabaseAdmin()
  const [{ data: compras, error: e1 }, { data: precios, error: e2 }] = await Promise.all([
    admin.from('compras_segmento').select('*'),
    admin.from('compras_segmento_precio').select('*'),
  ])
  if (e1 || e2) {
    console.error('cargarComprasSegmento', e1 || e2)
    return SIN_COMPRAS
  }
  return {
    compras: (compras ?? []) as CompraSegmento[],
    preciosCongelados: (precios ?? []) as PrecioCongelado[],
  }
}

/** Segmentos con compra confirmada. Lo usan los guards de escritura. */
export async function segmentosConfirmados(): Promise<Set<Segmento>> {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from('compras_segmento').select('segmento')
  if (error) {
    console.error('segmentosConfirmados', error)
    return new Set()
  }
  return new Set((data ?? []).map(r => r.segmento as Segmento))
}
