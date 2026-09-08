import { Skeleton } from '@/components/design-system'

export default function Loading() {
  return (
    <div className="space-y-8 max-w-2xl mx-auto" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando tu compra…</span>
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 rounded-full animate-pulse" style={{ background: 'var(--papel-hueco)' }} />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16 col-span-2" />
      </div>
      <Skeleton className="h-40" />
    </div>
  )
}
