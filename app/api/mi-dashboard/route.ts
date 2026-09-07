import { NextResponse } from 'next/server'
import { getViewerContext } from '@/lib/roles'
import { cargarMiDashboard } from '@/lib/mi-dashboard-data'

// Datos propios de un socio -- nunca expone datos de otros beneficiarios.
// La consulta vive en lib/mi-dashboard-data.ts, compartida con la página
// server-side; este endpoint solo aplica el chequeo de acceso.
export async function GET() {
  const ctx = await getViewerContext()
  // Socio puro, o staff (owner/admin) que también es socio con su propio
  // beneficiarioId (ver lib/roles.ts) -- ambos ven solo lo suyo.
  if (!ctx.beneficiarioId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const res = await cargarMiDashboard(ctx.beneficiarioId)
  if (!res.ok) {
    console.error('mi-dashboard GET', res.error)
    return NextResponse.json({ error: 'Error al cargar tus datos' }, { status: 500 })
  }

  return NextResponse.json(res.data)
}
