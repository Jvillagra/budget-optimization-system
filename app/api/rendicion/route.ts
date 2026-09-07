import { NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { cargarRendicionUI } from '@/lib/rendicion-data'
import { FOTOS_REQUERIDAS } from '@/lib/constants'

// Cuadro de mando de rendición (staff-only). La agregación por beneficiario
// y el firmado de las fotos viven en lib/rendicion-data.ts, compartidos con
// el informe PDF de la consultora y con la página server-side.
//
// La primera carga de /rendicion YA NO pasa por acá: app/rendicion/page.tsx
// llama a cargarRendicionUI() en el servidor y manda el HTML con los datos
// dentro. Este endpoint queda para el botón "Reintentar" del cliente.
//
// Nota de diseño: `proveedorCompraNombre` es el proveedor REAL con el que se
// compró (lo setea staff en /rendicion tras validar el comprobante) y es el
// dato de verdad. `proveedorNombre` es el "mejor proveedor calculado", una
// aproximación de reporte -- ver elegirMejorProveedor en lib/business-logic.ts.
export async function GET() {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const res = await cargarRendicionUI()
  if (!res.ok) {
    console.error('rendicion GET', res.error)
    return NextResponse.json({ error: 'Error al cargar la rendición' }, { status: 500 })
  }

  return NextResponse.json({
    beneficiarios: res.filas,
    fotosRequeridas: FOTOS_REQUERIDAS,
    proveedores: res.proveedores,
  })
}
