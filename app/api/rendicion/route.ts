import { NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { urlFirmadaLectura } from '@/lib/r2'
import { cargarRendicion } from '@/lib/rendicion-data'
import { FOTOS_REQUERIDAS } from '@/lib/constants'

// Cuadro de mando de rendición (staff-only). La agregación por beneficiario
// vive en lib/rendicion-data.ts, compartida con el informe PDF de la
// consultora -- este endpoint solo firma las URLs de lectura y arma el
// resumen para la UI.
//
// Nota de diseño: `proveedorCompraNombre` es el proveedor REAL con el que se
// compró (lo setea staff en /rendicion tras validar el comprobante) y es el
// dato de verdad. `proveedorNombre` es el "mejor proveedor calculado", una
// aproximación de reporte -- ver elegirMejorProveedor en lib/business-logic.ts.
export async function GET() {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const res = await cargarRendicion()
  if (!res.ok) {
    console.error('rendicion GET', res.error)
    return NextResponse.json({ error: 'Error al cargar la rendición' }, { status: 500 })
  }

  const data = await Promise.all(
    res.filas.map(async fila => {
      const { fotos, ...resto } = fila
      return {
        ...resto,
        fotos: await Promise.all(
          fotos.map(async f => ({
            id: f.id,
            uploaded_at: f.uploaded_at,
            url: await urlFirmadaLectura(f.r2_key, 300),
          }))
        ),
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

  return NextResponse.json({
    beneficiarios: data,
    resumen,
    fotosRequeridas: FOTOS_REQUERIDAS,
    proveedores: res.proveedores,
  })
}
