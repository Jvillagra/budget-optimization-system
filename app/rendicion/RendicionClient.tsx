'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { X, ImageOff, CheckCircle2, RotateCcw, Upload, ChevronDown, ClipboardList, BarChart3, Trash2, Lock } from 'lucide-react'
import { formatCLP } from '@/lib/business-logic'
import { FOTOS_REQUERIDAS } from '@/lib/constants'
import { Card, Button, Badge, Input, Alert, Skeleton, ConfirmDialog } from '@/components/design-system'
import { PageHeader } from '@/components/Editorial'
import { VistaResumenContent } from '@/components/VistaResumenContent'
import { PanelControl, ESTADOS, estadoDe, type EstadoSocio } from './GraficosRendicion'

/** Lista de nombres para el diálogo de confirmación. Con 20 socios listos,
 *  volcarlos todos convertía la descripción en un párrafo que nadie lee y que
 *  empujaba los botones fuera de la pantalla en un celular. Se nombran los
 *  primeros y se cuenta el resto: lo que la persona necesita verificar es el
 *  orden de magnitud y que reconoce a quiénes va, no la lista completa. */
function nombresResumidos(nombres: string[], tope = 5) {
  if (nombres.length <= tope) return nombres.join(', ')
  return `${nombres.slice(0, tope).join(', ')} y ${nombres.length - tope} más`
}

type CausaError = 'red' | 'sesion' | 'servidor'

/** Traduce un fallo de fetch a una causa accionable. Un throw del propio
 *  fetch (TypeError) es siempre de red: el navegador no llego a hablar con
 *  el servidor. Un 401/403 es sesion vencida, que se arregla volviendo a
 *  entrar, no reintentando. */
function causaDe(res: Response | null, navegadorOnline: boolean): CausaError {
  if (!res) return navegadorOnline ? 'servidor' : 'red'
  if (res.status === 401 || res.status === 403) return 'sesion'
  return 'servidor'
}

const COPY_ERROR: Record<CausaError, { titulo: string; detalle: string; accion: string }> = {
  red: {
    titulo: 'Sin conexión',
    detalle: 'No pudimos contactar al servidor. Las fotos y los datos que ya se guardaron están a salvo: no se pierde nada por esperar a tener señal.',
    accion: 'Reintentar',
  },
  sesion: {
    titulo: 'Tu sesión expiró',
    detalle: 'Por seguridad la sesión se cierra sola cada cierto tiempo. Nada de lo que hiciste se perdió; solo hay que volver a entrar.',
    accion: 'Ir a iniciar sesión',
  },
  servidor: {
    titulo: 'No pudimos cargar la rendición',
    detalle: 'El servidor respondió con un error. Lo que ya estaba guardado sigue guardado; esto es un problema de lectura, no de tus datos.',
    accion: 'Reintentar',
  },
}

// lib/r2.ts es server-only, así que se duplica la constante acá (mismo
// patrón que ya usa app/mi-dashboard/page.tsx).
const MAX_FOTOS_POR_SOCIO = 5

// `thumbUrl` = miniatura de 800px (la que va en la grilla de 44px); `url` =
// version de 2400px, solo al abrir el lightbox. Ver lib/imagen.ts.
type Foto = { id: string; uploaded_at: string; url: string; thumbUrl: string }
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
  // El error de carga distingue causa: sin conexion, sesion vencida y fallo
  // de servidor piden acciones distintas de la persona, y "Error al cargar"
  // a secas no dice ninguna. La escena real de este producto (terreno, senal
  // mala; ver PRODUCT.md) hace que "sin conexion" sea el caso mas frecuente,
  // no el borde. El error que llega del servidor ya renderizado no puede ser
  // de red por definicion: si el HTML llego, hubo conexion.
  const [loadError, setLoadError] = useState<CausaError | null>(initialError ? 'servidor' : null)
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
  // Marcado en lote de los socios que ya tienen sus comprobantes completos.
  const [confirmandoLote, setConfirmandoLote] = useState(false)
  const [lote, setLote] = useState<{ hechos: number; total: number; fallidos: number } | null>(null)

  function toggleExpanded(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function cargar() {
    setLoading(true)
    setLoadError(null)
    // El fetch se atrapa aparte del parseo: un throw acá es red caída, un
    // res.ok falso es el servidor contestando mal. Colapsarlos en un solo
    // catch era lo que producía el mensaje genérico.
    const res = await fetch('/api/rendicion').catch(() => null)
    if (!res || !res.ok) {
      setLoadError(causaDe(res, typeof navigator === 'undefined' || navigator.onLine))
      setLoading(false)
      return
    }
    try {
      const { beneficiarios, proveedores: provs } = await res.json()
      setFilas(beneficiarios ?? [])
      setProveedores(provs ?? [])
    } catch {
      setLoadError('servidor')
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

  /** Marca completos, de una sola pasada, a todos los socios que ya reunieron
   *  sus comprobantes. El staff repite exactamente esta decisión hasta 29
   *  veces por ciclo y hasta ahora solo podía hacerlo tarjeta por tarjeta.
   *
   *  Secuencial y no en paralelo a propósito: con señal mala 20 peticiones
   *  simultáneas se pisan entre sí y no hay forma de decir cuáles pasaron.
   *  Así cada una que entra actualiza su fila de inmediato, el progreso es
   *  real ("12 de 20") y una caída a mitad de camino deja el trabajo hecho
   *  hasta ahí, no un estado desconocido. */
  async function marcarLote(ids: string[]) {
    setConfirmandoLote(false)
    setLote({ hechos: 0, total: ids.length, fallidos: 0 })
    let hechos = 0
    let fallidos = 0
    for (const id of ids) {
      const res = await fetch(`/api/rendicion/${id}/completar`, { method: 'POST' }).catch(() => null)
      if (res?.ok) {
        const { data } = await res.json()
        setFilas(prev => prev.map(f => f.id === id
          ? { ...f, compraCompleta: data.compra_completa, compraCompletaAt: data.compra_completa_at }
          : f))
        hechos++
      } else {
        fallidos++
      }
      setLote({ hechos, total: ids.length, fallidos })
    }
    // El resultado queda en pantalla unos segundos: si algo falló, la persona
    // tiene que poder leer cuántos quedaron sin marcar antes de que se vaya.
    setTimeout(() => setLote(null), fallidos > 0 ? 8000 : 3000)
  }

  async function eliminarFoto() {
    if (!fotoAEliminar) return
    const { foto, beneficiarioId } = fotoAEliminar
    setBorrandoFoto(true)
    const res = await fetch(`/api/fotos?id=${encodeURIComponent(foto.id)}`, { method: 'DELETE' }).catch(() => null)
    if (!res?.ok) {
      setFotoError({ id: beneficiarioId, mensaje: 'No pudimos eliminar la foto. Intenta de nuevo.' })
    } else {
      // El servidor revierte "completo" si la rendicion queda bajo el minimo
      // (ver DELETE en app/api/fotos/route.ts); `compraCompleta` viene en
      // null cuando el estado no cambio, y ahi se deja el que ya estaba.
      const cuerpo = await res.json().catch(() => null) as { compraCompleta?: boolean | null } | null
      const revertido = cuerpo?.compraCompleta === false
      // Se saca de la fila y del lightbox a la vez; si era la ultima, el
      // lightbox se cierra porque ya no hay nada que mostrar.
      setFilas(prev => prev.map(f => f.id === beneficiarioId
        ? {
            ...f,
            fotos: f.fotos.filter(x => x.id !== foto.id),
            fotosCount: Math.max(0, f.fotosCount - 1),
            ...(revertido ? { compraCompleta: false } : {}),
          }
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

  if (loadError) {
    const copy = COPY_ERROR[loadError]
    return (
      <Card className="p-8 text-center space-y-3 max-w-md mx-auto">
        <p className="text-base font-semibold" style={{ color: 'var(--alerta)' }}>{copy.titulo}</p>
        <p className="text-sm" style={{ color: 'var(--tinta-70)' }}>{copy.detalle}</p>
        <Button onClick={loadError === 'sesion' ? () => window.location.assign('/login?next=/rendicion') : cargar}>
          {copy.accion}
        </Button>
      </Card>
    )
  }

  const q = busqueda.trim().toLowerCase()
  const filasFiltradas = filas.filter(f =>
    (q === '' || f.nombre.toLowerCase().includes(q)) &&
    (filtroEstado === null || estadoDe(f) === filtroEstado)
  )
  const etiquetaFiltro = ESTADOS.find(e => e.id === filtroEstado)?.label
  // Socios que ya reunieron sus comprobantes y solo esperan la marca. Con uno
  // solo no se ofrece el lote: la tarjeta ya tiene su botón y una barra extra
  // para una acción sería ruido.
  const listosParaMarcar = filas.filter(f => estadoDe(f) === 'listo')

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
              className="nav-item flex items-center gap-2 px-1 mr-8 pb-3 -mb-px text-sm font-semibold transition-colors"
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

      {/* Acción por lote. Aparece solo cuando hay algo que hacer con ella, y
          desaparece sola cuando ya no queda nadie listo -- no es una barra de
          herramientas permanente. */}
      {listosParaMarcar.length > 1 && !lote && (
        <Card className="p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--tinta)' }}>
              {listosParaMarcar.length} socios ya tienen sus {FOTOS_REQUERIDAS} comprobantes
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--tinta-70)' }}>
              Solo falta marcarlos. Se puede revertir uno por uno después.
            </p>
          </div>
          <Button onClick={() => setConfirmandoLote(true)} className="shrink-0">
            <CheckCircle2 size={16} /> Marcar los {listosParaMarcar.length}
          </Button>
        </Card>
      )}

      {lote && (
        <Card className="p-3.5 sm:p-4 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--tinta)' }}>
              {lote.hechos < lote.total
                ? `Marcando… ${lote.hechos} de ${lote.total}`
                : lote.fallidos > 0
                  ? `${lote.hechos} marcados · ${lote.fallidos} no se pudieron`
                  : `Listo: ${lote.hechos} socios marcados`}
            </p>
            <p className="text-sm tabular-nums shrink-0" style={{ color: 'var(--tinta-70)' }}>
              {Math.round((lote.hechos + lote.fallidos) / lote.total * 100)}%
            </p>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--linea)' }}>
            <div
              className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300"
              style={{
                width: `${(lote.hechos + lote.fallidos) / lote.total * 100}%`,
                background: lote.fallidos > 0 ? 'var(--alerta)' : 'var(--marca)',
              }}
            />
          </div>
          {lote.hechos === lote.total - lote.fallidos && lote.fallidos > 0 && (
            <p className="text-xs" style={{ color: 'var(--tinta-70)' }}>
              Los que fallaron siguen pendientes en la lista, sin ningún cambio. Puedes marcarlos
              desde su tarjeta o reintentar el lote.
            </p>
          )}
        </Card>
      )}

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

      {confirmandoLote && (
        <ConfirmDialog
          title={`Marcar ${listosParaMarcar.length} socios como completos`}
          description={`${nombresResumidos(listosParaMarcar.map(f => f.nombre))} ya tienen sus ${FOTOS_REQUERIDAS} comprobantes. Vas a dejar registrada su rendición como completa. Cada uno se puede revertir después desde su tarjeta.`}
          confirmLabel={`Sí, marcar los ${listosParaMarcar.length}`}
          danger={false}
          onConfirm={() => marcarLote(listosParaMarcar.map(f => f.id))}
          onCancel={() => setConfirmandoLote(false)}
        />
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
            <Badge tone={f.segmento === 'Invernadero' ? 'verde' : 'terracota'} className="mt-1 !text-xs">{f.segmento}</Badge>
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
/** "28 ago" -- fecha corta para la linea de estado de cada tarjeta. Es
 *  cliente puro (las filas llegan por fetch), asi que no hay riesgo de
 *  desalineacion de locale entre servidor y navegador. */
function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

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
          <Badge tone={f.segmento === 'Invernadero' ? 'verde' : 'terracota'} className="mt-1 !text-xs">
            {f.segmento}
          </Badge>
        </div>
        {/* El estado dice ademas CUANDO se marco. Sin la fecha, un "completo"
            marcado hace semanas se lee como si lo hubiera puesto el sistema
            solo -- que fue exactamente la confusion que hubo con una socia
            marcada en agosto y revisada en septiembre. */}
        <div className="shrink-0 text-right">
          <Badge tone={f.compraCompleta ? 'solido' : 'neutral'} className="!text-sm !px-3 !py-1.5">
            {f.compraCompleta && <CheckCircle2 size={14} />}
            {f.compraCompleta ? 'Completo' : 'Pendiente'}
          </Badge>
          {f.compraCompleta && f.compraCompletaAt && (
            <p className="text-xs mt-1.5 whitespace-nowrap" style={{ color: 'var(--tinta-70)' }}>
              Marcado el {fechaCorta(f.compraCompletaAt)}
            </p>
          )}
        </div>
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
          (incluye admin subiendo por socios sin celular). El conteo estaba
          solo en el aria-label de las barras: el requisito es de tres y el
          numero tiene que verse, no deducirse de cuantas barras se pintaron. */}
      <div>
        <div className="flex items-baseline justify-between gap-2 mb-1.5">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>Comprobantes</span>
          <span
            className="text-sm font-semibold tabular-nums"
            style={{ color: suficientesFotos ? 'var(--tinta)' : 'var(--tinta-70)' }}
          >
            {f.fotosCount} de {FOTOS_REQUERIDAS}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {f.fotos.length === 0 ? (
            <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--tinta-45)' }}>
              <ImageOff size={16} /> Ninguna todavía
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
                  <img src={foto.thumbUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
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
          <p className="text-sm mt-1.5" style={{ color: 'var(--alerta)' }}>{fotoErrorMsg}</p>
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
          <RotateCcw size={16} /> Revertir a pendiente
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
        /* Subir sigue siendo la accion grande, pero "Marcar completo" ya no
           desaparece: que la accion no exista en pantalla hasta la tercera
           foto hacia creer que el admin no podia cerrar una rendicion. Se
           muestra bloqueada, con el requisito escrito debajo. */
        <div className="space-y-2">
          <label
            className="inline-flex w-full items-center justify-center gap-2 rounded-[4px] font-semibold text-base py-3 min-h-[48px] cursor-pointer transition-all active:scale-[0.97]"
            style={{ background: 'var(--marca)', color: 'var(--papel)', opacity: subiendo ? 0.5 : 1 }}
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
          <div className="space-y-1.5">
            {/* El disabled del sistema baja la opacidad al 40%: sobre papel
                el texto queda en ~2:1 y la accion se vuelve ilegible, que es
                justo lo contrario de lo que se busca aca. Se anula esa
                opacidad y el estado inerte lo comunican el candado, el color
                apagado y el cursor. */}
            <Button
              variant="secondary"
              className="w-full !text-base !py-3 disabled:!opacity-100 disabled:cursor-not-allowed"
              style={{ color: 'var(--tinta-70)', borderColor: 'var(--linea)' }}
              disabled
            >
              <Lock size={15} /> Marcar completo
            </Button>
            <p className="text-sm text-center" style={{ color: 'var(--tinta-70)' }}>
              Se habilita con {FOTOS_REQUERIDAS} comprobantes · {faltan === 1 ? 'falta 1' : `faltan ${faltan}`}
            </p>
          </div>
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
