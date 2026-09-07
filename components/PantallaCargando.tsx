import { Skeleton } from '@/components/design-system'

// Fallback de navegación (los loading.tsx de cada sección). Sin esto, tocar
// una pestaña no producía NINGÚN cambio visible hasta que el servidor
// terminaba de renderizar: las páginas pasaron a Server Component, así que
// ya no hay un shell de cliente que pinte su propio skeleton al instante.
// La forma imita el alto real de cada pantalla para que el contenido no
// salte cuando llega.
export function PantallaCargando({ filas = 4 }: { filas?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40" />
      {Array.from({ length: filas }).map((_, i) => (
        <Skeleton key={i} className="h-20" />
      ))}
    </div>
  )
}
