import { NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { cargarDatosStaff } from '@/lib/staff-data'

// Único punto de lectura para el cliente. Antes cada página pegaba directo a
// Supabase con la anon key (visible en el bundle) -- cualquiera que la
// extrajera podía leer todo sin pasar por el password gate de la app (ver
// SELECT-only en 004_rls_write_lockdown.sql). Ahora las lecturas también
// pasan por acá con service_role, detrás del mismo gate que las escrituras;
// la anon key ya no tiene ningún uso legítimo en el cliente.

export async function GET() {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const datos = await cargarDatosStaff()
  if (!datos) return NextResponse.json({ error: 'Error al cargar los datos' }, { status: 500 })
  return NextResponse.json(datos)
}
