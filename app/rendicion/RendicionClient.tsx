'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { X, ImageOff, CheckCircle2, RotateCcw, Upload, ChevronDown, ClipboardList, BarChart3 } from 'lucide-react'
import { formatCLP } from '@/lib/business-logic'
import { FOTOS_REQUERIDAS } from '@/lib/constants'
import { Card, Button, Badge, Input, Alert, Skeleton } from '@/components/design-system'
import { VistaResumenContent } from '@/components/VistaResumenContent'

// lib/r2.ts es server-only, así que se duplica la constante acá (mismo
// patrón que ya usa app/mi-dashboard/page.tsx).
const MAX_FOTOS_POR_SOCIO = 5

type Foto = { id: string; uploaded_at: string; url: string }
type ProveedorOpcion = { id: string; nombre: string }
type ItemCotizacion = {
  id: string
  insumoNombre: string
  formatoVenta: string | null
  cantidad: number
  precioUnitario: number | null
  subtotal: number | null
}
type FilaRendicion = {
  id: string
  nombre: string
  segmento: string
  presupuestoBase: number
  proveedorNombre: string | null
  proveedorCompraId: string | null
  proveedorCompraNombre: string | null
  total: number
  itemsSinPrecio: number
  totalEsCompleto: boolean
  items: ItemCotizacion[]
  fotos: Foto[]
  fotosCount: number
  compraCompleta: boolean
  compraCompletaAt: string | null
}
type ResumenSegmento = { total: number; completos: number; monto: number; montoRendido: number }
type Resumen = {
  total: number
  completos: number
  porSegmento: Record<string, ResumenSegmento>
}
/** Los tres números de plata que el staff necesita leer de un vistazo, más
 *  la señal de calidad del dato (cuántas filas traen un total parcial). */
type Totales = {
  cotizado: number
  rendido: number
  porRendir: number
  sociosRendidos: number
  sociosPorRendir: number
  filasParciales: number
}

/** Un total parcial (faltan precios, o no hay carrito) no se presenta igual
 *  que una cotización completa: se marca en ámbar y con un título que dice
 *  por qué. Mismo criterio que el PDF de la consultora. */
function TotalCotizado({ f, className }: { f: FilaRendicion; className?: string }) {
  if (f.totalEsCompleto) {
    return <span className={className} style={{ color: '#1c1c1c' }}>{formatCLP(f.total)}</span>
  }
  const motivo = f.items.length === 0
    ? 'Sin carrito registrado'
    : `Parcial: ${f.itemsSinPrecio} ítem(s) sin precio, no incluidos`
  return (
    <span className={className} style={{ color: 'var(--cafe-dark)' }} title={motivo}>
      {f.items.length === 0 ? '—' : `${formatCLP(f.total)}*`}
    </span>
  )
}

/** Donut de avance. Antes esto eran recharts (PieChart + ResponsiveContainer)
 *  para dibujar dos segmentos de 72px: ~100KB de JS en la ruta más usada del
 *  staff, en celulares de terreno. Un <circle> con strokeDasharray hace lo
 *  mismo sin dependencia. recharts sigue en /simulador y /mi-dashboard, que
 *  sí dibujan gráficos de verdad. */
function ProgresoDonut({ pct }: { pct: number }) {
  const r = 28
  const circunferencia = 2 * Math.PI * r
  const avance = (Math.max(0, Math.min(100, pct)) / 100) * circunferencia
  return (
    <svg width={72} height={72} viewBox="0 0 72 72" className="shrink-0" role="img" aria-label={`${Math.round(pct)}% completo`}>
      <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(0,0,0,0.10)" strokeWidth="10" />
      {avance > 0 && (
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke="var(--verde)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${avance} ${circunferencia}`}
          transform="rotate(-90 36 36)"
          className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-500 motion-safe:ease-out"
        />
      )}
    </svg>
  )
}

/** Una cifra de los totales. `destacado` la usa el total cotizado, que es la
 *  referencia contra la que se leen las otras dos. */
function TotalCelda({ etiqueta, monto, detalle, color, destacado = false }: {
  etiqueta: string
  monto: number
  detalle: string
  color: string
  destacado?: boolean
}) {
  return (
    <div className="p-3.5" style={{ background: destacado ? 'rgba(58,125,68,0.06)' : 'rgba(255,255,255,0.75)' }}>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{etiqueta}</p>
      <p className="text-xl sm:text-2xl font-bold leading-tight tabular-nums mt-0.5" style={{ color }}>
        {formatCLP(monto)}
      </p>
      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{detalle}</p>
    </div>
  )
}

const SEG_COLOR: Record<string, string> = {
  'Invernadero': 'var(--verde-dark)',
  'Cierre Perimetral': 'var(--cafe-dark)',
}

/** Tabs Lista/Resumen: antes "Resumen" (consolidado de compra) era su propia
 * ruta con ítem propio en el menú -- ver components/VistaResumenContent.tsx.
 * ?tab=resumen abre directo en Resumen (usado por el redirect de la ruta
 * vieja /vista-resumen, para no romper enlaces guardados). */
export default function RendicionClient({ initialFilas, initialProveedores, initialError }: {
  initialFilas: FilaRendicion[]
  initialProveedores: ProveedorOpcion[]
  initialError: boolean
}) {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<'lista' | 'resumen'>(searchParams.get('tab') === 'resumen' ? 'resumen' : 'lista')
  // Datos ya resueltos en el servidor (app/rendicion/page.tsx): la pantalla
  // pinta con contenido en el primer frame, sin skeleton ni fetch al montar.
  const [filas, setFilas] = useState<FilaRendicion[]>(initialFilas)
  const [proveedores, setProveedores] = useState<ProveedorOpcion[]>(initialProveedores)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(initialError)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ nombre: string; fotos: Foto[]; index: number } | null>(null)
  const [detalle, setDetalle] = useState<FilaRendicion | null>(null)
  const [subiendoId, setSubiendoId] = useState<string | null>(null)
  const [fotoError, setFotoError] = useState<{ id: string; mensaje: string } | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [busqueda, setBusqueda] = useState('')
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  function toggleExpanded(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function cargar() {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch('/api/rendicion')
      if (!res.ok) throw new Error('load failed')
      const { beneficiarios, proveedores: provs } = await res.json()
      setFilas(beneficiarios ?? [])
      setProveedores(provs ?? [])
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  async function setProveedorCompra(id: string, proveedorId: string | null) {
    setBusyId(id)
    const res = await fetch(`/api/rendicion/${id}/proveedor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proveedorId }),
    })
    if (res.ok) {
      const { data } = await res.json()
      const nombre = proveedorId ? (proveedores.find(p => p.id === proveedorId)?.nombre ?? null) : null
      setFilas(prev => prev.map(f => f.id === id
        ? { ...f, proveedorCompraId: data.proveedor_compra_id, proveedorCompraNombre: nombre }
        : f))
    }
    setBusyId(null)
  }

  async function marcarCompleto(id: string) {
    setBusyId(id)
    const res = await fetch(`/api/rendicion/${id}/completar`, { method: 'POST' })
    if (res.ok) {
      const { data } = await res.json()
      setFilas(prev => prev.map(f => f.id === id ? { ...f, compraCompleta: data.compra_completa, compraCompletaAt: data.compra_completa_at } : f))
    }
    setBusyId(null)
  }

  async function revertir(id: string) {
    setBusyId(id)
    const res = await fetch(`/api/rendicion/${id}/revertir`, { method: 'POST' })
    if (res.ok) {
      const { data } = await res.json()
      setFilas(prev => prev.map(f => f.id === id ? { ...f, compraCompleta: data.compra_completa, compraCompletaAt: data.compra_completa_at } : f))
    }
    setBusyId(null)
  }

  // Sube una foto de comprobante en nombre de un beneficiario (mismo flujo
  // de 2 pasos que app/mi-dashboard/page.tsx: URL firmada -> PUT a R2 ->
  // confirmar). El admin pasa el beneficiarioId de la fila en ambas llamadas.
  async function subirFotoStaff(beneficiarioId: string, file: File) {
    setFotoError(null)
    setSubiendoId(beneficiarioId)
    try {
      const urlRes = await fetch('/api/fotos/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiarioId, contentType: file.type, size: file.size }),
      })
      const urlData = await urlRes.json()
      if (!urlRes.ok) {
        setFotoError({ id: beneficiarioId, mensaje: urlData.error ?? 'Error al subir' })
        return
      }

      const putRes = await fetch(urlData.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      if (!putRes.ok) {
        setFotoError({ id: beneficiarioId, mensaje: 'Error al subir la imagen' })
        return
      }

      const confirmRes = await fetch('/api/fotos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiarioId, key: urlData.key }),
      })
      const confirmData = await confirmRes.json()
      if (!confirmRes.ok) {
        setFotoError({ id: beneficiarioId, mensaje: confirmData.error ?? 'Error al confirmar la foto' })
        return
      }

      // La URL de lectura firmada es distinta de la de subida (ver
      // lib/r2.ts urlFirmadaLectura vs urlFirmadaSubida) -- se pide de
      // nuevo en vez de derivarla localmente.
      const fotosRes = await fetch(`/api/fotos?beneficiarioId=${encodeURIComponent(beneficiarioId)}`)
      if (fotosRes.ok) {
        const { fotos: fotosActualizadas } = await fotosRes.json()
        setFilas(prev => prev.map(f => f.id === beneficiarioId
          ? { ...f, fotos: fotosActualizadas, fotosCount: fotosActualizadas.length }
          : f))
      }
    } catch {
      setFotoError({ id: beneficiarioId, mensaje: 'Error al subir la imagen' })
    } finally {
      setSubiendoId(null)
      // Solo resetea el input de la fila de tabla desktop -- la tarjeta
      // mobile resetea el suyo síncronamente en su propio onChange.
      const input = fileInputRefs.current[beneficiarioId]
      if (input) input.value = ''
    }
  }

  // El resumen se DERIVA de las filas en vez de mantenerse como estado
  // paralelo. La versión anterior lo recalculaba a mano pasándole el `filas`
  // capturado en el closure (no el actualizado) dentro de un
  // `setResumen(prev => prev ? ... : prev)` que usaba `prev` solo como
  // guardia: dos marcados seguidos y el resumen dejaba de coincidir con la
  // lista que el usuario tenía delante.
  const resumen: Resumen | null = useMemo(() => {
    if (filas.length === 0) return null
    const porSegmento: Record<string, ResumenSegmento> = {}
    for (const f of filas) {
      if (!porSegmento[f.segmento]) porSegmento[f.segmento] = { total: 0, completos: 0, monto: 0, montoRendido: 0 }
      const seg = porSegmento[f.segmento]
      seg.total++
      seg.monto += f.total
      if (f.compraCompleta) { seg.completos++; seg.montoRendido += f.total }
    }
    return {
      total: filas.length,
      completos: filas.filter(f => f.compraCompleta).length,
      porSegmento,
    }
  }, [filas])

  // Plata, no solo conteos: "12 de 29" no dice cuánto lleva rendido la
  // comunidad ni cuánto falta, que es lo que se reporta hacia afuera.
  // `rendido` suma el total cotizado de los socios ya marcados completos.
  const totales: Totales = useMemo(() => {
    let cotizado = 0, rendido = 0, sociosRendidos = 0, filasParciales = 0
    for (const f of filas) {
      cotizado += f.total
      if (!f.totalEsCompleto) filasParciales++
      if (f.compraCompleta) { rendido += f.total; sociosRendidos++ }
    }
    return {
      cotizado,
      rendido,
      porRendir: cotizado - rendido,
      sociosRendidos,
      sociosPorRendir: filas.length - sociosRendidos,
      filasParciales,
    }
  }, [filas])

  if (loading) return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  )

  if (loadError) return (
    <Card className="p-8 text-center space-y-3">
      <p className="text-sm font-semibold" style={{ color: 'var(--cafe-dark)' }}>Error al cargar la rendición</p>
      <Button onClick={cargar}>Reintentar</Button>
    </Card>
  )

  const filasFiltradas = busqueda.trim()
    ? filas.filter(f => f.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : filas

  const pctCompleto = resumen && resumen.total > 0 ? (resumen.completos / resumen.total) * 100 : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--verde-dark)' }}>Rendición</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {tab === 'lista'
            ? <>Estado de compra por beneficiario · mínimo {FOTOS_REQUERIDAS} fotos de comprobante para marcar completo</>
            : 'Consolidado de compra de ambos segmentos'}
        </p>
      </div>

      {/* Sub-tabs Lista/Resumen -- ver comentario en RendicionPageInner */}
      <div className="flex gap-2">
        {([
          { id: 'lista' as const, label: 'Lista', icon: ClipboardList },
          { id: 'resumen' as const, label: 'Resumen', icon: BarChart3 },
        ]).map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all"
              style={active
                ? { background: 'var(--verde)', color: '#fff' }
                : { background: 'rgba(0,0,0,0.05)', color: 'var(--text-muted)' }}
            >
              <Icon size={15} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'resumen' && <VistaResumenContent />}

      {tab === 'lista' && <>

      {/* Totales -- la pregunta que la pantalla tiene que contestar sin que
          nadie sume a mano: cuánta plata mueve la comunidad, cuánta está
          rendida y cuánta falta. Mobile primero: una columna, cifras
          grandes, tabular-nums para que alineen entre sí. */}
      <Card className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-4">
          <ProgresoDonut pct={pctCompleto} />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Avance de rendición
            </p>
            <p className="text-2xl font-bold leading-tight tabular-nums" style={{ color: '#1c1c1c' }}>
              {resumen?.completos ?? 0} <span className="text-base font-semibold" style={{ color: 'var(--text-muted)' }}>de {resumen?.total ?? 0} socios</span>
            </p>
            <p className="text-sm font-semibold" style={{ color: 'var(--verde-dark)' }}>{pctCompleto.toFixed(0)}% completo</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.07)' }}>
          <TotalCelda
            etiqueta="Total cotizado"
            monto={totales.cotizado}
            detalle={`${resumen?.total ?? 0} socios`}
            color="#1c1c1c"
            destacado
          />
          <TotalCelda
            etiqueta="Rendido"
            monto={totales.rendido}
            detalle={`${totales.sociosRendidos} socio${totales.sociosRendidos === 1 ? '' : 's'} con compra completa`}
            color="var(--verde-dark)"
          />
          <TotalCelda
            etiqueta="Por rendir"
            monto={totales.porRendir}
            detalle={`${totales.sociosPorRendir} socio${totales.sociosPorRendir === 1 ? '' : 's'} pendiente${totales.sociosPorRendir === 1 ? '' : 's'}`}
            color="var(--cafe-dark)"
          />
        </div>

        {totales.filasParciales > 0 && (
          <p className="text-xs" style={{ color: 'var(--cafe-dark)' }}>
            * {totales.filasParciales} socio{totales.filasParciales === 1 ? '' : 's'} con total parcial
            (ítems sin precio o sin carrito): no están sumados completos acá.
          </p>
        )}

        {/* Por segmento: mismo dato en plata, no solo en conteo */}
        <div className="space-y-3 pt-1" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
          {Object.entries(resumen?.porSegmento ?? {}).map(([seg, d]) => {
            const color = SEG_COLOR[seg] ?? 'var(--cafe)'
            const pct = d.total > 0 ? (d.completos / d.total) * 100 : 0
            return (
              <div key={seg}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold truncate" style={{ color }}>{seg}</p>
                  <p className="text-sm font-bold shrink-0 tabular-nums" style={{ color: '#1c1c1c' }}>
                    {formatCLP(d.montoRendido)}
                    <span className="font-medium" style={{ color: 'var(--text-muted)' }}> / {formatCLP(d.monto)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
                    <div
                      className="h-full rounded-full transition-[width] duration-300 ease-out"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                  <span className="text-xs shrink-0 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {d.completos}/{d.total}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Búsqueda — con 30+ beneficiarios el único mecanismo de navegación
          antes de esto era scroll; filtra ambas vistas (mobile y desktop). */}
      {filas.length > 8 && (
        <Input
          type="search"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar beneficiario por nombre…"
          aria-label="Buscar beneficiario"
        />
      )}

      {filasFiltradas.length === 0 && (
        <Card className="p-6 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No encontramos a nadie llamado &ldquo;{busqueda}&rdquo;.
          </p>
        </Card>
      )}

      {/* Tarjetas — mobile: una fila de tabla es ilegible en pantalla chica
          (8 columnas, min-w-[900px] forzaba scroll horizontal). Estado y
          "Marcar completo" quedan siempre visibles porque es la acción que
          el staff hace en terreno; proveedor estimado/de compra queda detrás
          de "Ver detalle" por ser configuración ocasional. */}
      <div className="lg:hidden space-y-3">
        {filasFiltradas.map(f => (
          <FilaCardMobile
            key={f.id}
            f={f}
            proveedores={proveedores}
            busy={busyId === f.id}
            subiendo={subiendoId === f.id}
            fotoErrorMsg={fotoError?.id === f.id ? fotoError.mensaje : null}
            expanded={expandedIds.has(f.id)}
            onToggleExpanded={() => toggleExpanded(f.id)}
            onSetProveedor={pid => setProveedorCompra(f.id, pid)}
            onMarcarCompleto={() => marcarCompleto(f.id)}
            onRevertir={() => revertir(f.id)}
            onUploadFoto={file => subirFotoStaff(f.id, file)}
            onOpenLightbox={i => setLightbox({ nombre: f.nombre, fotos: f.fotos, index: i })}
            onVerCotizacion={() => setDetalle(f)}
          />
        ))}
      </div>

      {/* Tabla — desktop / tablet */}
      {filasFiltradas.length > 0 && (
      <Card className="hidden lg:block overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                <th className="text-left font-semibold px-4 py-3" style={{ color: 'var(--text-muted)' }}>Beneficiario</th>
                <th className="text-left font-semibold px-4 py-3" style={{ color: 'var(--text-muted)' }}>Segmento</th>
                <th className="text-left font-semibold px-4 py-3" style={{ color: 'var(--text-muted)' }}>Proveedor estimado</th>
                <th className="text-left font-semibold px-4 py-3" style={{ color: 'var(--text-muted)' }}>Proveedor de compra</th>
                <th className="text-left font-semibold px-4 py-3" style={{ color: 'var(--text-muted)' }}>Fotos</th>
                <th className="text-right font-semibold px-4 py-3" style={{ color: 'var(--text-muted)' }}>Total cotizado</th>
                <th className="text-left font-semibold px-4 py-3" style={{ color: 'var(--text-muted)' }}>Estado</th>
                <th className="text-right font-semibold px-4 py-3" style={{ color: 'var(--text-muted)' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.map(f => {
                const suficientesFotos = f.fotosCount >= FOTOS_REQUERIDAS
                return (
                  <tr key={f.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td className="px-4 py-3 font-medium max-w-[220px]" style={{ color: '#1c1c1c' }}>
                      <button
                        onClick={() => setDetalle(f)}
                        className="text-left hover:underline underline-offset-2 truncate block w-full"
                        style={{ color: '#1c1c1c' }}
                        title={f.nombre}
                      >
                        {f.nombre}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={f.segmento === 'Invernadero' ? 'verde' : 'cafe'}>{f.segmento}</Badge>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                      {f.proveedorNombre ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={f.proveedorCompraId ?? ''}
                        onChange={e => setProveedorCompra(f.id, e.target.value || null)}
                        disabled={busyId === f.id}
                        aria-label={`Proveedor de compra confirmado de ${f.nombre}`}
                        className="rounded-lg border px-2 py-1.5 text-xs bg-white/70 border-black/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--verde)]"
                        style={{ color: f.proveedorCompraId ? 'var(--verde-dark)' : 'var(--text-muted)', fontWeight: f.proveedorCompraId ? 600 : 400 }}
                      >
                        <option value="">Sin confirmar</option>
                        {proveedores.map(p => (
                          <option key={p.id} value={p.id}>{p.nombre}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {f.fotos.length === 0 ? (
                          <span className="flex items-center gap-1 text-xs mr-1" style={{ color: 'var(--text-muted)' }}>
                            <ImageOff size={13} /> sin fotos
                          </span>
                        ) : (
                          <>
                            {f.fotos.slice(0, 4).map((foto, i) => (
                              <button
                                key={foto.id}
                                onClick={() => setLightbox({ nombre: f.nombre, fotos: f.fotos, index: i })}
                                className="w-8 h-8 rounded-md overflow-hidden shrink-0 transition-transform hover:scale-105 active:scale-95"
                                style={{ border: '1px solid rgba(0,0,0,0.08)' }}
                                aria-label={`Ver foto ${i + 1} de ${f.nombre}`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={foto.url} alt="" className="w-full h-full object-cover" />
                              </button>
                            ))}
                            <span className="text-xs ml-1 mr-1" style={{ color: suficientesFotos ? 'var(--verde-dark)' : 'var(--cafe)' }}>
                              {f.fotosCount}/{FOTOS_REQUERIDAS}
                            </span>
                          </>
                        )}
                        {f.fotosCount < MAX_FOTOS_POR_SOCIO && (
                          <label
                            className="w-8 h-8 rounded-md border-2 border-dashed flex items-center justify-center shrink-0 cursor-pointer transition-colors hover:border-[var(--verde)] hover:text-[var(--verde-dark)] focus-within:ring-2 focus-within:ring-[var(--verde)] focus-within:ring-offset-1"
                            style={{ borderColor: 'rgba(0,0,0,0.15)', color: 'var(--text-muted)' }}
                            aria-label={`Subir foto por ${f.nombre}`}
                          >
                            <Upload size={13} />
                            <input
                              ref={el => { fileInputRefs.current[f.id] = el }}
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                              className="hidden"
                              disabled={subiendoId === f.id}
                              onChange={e => {
                                const file = e.target.files?.[0]
                                if (file) subirFotoStaff(f.id, file)
                              }}
                            />
                          </label>
                        )}
                      </div>
                      {fotoError?.id === f.id && (
                        <p className="text-xs mt-1" style={{ color: 'var(--cafe-dark)' }}>{fotoError.mensaje}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium"><TotalCotizado f={f} /></td>
                    <td className="px-4 py-3">
                      <Badge tone={f.compraCompleta ? 'verde' : 'neutral'}>
                        {f.compraCompleta && <CheckCircle2 size={12} />}
                        {f.compraCompleta ? 'Completo' : 'Pendiente'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {f.compraCompleta ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => revertir(f.id)}
                          disabled={busyId === f.id}
                        >
                          <RotateCcw size={12} /> Revertir
                        </Button>
                      ) : (
                        <div className="inline-block group relative">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => marcarCompleto(f.id)}
                            disabled={!suficientesFotos || busyId === f.id}
                          >
                            {busyId === f.id ? '...' : 'Marcar completo'}
                          </Button>
                          {!suficientesFotos && (
                            <span
                              role="tooltip"
                              className="pointer-events-none absolute right-0 top-full mt-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10"
                              style={{ background: '#1c1c1c', color: '#fff' }}
                            >
                              Faltan fotos: {f.fotosCount} de {FOTOS_REQUERIDAS}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
      )}

      {lightbox && (
        <Lightbox
          nombre={lightbox.nombre}
          fotos={lightbox.fotos}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={i => setLightbox(prev => prev ? { ...prev, index: i } : prev)}
        />
      )}

      {detalle && (
        <DetalleCotizacionModal f={detalle} onClose={() => setDetalle(null)} />
      )}
      </>}
    </div>
  )
}

function DetalleCotizacionModal({ f, onClose }: { f: FilaRendicion; onClose: () => void }) {
  const proveedorReferencia = f.proveedorCompraNombre ?? f.proveedorNombre
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 motion-safe:animate-[fadeIn_150ms_ease-out]"
      onClick={onClose}
    >
      <div
        className="relative max-w-lg w-full rounded-2xl overflow-hidden motion-safe:animate-[scaleIn_180ms_ease-out]"
        style={{ background: '#f7f3ed', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 pt-4 pb-3 shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
          <div>
            <p className="font-bold text-base" style={{ color: '#1c1c1c' }}>{f.nombre}</p>
            <Badge tone={f.segmento === 'Invernadero' ? 'verde' : 'cafe'} className="mt-1 !text-xs">{f.segmento}</Badge>
          </div>
          <button onClick={onClose} className="rounded-full p-2" style={{ background: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.5)' }} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Proveedor {f.proveedorCompraNombre ? 'de compra' : 'de referencia'}</span>
            <span className="font-semibold" style={{ color: proveedorReferencia ? 'var(--verde-dark)' : 'var(--text-muted)' }}>
              {proveedorReferencia ?? 'sin definir'}
            </span>
          </div>

          {f.items.length === 0 ? (
            <Alert tone="error">
              Este beneficiario no tiene productos cargados en su carrito. Revisar en la pestaña Beneficiarios.
            </Alert>
          ) : (
            <ul className="space-y-2">
              {f.items.map(item => (
                <li key={item.id} className="flex items-center justify-between gap-3 text-sm rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.6)' }}>
                  <div className="min-w-0">
                    <p className="font-medium truncate" style={{ color: '#1c1c1c' }}>
                      {item.insumoNombre} × {item.cantidad}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {item.formatoVenta ?? '—'}
                      {item.precioUnitario !== null && <> · {formatCLP(item.precioUnitario)} c/u</>}
                    </p>
                  </div>
                  <span className="font-semibold shrink-0" style={{ color: item.subtotal !== null ? 'var(--verde-dark)' : 'var(--cafe)' }}>
                    {item.subtotal !== null ? formatCLP(item.subtotal) : 'sin precio'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {f.itemsSinPrecio > 0 && (
            <p className="text-xs" style={{ color: 'var(--cafe)' }}>
              {f.itemsSinPrecio} ítem{f.itemsSinPrecio > 1 ? 's' : ''} sin precio cotizado en este proveedor.
            </p>
          )}

          <div className="flex justify-between text-base pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
            <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>
              {f.totalEsCompleto ? 'Total cotizado' : 'Total parcial'}
            </span>
            <TotalCotizado f={f} className="font-bold" />
          </div>
        </div>
      </div>
    </div>
  )
}

function Lightbox({ nombre, fotos, index, onClose, onNavigate }: {
  nombre: string
  fotos: Foto[]
  index: number
  onClose: () => void
  onNavigate: (i: number) => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onNavigate((index + 1) % fotos.length)
      if (e.key === 'ArrowLeft') onNavigate((index - 1 + fotos.length) % fotos.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, fotos.length, onClose, onNavigate])

  const foto = fotos[index]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 motion-safe:animate-[fadeIn_150ms_ease-out]"
      onClick={onClose}
    >
      <div
        className="relative max-w-3xl w-full motion-safe:animate-[scaleIn_180ms_ease-out]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-sm font-medium text-white">{nombre} · foto {index + 1} de {fotos.length}</p>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="rounded-2xl overflow-hidden bg-black/20" style={{ maxHeight: '75vh' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto.url} alt={`Comprobante de ${nombre}`} className="w-full h-full object-contain max-h-[75vh]" />
        </div>
        {fotos.length > 1 && (
          <div className="flex justify-center gap-2 mt-3">
            {fotos.map((_, i) => (
              <button
                key={i}
                onClick={() => onNavigate(i)}
                className="w-1.5 h-1.5 rounded-full transition-all"
                style={{ background: i === index ? '#fff' : 'rgba(255,255,255,0.4)' }}
                aria-label={`Ver foto ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FilaCardMobile({
  f, proveedores, busy, subiendo, fotoErrorMsg, expanded,
  onToggleExpanded, onSetProveedor, onMarcarCompleto, onRevertir, onUploadFoto, onOpenLightbox, onVerCotizacion,
}: {
  f: FilaRendicion
  proveedores: ProveedorOpcion[]
  busy: boolean
  subiendo: boolean
  fotoErrorMsg: string | null
  expanded: boolean
  onToggleExpanded: () => void
  onSetProveedor: (proveedorId: string | null) => void
  onMarcarCompleto: () => void
  onRevertir: () => void
  onUploadFoto: (file: File) => void
  onOpenLightbox: (index: number) => void
  onVerCotizacion: () => void
}) {
  const suficientesFotos = f.fotosCount >= FOTOS_REQUERIDAS

  return (
    <Card className="p-4 space-y-3">
      {/* Nombre + segmento + estado -- lo primero que el staff necesita leer */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold truncate" style={{ color: '#1c1c1c' }}>{f.nombre}</p>
          <Badge tone={f.segmento === 'Invernadero' ? 'verde' : 'cafe'} className="mt-1 !text-xs">
            {f.segmento}
          </Badge>
        </div>
        <Badge tone={f.compraCompleta ? 'verde' : 'neutral'} className="shrink-0 !text-sm !px-3 !py-1.5">
          {f.compraCompleta && <CheckCircle2 size={14} />}
          {f.compraCompleta ? 'Completo' : 'Pendiente'}
        </Badge>
      </div>

      {/* Total cotizado */}
      <button
        onClick={onVerCotizacion}
        className="w-full flex items-center justify-between text-base"
        style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '0.75rem' }}
      >
        <span className="underline underline-offset-2" style={{ color: 'var(--text-muted)' }}>
          {f.totalEsCompleto ? 'Total cotizado' : 'Total parcial'} · ver detalle
        </span>
        <TotalCotizado f={f} className="font-bold" />
      </button>

      {/* Fotos -- siempre visibles: es la acción diaria más frecuente
          (incluye admin subiendo por socios sin celular). */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          {f.fotos.length === 0 ? (
            <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
              <ImageOff size={16} /> sin fotos
            </span>
          ) : (
            <>
              {f.fotos.slice(0, 4).map((foto, i) => (
                <button
                  key={foto.id}
                  onClick={() => onOpenLightbox(i)}
                  className="w-11 h-11 rounded-lg overflow-hidden shrink-0 transition-transform active:scale-95"
                  style={{ border: '1px solid rgba(0,0,0,0.1)' }}
                  aria-label={`Ver foto ${i + 1} de ${f.nombre}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foto.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
              <span className="text-sm font-semibold" style={{ color: suficientesFotos ? 'var(--verde-dark)' : 'var(--cafe-dark)' }}>
                {f.fotosCount}/{FOTOS_REQUERIDAS}
              </span>
            </>
          )}
          {f.fotosCount < MAX_FOTOS_POR_SOCIO && (
            <label
              className="w-11 h-11 rounded-lg border-2 border-dashed flex items-center justify-center shrink-0 cursor-pointer transition-colors hover:border-[var(--verde)] hover:text-[var(--verde-dark)] focus-within:ring-2 focus-within:ring-[var(--verde)] focus-within:ring-offset-1"
              style={{ borderColor: 'rgba(0,0,0,0.2)', color: 'var(--text-muted)' }}
              aria-label={`Subir foto por ${f.nombre}`}
            >
              <Upload size={16} />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="hidden"
                disabled={subiendo}
                onChange={e => {
                  const file = e.target.files?.[0]
                  // Reset síncrono acá (no vía ref después del upload) para
                  // permitir re-seleccionar el mismo archivo sin depender de
                  // un ref compartido con la fila desktop.
                  e.target.value = ''
                  if (file) onUploadFoto(file)
                }}
              />
            </label>
          )}
        </div>
        {fotoErrorMsg && (
          <p className="text-sm mt-1.5" style={{ color: 'var(--cafe-dark)' }}>{fotoErrorMsg}</p>
        )}
      </div>

      {/* Acción principal -- botón de ancho completo, fácil de tocar */}
      {f.compraCompleta ? (
        <Button
          variant="secondary"
          className="w-full !text-base !py-3"
          onClick={onRevertir}
          disabled={busy}
        >
          <RotateCcw size={16} /> Revertir
        </Button>
      ) : (
        <div className="space-y-1.5">
          <Button
            variant="primary"
            className="w-full !text-base !py-3"
            onClick={onMarcarCompleto}
            disabled={!suficientesFotos || busy}
          >
            {busy ? 'Guardando…' : 'Marcar completo'}
          </Button>
          {!suficientesFotos && (
            <p className="text-sm text-center" style={{ color: 'var(--cafe-dark)' }}>
              Faltan fotos: {f.fotosCount} de {FOTOS_REQUERIDAS}
            </p>
          )}
        </div>
      )}

      {/* Detalle -- proveedor estimado/confirmado, configuración ocasional */}
      <button
        onClick={onToggleExpanded}
        className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold py-2"
        style={{ color: 'var(--verde-dark)' }}
        aria-expanded={expanded}
      >
        {expanded ? 'Ocultar detalle' : 'Ver detalle de proveedor'}
        <ChevronDown size={16} className={expanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {expanded && (
        <div className="space-y-3 pt-1" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Proveedor estimado</p>
            <p className="text-base font-medium" style={{ color: '#1c1c1c' }}>
              {f.proveedorNombre ?? '—'}
            </p>
          </div>
          <div>
            <label className="text-sm font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Proveedor de compra confirmado
            </label>
            <select
              value={f.proveedorCompraId ?? ''}
              onChange={e => onSetProveedor(e.target.value || null)}
              disabled={busy}
              aria-label={`Proveedor de compra confirmado de ${f.nombre}`}
              className="w-full rounded-lg border px-3 py-2.5 text-base bg-white/70 border-black/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--verde)]"
              style={{ color: f.proveedorCompraId ? 'var(--verde-dark)' : 'var(--text-muted)', fontWeight: f.proveedorCompraId ? 600 : 400 }}
            >
              <option value="">Sin confirmar</option>
              {proveedores.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </Card>
  )
}
