'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { X, ImageOff, CheckCircle2, RotateCcw, Upload, ChevronDown, ClipboardList, BarChart3, Trash2 } from 'lucide-react'
import { formatCLP } from '@/lib/business-logic'
import { FOTOS_REQUERIDAS } from '@/lib/constants'
import { Card, Button, Badge, Input, Alert, Skeleton, ConfirmDialog } from '@/components/design-system'
import { PageHeader } from '@/components/Editorial'
import { VistaResumenContent } from '@/components/VistaResumenContent'
import { PanelControl, ESTADOS, estadoDe, type EstadoSocio } from './GraficosRendicion'

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
/** Un total parcial (faltan precios, o no hay carrito) no se presenta igual
 *  que una cotización completa: se marca en ámbar y con un título que dice
 *  por qué. Mismo criterio que el PDF de la consultora. */
function TotalCotizado({ f, className }: { f: FilaRendicion; className?: string }) {
  if (f.totalEsCompleto) {
    return <span className={className} style={{ color: 'var(--tinta)' }}>{formatCLP(f.total)}</span>
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
  const [filtroEstado, setFiltroEstado] = useState<EstadoSocio | null>(null)
  // Borrar una foto ya subida: el endpoint (DELETE /api/fotos) siempre lo
  // permitio al staff, pero la unica pantalla que lo ofrecia era la del
  // socio (/mi-dashboard). Sin esto, una foto movida o repetida cargada por
  // un admin no habia forma de sacarla.
  const [fotoAEliminar, setFotoAEliminar] = useState<{ foto: Foto; beneficiarioId: string; nombre: string } | null>(null)
  const [borrandoFoto, setBorrandoFoto] = useState(false)

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

  async function eliminarFoto() {
    if (!fotoAEliminar) return
    const { foto, beneficiarioId } = fotoAEliminar
    setBorrandoFoto(true)
    const res = await fetch(`/api/fotos?id=${encodeURIComponent(foto.id)}`, { method: 'DELETE' }).catch(() => null)
    if (!res?.ok) {
      setFotoError({ id: beneficiarioId, mensaje: 'No pudimos eliminar la foto. Intenta de nuevo.' })
    } else {
      // Se saca de la fila y del lightbox a la vez; si era la ultima, el
      // lightbox se cierra porque ya no hay nada que mostrar.
      setFilas(prev => prev.map(f => f.id === beneficiarioId
        ? { ...f, fotos: f.fotos.filter(x => x.id !== foto.id), fotosCount: Math.max(0, f.fotosCount - 1) }
        : f))
      setLightbox(prev => {
        if (!prev) return prev
        const fotos = prev.fotos.filter(x => x.id !== foto.id)
        if (fotos.length === 0) return null
        return { ...prev, fotos, index: Math.min(prev.index, fotos.length - 1) }
      })
    }
    setBorrandoFoto(false)
    setFotoAEliminar(null)
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
      // El input lo resetea la propia tarjeta, síncrono en su onChange, para
      // poder volver a elegir el mismo archivo. Antes hacía falta además un
      // ref compartido con la fila de la tabla desktop, que ya no existe.
    }
  }

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

  const q = busqueda.trim().toLowerCase()
  const filasFiltradas = filas.filter(f =>
    (q === '' || f.nombre.toLowerCase().includes(q)) &&
    (filtroEstado === null || estadoDe(f) === filtroEstado)
  )
  const etiquetaFiltro = ESTADOS.find(e => e.id === filtroEstado)?.label

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="03 / Rendición"
        titulo={tab === 'lista' ? <>Quién ya<br /><em>rindió.</em></> : <>Todo lo que<br /><em>hay que comprar.</em></>}
        bajada={tab === 'lista'
          ? <>Cada socio necesita {FOTOS_REQUERIDAS} fotos de sus comprobantes para quedar completo.</>
          : 'Consolidado de la compra de los dos proyectos, con el total de cada uno.'}
      />

      {/* Sub-tabs Lista/Resumen -- ver comentario en RendicionPageInner */}
      <div className="flex" style={{ borderBottom: '1px solid var(--linea)' }}>
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
              className="flex items-center gap-2 px-1 mr-8 pb-3 -mb-px text-sm font-semibold transition-colors"
              style={{
                color: active ? 'var(--tinta)' : 'var(--tinta-45)',
                borderBottom: active ? '2px solid var(--tinta)' : '2px solid transparent',
              }}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={15} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'resumen' && <VistaResumenContent />}

      {tab === 'lista' && <>

      {/* Panel de control: avance, etapa de cada socio (con filtro), plata,
          presupuesto y proveedor. Ver app/rendicion/GraficosRendicion.tsx. */}
      <Card className="p-3 sm:p-4">
        <PanelControl filas={filas} filtro={filtroEstado} onFiltro={setFiltroEstado} />
      </Card>

      {/* Búsqueda — con 30+ beneficiarios el único mecanismo de navegación
          antes de esto era scroll; filtra ambas vistas (mobile y desktop). */}
      {etiquetaFiltro && (
        <p className="text-sm font-semibold" style={{ color: 'var(--verde-dark)' }}>
          Mostrando {filasFiltradas.length} de {filas.length} · {etiquetaFiltro}
        </p>
      )}

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
            {q
              ? <>No encontramos a nadie llamado &ldquo;{busqueda}&rdquo;{etiquetaFiltro ? ` en “${etiquetaFiltro}”` : ''}.</>
              : <>Ningún socio en &ldquo;{etiquetaFiltro}&rdquo;.</>}
          </p>
        </Card>
      )}

      {/* Una tarjeta por socio, en grilla. Antes esto era solo mobile y en
          desktop había una tabla de 8 columnas con min-w-[900px]: obligaba a
          scroll horizontal y dejaba el dato importante (cuántas fotos faltan)
          en una celda de texto de 12px. La tarjeta muestra lo mismo con la
          foto y el avance a la vista. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filasFiltradas.map(f => (
          <FilaCard
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

      {lightbox && (
        <Lightbox
          nombre={lightbox.nombre}
          fotos={lightbox.fotos}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={i => setLightbox(prev => prev ? { ...prev, index: i } : prev)}
          onEliminar={foto => {
            const fila = filas.find(x => x.fotos.some(y => y.id === foto.id))
            if (fila) setFotoAEliminar({ foto, beneficiarioId: fila.id, nombre: fila.nombre })
          }}
        />
      )}

      {detalle && (
        <DetalleCotizacionModal f={detalle} onClose={() => setDetalle(null)} />
      )}

      {fotoAEliminar && (
        <ConfirmDialog
          title="Eliminar esta foto"
          description={`Se borra el comprobante de ${fotoAEliminar.nombre}. Si con eso baja de ${FOTOS_REQUERIDAS} fotos, su rendición vuelve a quedar pendiente.`}
          confirmLabel="Eliminar foto"
          busy={borrandoFoto}
          onConfirm={eliminarFoto}
          onCancel={() => setFotoAEliminar(null)}
        />
      )}
      </>}
    </div>
  )
}

function DetalleCotizacionModal({ f, onClose }: { f: FilaRendicion; onClose: () => void }) {
  const proveedorReferencia = f.proveedorCompraNombre ?? f.proveedorNombre
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(23,24,21,0.55)] p-4 motion-safe:animate-[fadeIn_150ms_ease-out]"
      onClick={onClose}
    >
      <div
        className="relative max-w-lg w-full rounded-[6px] overflow-hidden motion-safe:animate-[scaleIn_180ms_ease-out]"
        style={{ background: 'var(--papel)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 pt-4 pb-3 shrink-0" style={{ borderBottom: '1px solid var(--linea)' }}>
          <div>
            <p className="font-bold text-base" style={{ color: 'var(--tinta)' }}>{f.nombre}</p>
            <Badge tone={f.segmento === 'Invernadero' ? 'verde' : 'cafe'} className="mt-1 !text-xs">{f.segmento}</Badge>
          </div>
          <button onClick={onClose} className="rounded-full p-2" style={{ background: 'var(--linea)', color: 'var(--tinta-45)' }} aria-label="Cerrar">
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
                <li key={item.id} className="flex items-center justify-between gap-3 text-sm rounded-[6px] p-3" style={{ background: 'var(--papel)' }}>
                  <div className="min-w-0">
                    <p className="font-medium truncate" style={{ color: 'var(--tinta)' }}>
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

          <div className="flex justify-between text-base pt-3" style={{ borderTop: '1px solid var(--linea)' }}>
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

function Lightbox({ nombre, fotos, index, onClose, onNavigate, onEliminar }: {
  nombre: string
  fotos: Foto[]
  index: number
  onClose: () => void
  onNavigate: (i: number) => void
  onEliminar: (foto: Foto) => void
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
          <p className="text-sm font-medium text-[var(--papel)]">{nombre} · foto {index + 1} de {fotos.length}</p>
          <div className="flex items-center gap-1">
            {/* Borrar desde acá y no desde la miniatura: es donde la foto se
                ve completa, así que se decide mirándola, y sirve igual en
                mobile y en desktop sin ensuciar la grilla. */}
            <button
              onClick={() => onEliminar(foto)}
              className="flex items-center gap-1.5 text-[var(--papel)]/80 hover:text-[var(--papel)] px-3 py-2 rounded-[4px] text-sm font-semibold"
              style={{ border: '1px solid rgba(255,255,255,0.3)' }}
            >
              <Trash2 size={15} /> Eliminar
            </button>
            <button onClick={onClose} className="text-[var(--papel)]/80 hover:text-[var(--papel)] p-2" aria-label="Cerrar">
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="rounded-[6px] overflow-hidden bg-black/20" style={{ maxHeight: '75vh' }}>
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
                style={{ background: i === index ? 'var(--papel)' : 'var(--papel-hueco)' }}
                aria-label={`Ver foto ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Avance de comprobantes: una casilla por foto requerida, llenas las que
 *  ya estan. Se lee de un vistazo y no obliga a interpretar una fraccion. */
function ProgresoFotos({ count }: { count: number }) {
  const listo = count >= FOTOS_REQUERIDAS
  return (
    <span
      className="inline-flex items-center gap-1"
      role="img"
      aria-label={`${count} de ${FOTOS_REQUERIDAS} fotos`}
    >
      {Array.from({ length: FOTOS_REQUERIDAS }).map((_, i) => (
        <span
          key={i}
          className="block h-1.5 w-5 rounded-[1px]"
          style={{
            background: i < count ? (listo ? 'var(--acento)' : 'var(--tinta)') : 'var(--linea)',
          }}
        />
      ))}
      {count > FOTOS_REQUERIDAS && (
        <span className="text-xs ml-0.5" style={{ color: 'var(--tinta-45)' }}>+{count - FOTOS_REQUERIDAS}</span>
      )}
    </span>
  )
}

function FilaCard({
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
  const faltan = Math.max(0, FOTOS_REQUERIDAS - f.fotosCount)

  return (
    <Card className="p-4 space-y-3">
      {/* Nombre + segmento + estado -- lo primero que el staff necesita leer */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold truncate" style={{ color: 'var(--tinta)' }}>{f.nombre}</p>
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
        style={{ borderTop: '1px solid var(--linea)', paddingTop: '0.75rem' }}
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
            <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--tinta-45)' }}>
              <ImageOff size={16} /> Sin fotos
              <ProgresoFotos count={0} />
            </span>
          ) : (
            <>
              {f.fotos.slice(0, 4).map((foto, i) => (
                <button
                  key={foto.id}
                  onClick={() => onOpenLightbox(i)}
                  className="w-11 h-11 rounded-[4px] overflow-hidden shrink-0 transition-transform active:scale-95"
                  style={{ border: '1px solid var(--linea)' }}
                  aria-label={`Ver foto ${i + 1} de ${f.nombre}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foto.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
              <ProgresoFotos count={f.fotosCount} />
            </>
          )}
          {suficientesFotos && f.fotosCount < MAX_FOTOS_POR_SOCIO && (
            <label
              className="w-11 h-11 rounded-[4px] border-2 border-dashed flex items-center justify-center shrink-0 cursor-pointer transition-colors hover:border-[var(--verde)] hover:text-[var(--verde-dark)] focus-within:ring-2 focus-within:ring-[var(--verde)] focus-within:ring-offset-1"
              style={{ borderColor: 'var(--linea-fuerte)', color: 'var(--text-muted)' }}
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

      {/* Accion principal. Antes "Marcar completo" ocupaba el ancho completo
          aunque estuviera deshabilitado por falta de fotos, y subir una foto
          -- lo que en realidad hay que hacer -- era un cuadrado de 32px. Sin
          fotos suficientes, la accion grande es subir; recien despues
          aparece la de marcar. */}
      {f.compraCompleta ? (
        <Button
          variant="secondary"
          className="w-full !text-base !py-3"
          onClick={onRevertir}
          disabled={busy}
        >
          <RotateCcw size={16} /> Revertir
        </Button>
      ) : suficientesFotos ? (
        <Button
          variant="primary"
          className="w-full !text-base !py-3"
          onClick={onMarcarCompleto}
          disabled={busy}
        >
          {busy ? 'Guardando…' : 'Marcar completo'}
        </Button>
      ) : (
        <div className="space-y-1.5">
          <label
            className="inline-flex w-full items-center justify-center gap-2 rounded-[4px] font-semibold text-base py-3 min-h-[48px] cursor-pointer transition-all active:scale-[0.97]"
            style={{ background: 'var(--tinta)', color: 'var(--papel)', opacity: subiendo ? 0.5 : 1 }}
          >
            <Upload size={17} />
            {subiendo ? 'Subiendo…' : 'Agregar foto'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="hidden"
              disabled={subiendo}
              onChange={e => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) onUploadFoto(file)
              }}
            />
          </label>
          <p className="text-sm text-center" style={{ color: 'var(--tinta-70)' }}>
            {faltan === 1 ? 'Falta 1 foto' : `Faltan ${faltan} fotos`} para poder marcar completo
          </p>
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
        <div className="space-y-3 pt-1" style={{ borderTop: '1px solid var(--linea)' }}>
          <div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Proveedor estimado</p>
            <p className="text-base font-medium" style={{ color: 'var(--tinta)' }}>
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
              className="w-full rounded-[4px] border px-3 py-2.5 text-base bg-[var(--papel-hueco)] border-[var(--linea)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--verde)]"
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
