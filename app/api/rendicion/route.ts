import { NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { urlFirmadaLectura } from '@/lib/r2'
import { calcularCostoCarrito } from '@/lib/business-logic'
import { FOTOS_REQUERIDAS } from '@/lib/constants'
import type { Asignacion, Proveedor, PrecioProveedor, FotoCompra } from '@/lib/types'

// Cuadro de mando de rendición (staff-only). Por cada beneficiario: total
// cotizado, proveedor de referencia y fotos de comprobante.
//
// Nota de diseño: hoy no existe un concepto persistido de "proveedor
// elegido" -- el que ve cada socio en /mi-dashboard es el que tiene
// seleccionado en su sesión de simulación (localStorage, client-side, no
// se guarda en la DB). Para /rendicion, que es una vista de staff sobre
// TODOS los beneficiarios a la vez, no hay un único proveedor de sesión al
// que atarse. Se calcula, por beneficiario, el "mejor proveedor
// disponible": el que cotiza el carrito completo (sin ítems sin precio) al
// menor total; si ninguno cotiza el 100% del carrito, se usa el que cubre
// más ítems (y, en empate, el de menor total). Esto es una aproximación
// razonable para efectos de reporte, no una fuente de verdad transaccional.
export async function GET() {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = getSupabaseAdmin()

  const [
    { data: beneficiarios, error: e1 },
    { data: asignaciones, error: e2 },
    { data: proveedores, error: e3 },
    { data: preciosProveedor, error: e4 },
    { data: fotos, error: e5 },
  ] = await Promise.all([
    admin.from('beneficiarios').select('*').order('segmento').order('nombre'),
    admin.from('asignaciones').select('*, catalogo_insumos(*)'),
    admin.from('proveedores').select('*').eq('es_activo', true).order('nombre'),
    admin.from('precios_proveedor').select('*'),
    admin.from('fotos_compra').select('*').order('uploaded_at', { ascending: true }),
  ])

  const error = e1 || e2 || e3 || e4 || e5
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const precioMap = new Map<string, number | null>()
  for (const p of (preciosProveedor ?? []) as PrecioProveedor[]) {
    precioMap.set(`${p.proveedor_id}_${p.insumo_id}`, p.precio_unitario)
  }

  const asignacionesPorBen = new Map<string, Asignacion[]>()
  for (const a of (asignaciones ?? []) as Asignacion[]) {
    const arr = asignacionesPorBen.get(a.beneficiario_id) ?? []
    arr.push(a)
    asignacionesPorBen.set(a.beneficiario_id, arr)
  }

  const fotosPorBen = new Map<string, FotoCompra[]>()
  for (const f of (fotos ?? []) as FotoCompra[]) {
    const arr = fotosPorBen.get(f.beneficiario_id) ?? []
    arr.push(f)
    fotosPorBen.set(f.beneficiario_id, arr)
  }

  const provs = (proveedores ?? []) as Proveedor[]

  const data = await Promise.all(
    (beneficiarios ?? []).map(async ben => {
      const asigs = asignacionesPorBen.get(ben.id) ?? []

      let mejor: { proveedor: Proveedor | null; total: number; itemsSinPrecio: number } = {
        proveedor: null, total: 0, itemsSinPrecio: asigs.length,
      }
      for (const prov of provs) {
        const { total, itemsSinPrecio } = calcularCostoCarrito(asigs, prov.id, precioMap)
        const mejorCandidato =
          !mejor.proveedor ||
          itemsSinPrecio < mejor.itemsSinPrecio ||
          (itemsSinPrecio === mejor.itemsSinPrecio && total < mejor.total)
        if (mejorCandidato) mejor = { proveedor: prov, total, itemsSinPrecio }
      }

      const fotosBen = fotosPorBen.get(ben.id) ?? []
      const fotosConUrl = await Promise.all(
        fotosBen.map(async f => ({
          id: f.id,
          uploaded_at: f.uploaded_at,
          url: await urlFirmadaLectura(f.r2_key, 300),
        }))
      )

      return {
        id: ben.id,
        nombre: ben.nombre,
        segmento: ben.segmento,
        proveedorNombre: mejor.proveedor?.nombre ?? null,
        total: mejor.total,
        itemsSinPrecio: mejor.itemsSinPrecio,
        fotos: fotosConUrl,
        fotosCount: fotosBen.length,
        compraCompleta: ben.compra_completa,
        compraCompletaAt: ben.compra_completa_at,
      }
    })
  )

  const resumen = {
    total: data.length,
    completos: data.filter(d => d.compraCompleta).length,
    porSegmento: Object.fromEntries(
      Array.from(new Set(data.map(d => d.segmento))).map(seg => {
        const delSeg = data.filter(d => d.segmento === seg)
        return [seg, { total: delSeg.length, completos: delSeg.filter(d => d.compraCompleta).length }]
      })
    ),
  }

  return NextResponse.json({ beneficiarios: data, resumen, fotosRequeridas: FOTOS_REQUERIDAS })
}
