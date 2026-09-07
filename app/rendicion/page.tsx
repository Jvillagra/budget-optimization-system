import { Suspense } from 'react'
import { cargarRendicionUI } from '@/lib/rendicion-data'
import { Skeleton } from '@/components/design-system'
import RendicionClient from './RendicionClient'

// Server Component: los datos se resuelven acá y viajan dentro del HTML.
//
// Antes /rendicion era 'use client' y su primera carga era una cascada:
// HTML vacío -> descargar y ejecutar el bundle -> hidratar -> fetch
// /api/rendicion -> ese request volvía a pasar por el gate de sesión del
// proxy (getUser contra Supabase) y por getViewerContext() -> recién ahí
// aparecía algo distinto de un skeleton. En un celular en terreno eso es
// varios segundos de pantalla gris. El endpoint sigue existiendo para el
// reintento del cliente (ver app/rendicion/RendicionClient.tsx).
//
// El rol ya lo verificó app/rendicion/layout.tsx (requireStaff).
export const dynamic = 'force-dynamic'

function RendicionSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-56" />
      <Skeleton className="h-96" />
    </div>
  )
}

export default async function RendicionPage() {
  const res = await cargarRendicionUI()
  if (!res.ok) console.error('rendicion page', res.error)

  return (
    // useSearchParams (?tab=resumen) exige un límite de Suspense.
    <Suspense fallback={<RendicionSkeleton />}>
      <RendicionClient
        initialFilas={res.ok ? res.filas : []}
        initialProveedores={res.ok ? res.proveedores : []}
        initialError={!res.ok}
      />
    </Suspense>
  )
}
