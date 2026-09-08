'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Trash2, Upload } from 'lucide-react'
import type { Beneficiario, Asignacion, Proveedor, PrecioProveedor } from '@/lib/types'
import { buildPrecioMap, calcularCostoCarrito, formatCLP, PRESUPUESTO_BASE } from '@/lib/business-logic'
import { useProveedor, proveedorPorDefecto } from '@/lib/proveedor-context'
import { FOTOS_REQUERIDAS } from '@/lib/constants'
import { Card, Alert, ConfirmDialog, Skeleton } from '@/components/design-system'
import { cx } from '@/components/design-system/cx'

// El gráfico vive fuera del bundle inicial -- ver app/mi-dashboard/ComposicionChart.tsx.
const ComposicionChart = dynamic(() => import('./ComposicionChart'), {
  ssr: false,
  loading: () => <div className="h-[220px] rounded-[6px] animate-pulse" style={{ background: 'var(--linea)' }} />,
})

// Mismos dos colores de segmento que usa el resto de la app (barra CP/INV
// del Resumen, punto de la tarjeta de beneficiario): verde bosque = INV,
// terracota = CP. 'Ambos' sale del acento.
const COLORES: Record<string, string> = {
  'Invernadero': '#3f5c1c',
  'Cierre Perimetral': '#8b5a2b',
  'Ambos': '#e8862b',
}
const MAX_FOTOS = 5

type Foto = { id: string; uploaded_at: string; url: string }

// Foto de perfil vía Gravatar (ver app/api/mi-dashboard/route.ts) con fallback
// a iniciales -- Gravatar responde 404 si el socio nunca configuró una, así
// que el fallback es el camino esperado para la mayoría, no un error real.
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase()
}

function Avatar({ url, nombre }: { url: string | null; nombre: string }) {
  const [fallo, setFallo] = useState(!url)
  return (
    <div
      className="shrink-0 h-14 w-14 rounded-full p-[2px] motion-safe:animate-[scaleIn_200ms_ease-out]"
      style={{ background: 'linear-gradient(135deg, var(--marca) 0%, var(--marca-calida) 100%)' }}
    >
      {!fallo && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Foto de perfil de ${nombre}`}
          className="h-full w-full rounded-full object-cover border-2 border-white opacity-0 transition-opacity duration-200 ease-out"
          onLoad={e => e.currentTarget.classList.replace('opacity-0', 'opacity-100')}
          onError={() => setFallo(true)}
        />
      ) : (
        <div
          className="h-full w-full rounded-full border-2 border-white flex items-center justify-center text-sm font-semibold"
          style={{ background: 'var(--verde-muted)', color: 'var(--verde-dark)' }}
        >
          {iniciales(nombre)}
        </div>
      )}
    </div>
  )
}

/** Todo lo que la pantalla necesita ya viene resuelto del servidor
 *  (app/mi-dashboard/page.tsx). `datos: null` = el socio no tiene
 *  beneficiario asociado o la carga falló. */
export type MiDashboardInicial = {
  beneficiario: Beneficiario
  asignaciones: Asignacion[]
  proveedores: Proveedor[]
  preciosProveedor: PrecioProveedor[]
  avatarUrl: string | null
  fotos: Foto[]
} | null

export default function MiDashboardClient({ inicial }: { inicial: MiDashboardInicial }) {
  const { proveedorId, setProveedorId } = useProveedor()
  const [beneficiario] = useState<Beneficiario | null>(inicial?.beneficiario ?? null)
  const [asignaciones] = useState<Asignacion[]>(inicial?.asignaciones ?? [])
  const [proveedores] = useState<Proveedor[]>(inicial?.proveedores ?? [])
  const [precioMap] = useState(() => buildPrecioMap(inicial?.preciosProveedor ?? []))
  const [avatarUrl] = useState<string | null>(inicial?.avatarUrl ?? null)
  const notFound = inicial === null

  const [fotos, setFotos] = useState<Foto[]>(inicial?.fotos ?? [])
  const [fotosLoading, setFotosLoading] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [fotoError, setFotoError] = useState<string | null>(null)
  const [fotoAEliminar, setFotoAEliminar] = useState<Foto | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Lo único que queda por resolver en el cliente: el proveedor elegido vive
  // en localStorage (ver lib/proveedor-context.tsx), así que el servidor no
  // lo conoce. Si no hay uno guardado, o el guardado ya no está disponible,
  // se cae al proveedor por defecto del programa (Sodimac).
  useEffect(() => {
    const idsDisponibles = new Set(proveedores.map(p => p.id))
    const porDefecto = proveedorPorDefecto(proveedores)
    if ((!proveedorId || !idsDisponibles.has(proveedorId)) && porDefecto) {
      setProveedorId(porDefecto.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargarFotos() {
    setFotosLoading(true)
    const res = await fetch('/api/fotos')
    if (res.ok) {
      const { fotos } = await res.json()
      setFotos(fotos)
    }
    setFotosLoading(false)
  }

  async function subirFotos(files: FileList | null) {
    if (!files || files.length === 0) return
    setFotoError(null)
    setSubiendo(true)
    // El contador tiene que ser una variable local: `fotos.length` es estado
    // de React y NO se actualiza dentro del bucle, así que con 0 fotos una
    // selección de 10 archivos pasaba el chequeo las 10 veces y subía los 10
    // a R2 -- el servidor rechazaba a partir del 6º y esos objetos quedaban
    // huérfanos, pagados y sin fila que los referencie.
    let usadas = fotos.length
    for (const file of Array.from(files)) {
      if (usadas >= MAX_FOTOS) {
        setFotoError(`Solo puedes subir ${MAX_FOTOS} fotos. Las demás no se subieron.`)
        break
      }
      try {
        const urlRes = await fetch('/api/fotos/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType: file.type, size: file.size }),
        })
        const urlData = await urlRes.json()
        if (!urlRes.ok) { setFotoError(urlData.error ?? 'Error al subir'); break }
        // El servidor manda cuántas quedan: si ya no queda cupo, se corta
        // antes de subir nada más.
        if (typeof urlData.restantes === 'number') usadas = MAX_FOTOS - urlData.restantes

        const putRes = await fetch(urlData.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
        if (!putRes.ok) { setFotoError('Error al subir la imagen'); continue }

        const confirmRes = await fetch('/api/fotos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: urlData.key }),
        })
        if (!confirmRes.ok) {
          const err = await confirmRes.json().catch(() => null)
          setFotoError(err?.error ?? 'No se pudo registrar la foto')
          continue
        }
        usadas++
      } catch {
        setFotoError('Error al subir la imagen')
      }
    }
    setSubiendo(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    cargarFotos()
  }

  async function confirmarEliminarFoto() {
    if (!fotoAEliminar) return
    setEliminando(true)
    const id = fotoAEliminar.id
    // Antes se quitaba de la UI pase lo que pase: si el DELETE fallaba, el
    // socio creía haber borrado la foto y reaparecía al recargar.
    const res = await fetch(`/api/fotos?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null)
    if (res?.ok) {
      setFotos(prev => prev.filter(f => f.id !== id))
      setFotoError(null)
    } else {
      setFotoError('No pudimos eliminar la foto. Intenta de nuevo.')
    }
    setEliminando(false)
    setFotoAEliminar(null)
  }

  if (notFound || !beneficiario) {
    return (
      <Card strong className="max-w-md mx-auto mt-16 p-8 text-center space-y-2">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--tinta)' }}>Tu cuenta no está habilitada todavía</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Avisa a la organización del Proyecto PAT para que asocien tu email.
        </p>
      </Card>
    )
  }

  const carrito = proveedorId ? calcularCostoCarrito(asignaciones, proveedorId, precioMap) : { total: 0 }
  // Presupuesto REAL del socio (columna beneficiarios.presupuesto_base), no
  // la constante global: la simulación siempre usó la columna, así que un
  // socio con presupuesto distinto veía acá un aporte de bolsillo que no
  // coincidía con su propio cálculo.
  const presupuesto = beneficiario.presupuesto_base ?? PRESUPUESTO_BASE
  const aporteBolsillo = Math.max(0, carrito.total - presupuesto)

  const porSegmento = new Map<string, number>()
  if (proveedorId) {
    for (const a of asignaciones) {
      const seg = a.catalogo_insumos?.segmento ?? 'Otro'
      const precio = precioMap.get(`${proveedorId}_${a.insumo_id}`)
      if (precio == null) continue
      porSegmento.set(seg, (porSegmento.get(seg) ?? 0) + a.cantidad * precio)
    }
  }
  const chartData = Array.from(porSegmento.entries()).map(([segmento, valor]) => ({ segmento, valor }))

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Avatar url={avatarUrl} nombre={beneficiario.nombre} />
        <div>
          <p className="eyebrow mb-1">{beneficiario.segmento} · Proyecto PAT</p>
          <h1 className="titulo-md">
            Hola, <em>{beneficiario.nombre.split(' ')[0]}.</em>
          </h1>
        </div>
      </div>

      {proveedores.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {proveedores.map(p => (
            <button
              key={p.id}
              onClick={() => setProveedorId(p.id)}
              className={cx(
                'px-3.5 py-2 min-h-[40px] rounded-[4px] text-sm font-semibold border transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--verde)]',
                proveedorId === p.id ? 'text-[var(--papel)] border-transparent' : 'border-[var(--linea)]'
              )}
              style={proveedorId === p.id
                ? { background: 'var(--marca)' }
                : { color: 'var(--tinta-70)' }}
            >
              {p.nombre}
            </button>
          ))}
        </div>
      )}

      {/* Jerarquia: el total de la compra es EL numero de la pantalla y va en
          escala editorial; presupuesto y aporte son de apoyo y quedan en una
          fila secundaria. Antes las tres cifras tenian el mismo peso (text-lg)
          y el socio no sabia cual mirar. */}
      <div className="space-y-3">
        <div
          className="p-5 rounded-[6px] motion-safe:animate-[riseIn_220ms_ease-out]"
          style={{ background: 'var(--marca)', color: 'var(--papel)' }}
        >
          <p className="eyebrow" style={{ color: 'rgba(244,240,231,0.82)' }}>Total de tu compra</p>
          <p className="titulo-lg mt-2 tabular-nums">{formatCLP(carrito.total)}</p>
          {/* Barra de consumo del presupuesto: dice de un vistazo si se paso.
              El excedente va en acento (naranja) sobre el verde, no en rojo
              sobre rojo. */}
          <div className="mt-4 h-2 w-full rounded-full overflow-hidden" style={{ background: 'rgba(244,240,231,0.25)' }}>
            <div
              className="h-full transition-[width] duration-700"
              style={{
                width: `${Math.min(100, presupuesto > 0 ? (carrito.total / presupuesto) * 100 : 0)}%`,
                background: aporteBolsillo > 0 ? 'var(--acento)' : 'var(--papel)',
              }}
            />
          </div>
          <p className="text-xs mt-2" style={{ color: 'rgba(244,240,231,0.82)' }}>
            {aporteBolsillo > 0
              ? `Superaste tu presupuesto de ${formatCLP(presupuesto)}`
              : `Dentro de tu presupuesto de ${formatCLP(presupuesto)}`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4 motion-safe:animate-[riseIn_220ms_ease-out]" style={{ animationDelay: '40ms' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Presupuesto base</p>
            <p className="text-lg font-semibold mt-1 tabular-nums" style={{ color: 'var(--tinta)' }}>{formatCLP(presupuesto)}</p>
          </Card>
          <Card className="p-4 motion-safe:animate-[riseIn_220ms_ease-out]" style={{ animationDelay: '80ms' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Aporte de bolsillo</p>
            <p
              className="text-lg font-semibold mt-1 tabular-nums"
              style={{ color: aporteBolsillo > 0 ? 'var(--alerta)' : 'var(--tinta)' }}
            >
              {formatCLP(aporteBolsillo)}
            </p>
          </Card>
        </div>
      </div>

      {chartData.length > 0 && (
        <Card className="p-4">
          <p className="eyebrow mb-3">Composición de tu compra</p>
          <ComposicionChart data={chartData} colores={COLORES} />
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: 'var(--tinta)' }}>Fotos de tu compra</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {fotos.length} de {MAX_FOTOS} · mínimo {FOTOS_REQUERIDAS} para tu rendición
          </p>
        </div>

        {fotoError && <Alert tone="error">{fotoError}</Alert>}

        {fotosLoading ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square !rounded-[4px]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {fotos.map(f => (
              <div key={f.id} className="relative group aspect-square rounded-[4px] overflow-hidden" style={{ background: 'var(--linea)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt="Comprobante de compra" className="w-full h-full object-cover" />
                <button
                  onClick={() => setFotoAEliminar(f)}
                  className="absolute top-1 right-1 bg-[rgba(23,24,21,0.55)] text-[var(--papel)] rounded-full p-2 min-h-[36px] min-w-[36px] flex items-center justify-center transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label="Eliminar foto"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {fotos.length < MAX_FOTOS && (
              <label
                className={cx(
                  'aspect-square rounded-[4px] border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors',
                  'hover:border-[var(--verde)] hover:text-[var(--verde-dark)] focus-within:ring-2 focus-within:ring-[var(--verde)] focus-within:ring-offset-1'
                )}
                style={{ borderColor: 'var(--linea)', color: 'var(--text-muted)' }}
              >
                <Upload size={18} />
                <span className="text-xs">{subiendo ? 'Subiendo…' : 'Agregar'}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  multiple
                  className="hidden"
                  disabled={subiendo}
                  onChange={e => subirFotos(e.target.files)}
                />
              </label>
            )}
          </div>
        )}
      </Card>

      {fotoAEliminar && (
        <ConfirmDialog
          title="Eliminar foto"
          description="Esta foto de comprobante se eliminará. Si es tu única foto, tu rendición volverá a quedar pendiente."
          confirmLabel="Eliminar foto"
          onConfirm={confirmarEliminarFoto}
          onCancel={() => setFotoAEliminar(null)}
          busy={eliminando}
        />
      )}
    </div>
  )
}
