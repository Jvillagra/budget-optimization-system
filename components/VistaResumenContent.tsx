'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Lock, RotateCcw } from 'lucide-react'
import type {
  Beneficiario, Asignacion, Proveedor, PrecioProveedor, CompraSegmento, PrecioCongelado, Segmento,
} from '@/lib/types'
import { buildPrecioMap, formatCLP } from '@/lib/business-logic'
import { useProveedor } from '@/lib/proveedor-context'
import { Button, ConfirmDialog, Alert } from '@/components/design-system'
import { Reveal } from '@/components/Editorial'

const SEGMENTOS: { seg: Segmento; sigla: 'CP' | 'INV'; nombre: string }[] = [
  { seg: 'Cierre Perimetral', sigla: 'CP', nombre: 'Cierre Perimetral' },
  { seg: 'Invernadero', sigla: 'INV', nombre: 'Invernadero' },
]

interface FilaConsolidado {
  key: string
  insumo_id: string
  nombre: string
  cantidad: number
  precioUnitario: number | null
  formato_venta: string
  seg: Segmento
  /** Solo cuando el insumo lo comparten los dos proyectos (el caso de los
   *  polines): ahí la fila se parte y hay que decir de cuál es cada mitad. */
  tag?: 'CP' | 'INV'
}

interface BaseData {
  beneficiarios: Beneficiario[]
  proveedores: Proveedor[]
  asignaciones: Asignacion[]
  precios: PrecioProveedor[]
  compras: CompraSegmento[]
  preciosCongelados: PrecioCongelado[]
}

/** Consolidado de compra (ex /vista-resumen), embebido como sub-tab de
 * /rendicion -- ver app/rendicion/page.tsx. Se mantiene como componente
 * propio (no inline) porque también lo usa app/vista-resumen/page.tsx, que
 * queda como redirect para no romper enlaces guardados. */
export function VistaResumenContent() {
  const { proveedorId, isLoaded } = useProveedor()
  const [baseData, setBaseData] = useState<BaseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [confirmando, setConfirmando] = useState<Segmento | null>(null)
  const [revirtiendo, setRevirtiendo] = useState<Segmento | null>(null)
  const [busy, setBusy] = useState(false)
  const [accionError, setAccionError] = useState<string | null>(null)

  async function cargar() {
    try {
      const res = await fetch('/api/data')
      if (!res.ok) throw new Error('load failed')
      const d = await res.json()
      setBaseData({
        beneficiarios: d.beneficiarios ?? [],
        proveedores: d.proveedores ?? [],
        asignaciones: d.asignaciones ?? [],
        precios: d.preciosProveedor ?? [],
        compras: d.compras ?? [],
        preciosCongelados: d.preciosCongelados ?? [],
      })
      setLoading(false)
    } catch {
      setLoadError(true)
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const compraDe = useMemo(() => {
    const m = new Map<Segmento, CompraSegmento>()
    for (const c of baseData?.compras ?? []) m.set(c.segmento, c)
    return m
  }, [baseData])

  /** Filas del consolidado, con el segmento siempre resuelto desde el socio
   *  (antes se deducía del nombre del insumo, que solo funcionaba para
   *  "Polines"). Un insumo que aparece en los dos proyectos se parte en dos
   *  filas etiquetadas; uno que solo aparece en uno va sin etiqueta. */
  const filas = useMemo<FilaConsolidado[]>(() => {
    if (!baseData || !isLoaded) return []

    const { beneficiarios, asignaciones, precios, preciosCongelados } = baseData
    const precioMap = buildPrecioMap(precios)
    const congelado = new Map(preciosCongelados.map(p => [`${p.segmento}_${p.insumo_id}`, p.precio_unitario]))

    // Precio de un insumo para un segmento: si ese proyecto ya cerró su
    // compra manda el precio congelado, aunque después alguien haya editado
    // la lista de precios del proveedor.
    const precioDe = (insumoId: string, seg: Segmento): number | null => {
      const compra = compraDe.get(seg)
      if (compra) return congelado.get(`${seg}_${insumoId}`) ?? null
      return proveedorId ? (precioMap.get(`${proveedorId}_${insumoId}`) ?? null) : null
    }

    const segPorBen = new Map(beneficiarios.map(b => [b.id, b.segmento]))
    const acumulado = new Map<string, { insumo_id: string; nombre: string; formato_venta: string; seg: Segmento; cantidad: number }>()

    for (const a of asignaciones) {
      const insumo = a.catalogo_insumos
      const seg = segPorBen.get(a.beneficiario_id)
      if (!insumo || !seg) continue
      // Un insumo marcado para el otro proyecto no entra aunque esté asignado.
      if (insumo.segmento !== 'Ambos' && insumo.segmento !== seg) continue

      const key = `${a.insumo_id}_${seg}`
      const previo = acumulado.get(key)
      acumulado.set(key, {
        insumo_id: a.insumo_id,
        nombre: insumo.nombre,
        formato_venta: insumo.formato_venta,
        seg,
        cantidad: (previo?.cantidad ?? 0) + a.cantidad,
      })
    }

    const segmentosPorInsumo = new Map<string, Set<Segmento>>()
    for (const v of acumulado.values()) {
      const set = segmentosPorInsumo.get(v.insumo_id) ?? new Set<Segmento>()
      set.add(v.seg)
      segmentosPorInsumo.set(v.insumo_id, set)
    }

    return Array.from(acumulado.values())
      .map(v => ({
        key: `${v.insumo_id}_${v.seg}`,
        insumo_id: v.insumo_id,
        nombre: v.nombre,
        cantidad: v.cantidad,
        formato_venta: v.formato_venta,
        seg: v.seg,
        precioUnitario: precioDe(v.insumo_id, v.seg),
        tag: (segmentosPorInsumo.get(v.insumo_id)?.size ?? 0) > 1
          ? (v.seg === 'Cierre Perimetral' ? 'CP' as const : 'INV' as const)
          : undefined,
      }))
      .sort((a, b) => {
        // Compartidos al final (son los que se leen comparando CP vs INV);
        // dentro de ellos, CP antes que INV.
        if (!!a.tag !== !!b.tag) return a.tag ? 1 : -1
        if (a.tag && b.tag && a.tag !== b.tag) return a.tag === 'CP' ? -1 : 1
        return a.nombre.localeCompare(b.nombre)
      })
  }, [baseData, proveedorId, isLoaded, compraDe])

  const subtotal = (f: FilaConsolidado) => (f.precioUnitario ? f.cantidad * f.precioUnitario : 0)

  const totalGasto = filas.reduce((s, f) => s + subtotal(f), 0)
  const hayPrecios = filas.some(f => f.precioUnitario !== null)
  const totalPolines = filas.filter(f => esPolin(f.nombre)).reduce((s, f) => s + f.cantidad, 0)

  const porSegmento = SEGMENTOS.map(({ seg, sigla, nombre }) => {
    const propias = filas.filter(f => f.seg === seg)
    return {
      seg, sigla, nombre,
      gasto: propias.reduce((s, f) => s + subtotal(f), 0),
      polines: propias.filter(f => esPolin(f.nombre)).reduce((s, f) => s + f.cantidad, 0),
      materiales: propias.filter(f => !esPolin(f.nombre)),
      socios: (baseData?.beneficiarios ?? []).filter(b => b.segmento === seg).length,
      compra: compraDe.get(seg) ?? null,
    }
  })

  const proveedor = baseData?.proveedores.find(p => p.id === proveedorId)
  const nombreProveedor = (id: string) => baseData?.proveedores.find(p => p.id === id)?.nombre ?? '—'

  const sinCarrito = useMemo(() => {
    if (!baseData) return []
    const conItems = new Set(baseData.asignaciones.map(a => a.beneficiario_id))
    return baseData.beneficiarios.filter(b => !conItems.has(b.id)).map(b => b.nombre)
  }, [baseData])

  async function confirmarCompra(seg: Segmento) {
    setBusy(true); setAccionError(null)
    const res = await fetch('/api/compras-segmento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ segmento: seg, proveedor_id: proveedorId }),
    }).catch(() => null)
    if (!res?.ok) {
      setAccionError((await res?.json().catch(() => null))?.error ?? 'No se pudo confirmar la compra.')
    } else {
      await cargar()
    }
    setBusy(false); setConfirmando(null)
  }

  async function revertirCompra(seg: Segmento) {
    setBusy(true); setAccionError(null)
    const res = await fetch(`/api/compras-segmento?segmento=${encodeURIComponent(seg)}`, { method: 'DELETE' }).catch(() => null)
    if (!res?.ok) {
      setAccionError((await res?.json().catch(() => null))?.error ?? 'No se pudo revertir la compra.')
    } else {
      await cargar()
    }
    setBusy(false); setRevirtiendo(null)
  }

  function copiar() {
    const lines = [
      'COTIZACIÓN CONSOLIDADA — COMUNIDAD PEDRO HUISCA',
      `Proveedor: ${proveedor?.nombre ?? '—'}`,
      `Fecha: ${new Date().toLocaleDateString('es-CL')}`,
      '',
      'INSUMO\t\tSEGMENTO\tCANTIDAD\tUNIDAD\tPRECIO UNITARIO\tSUBTOTAL',
      ...filas.map(f => {
        const st = f.precioUnitario ? f.cantidad * f.precioUnitario : null
        return `${f.nombre}\t${f.tag ?? ''}\t${f.cantidad}\t${f.formato_venta}\t${f.precioUnitario ? formatCLP(f.precioUnitario) : '—'}\t${st ? formatCLP(st) : '—'}`
      }),
      '',
      `TOTAL COMUNIDAD: ${hayPrecios ? formatCLP(totalGasto) : '—'}`,
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-28 rounded-[6px] animate-pulse" style={{ background: 'var(--papel-hueco)' }} />
        ))}
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="rounded-[6px] p-8 glass text-center space-y-3">
        <p className="titulo-md">No se pudieron cargar los datos</p>
        <p className="text-sm" style={{ color: 'var(--tinta-70)' }}>Revisa tu conexión e intenta nuevamente.</p>
        <Button onClick={() => window.location.reload()}>Reintentar</Button>
      </div>
    )
  }

  const sinProveedorNiCompras = !proveedorId && porSegmento.every(s => !s.compra)

  return (
    <div className="space-y-10">
      {accionError && <Alert tone="error">{accionError}</Alert>}

      {sinProveedorNiCompras ? (
        <div className="rounded-[6px] p-8 glass text-center">
          <p className="text-sm" style={{ color: 'var(--tinta-70)' }}>
            Elige un proveedor en la pantalla de Beneficiarios para ver el consolidado de compra.
          </p>
        </div>
      ) : (
        <>
          {/* ---- Total general -------------------------------------------- */}
          <Reveal>
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <p className="eyebrow">Total general de la compra</p>
                {proveedor && (
                  <p className="text-xs" style={{ color: 'var(--tinta-45)' }}>
                    Cotizado con <span style={{ color: 'var(--tinta)', fontWeight: 600 }}>{proveedor.nombre}</span>
                  </p>
                )}
              </div>
              <p className="titulo-xl mt-3 tabular-nums">
                {hayPrecios ? formatCLP(totalGasto) : '—'}
              </p>

              {/* Barra proporcional CP / INV: el gráfico del total, antes de
                  bajar al detalle de cada proyecto. */}
              {hayPrecios && totalGasto > 0 && (
                <div className="mt-8">
                  <div className="flex h-14 w-full overflow-hidden rounded-[4px]" style={{ border: '1px solid var(--tinta)' }}>
                    {porSegmento.map(({ sigla, gasto }, i) => {
                      const pct = (gasto / totalGasto) * 100
                      if (pct <= 0) return null
                      return (
                        <div
                          key={sigla}
                          className="flex items-center justify-center text-xs font-bold transition-[width] duration-700"
                          style={{
                            width: `${pct}%`,
                            background: i === 0 ? 'var(--tinta)' : 'var(--acento)',
                            color: i === 0 ? 'var(--papel)' : 'var(--tinta)',
                            borderLeft: i === 1 ? '1px solid var(--tinta)' : undefined,
                          }}
                        >
                          {pct >= 12 && `${sigla} ${Math.round(pct)}%`}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </section>
          </Reveal>

          {/* ---- Un panel por proyecto ------------------------------------ */}
          <Reveal delay={80}>
            <section className="grid gap-px sm:grid-cols-2" style={{ background: 'var(--linea)' }}>
              {porSegmento.map(s => (
                <PanelSegmento
                  key={s.seg}
                  {...s}
                  totalGasto={totalGasto}
                  nombreProveedor={nombreProveedor}
                  puedeConfirmar={!!proveedorId}
                  onConfirmar={() => setConfirmando(s.seg)}
                  onRevertir={() => setRevirtiendo(s.seg)}
                />
              ))}
            </section>
          </Reveal>

          {/* ---- Polines: total general, el insumo que comparten ---------- */}
          <Reveal delay={120}>
            <section className="p-6 rounded-[6px]" style={{ background: 'var(--tinta)', color: 'var(--papel)' }}>
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="eyebrow" style={{ color: 'rgba(244,240,231,0.55)' }}>Total de polines</p>
                  <p className="titulo-lg mt-2 tabular-nums">{totalPolines || '—'}</p>
                  <p className="text-xs mt-2" style={{ color: 'rgba(244,240,231,0.55)' }}>
                    Sumando los dos proyectos
                  </p>
                </div>
                <div className="flex gap-8">
                  {porSegmento.map(s => (
                    <div key={s.seg}>
                      <p className="eyebrow" style={{ color: 'rgba(244,240,231,0.55)' }}>{s.sigla}</p>
                      <p className="titulo-md mt-1 tabular-nums">{s.polines || '—'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </Reveal>

          {/* ---- Detalle línea a línea ------------------------------------ */}
          {filas.length > 0 ? (
            <Reveal delay={160}>
              <section>
                <div className="flex items-center justify-between pb-3 mb-1" style={{ borderBottom: '1px solid var(--tinta)' }}>
                  <p className="eyebrow">Detalle de insumos</p>
                  <Button size="sm" variant={copiado ? 'accent' : 'secondary'} onClick={copiar}>
                    {copiado ? '✓ Copiado' : 'Copiar cotización'}
                  </Button>
                </div>

                {/* Mobile: la tabla de 5 columnas obligaba a texto minúsculo o
                    scroll horizontal. Cantidad y subtotal (lo que importa para
                    comprar) quedan grandes; el precio unitario, chico. */}
                <div className="sm:hidden">
                  {filas.map(f => (
                    <div key={f.key} className="py-4" style={{ borderBottom: '1px solid var(--linea)' }}>
                      <p className="text-base font-semibold flex items-center flex-wrap gap-2">
                        {f.nombre}
                        {f.tag && <TagSegmento tag={f.tag} />}
                      </p>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-base tabular-nums" style={{ color: 'var(--tinta-70)' }}>
                          {f.cantidad} {f.formato_venta}
                        </span>
                        <span className="text-lg font-semibold tabular-nums">
                          {f.precioUnitario ? formatCLP(subtotal(f)) : '—'}
                        </span>
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'var(--tinta-45)' }}>
                        {f.precioUnitario ? `${formatCLP(f.precioUnitario)} c/u` : 'Sin precio cargado'}
                      </p>
                    </div>
                  ))}
                  {hayPrecios && (
                    <div className="py-4 flex items-baseline justify-between" style={{ borderTop: '2px solid var(--tinta)' }}>
                      <p className="font-semibold">Total comunidad</p>
                      <p className="titulo-md tabular-nums">{formatCLP(totalGasto)}</p>
                    </div>
                  )}
                </div>

                {/* Tabla -- desktop / tablet */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--linea)' }}>
                        {(['Insumo', 'Cantidad', 'Unidad', 'Precio unit.', 'Subtotal'] as const).map((h, i) => (
                          <th key={h} className={`py-3 eyebrow ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map(f => (
                        <tr key={f.key} style={{ borderBottom: '1px solid var(--linea)' }}>
                          <td className="py-3 font-medium">
                            {f.nombre}
                            {f.tag && <span className="ml-2 inline-block align-middle"><TagSegmento tag={f.tag} /></span>}
                          </td>
                          <td className="py-3 text-right tabular-nums">{f.cantidad}</td>
                          <td className="py-3 text-right text-xs" style={{ color: 'var(--tinta-45)' }}>{f.formato_venta}</td>
                          <td className="py-3 text-right tabular-nums" style={{ color: 'var(--tinta-70)' }}>
                            {f.precioUnitario ? formatCLP(f.precioUnitario) : <span className="text-xs">Sin precio</span>}
                          </td>
                          <td className="py-3 text-right tabular-nums font-semibold">
                            {f.precioUnitario ? formatCLP(subtotal(f)) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {hayPrecios && (
                      <tfoot>
                        <tr style={{ borderTop: '2px solid var(--tinta)' }}>
                          <td className="py-4 font-semibold" colSpan={4}>Total comunidad</td>
                          <td className="py-4 text-right titulo-md tabular-nums">{formatCLP(totalGasto)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </section>
            </Reveal>
          ) : (
            <div className="rounded-[6px] p-8 glass text-center">
              <p className="text-sm" style={{ color: 'var(--tinta-70)' }}>
                Ningún socio tiene materiales asignados todavía.
              </p>
            </div>
          )}

          {sinCarrito.length > 0 && (
            <section className="pt-6" style={{ borderTop: '1px solid var(--linea)' }}>
              <p className="eyebrow mb-3">
                {sinCarrito.length} socio{sinCarrito.length !== 1 ? 's' : ''} sin materiales asignados
              </p>
              <p className="text-sm" style={{ color: 'var(--tinta-70)' }}>{sinCarrito.join(' · ')}</p>
            </section>
          )}
        </>
      )}

      {confirmando && (
        <ConfirmDialog
          title="Confirmar la compra"
          description={`Vas a dejar registrado que ${confirmando} se compró a ${proveedor?.nombre ?? 'este proveedor'}. Se guardan los precios de hoy y las cantidades de ese proyecto quedan bloqueadas. Puedes revertirlo después.`}
          confirmLabel="Sí, ya se compró"
          danger={false}
          busy={busy}
          onConfirm={() => confirmarCompra(confirmando)}
          onCancel={() => setConfirmando(null)}
        />
      )}
      {revirtiendo && (
        <ConfirmDialog
          title="Revertir la compra"
          description={`${revirtiendo} vuelve a quedar editable y se descartan los precios guardados de esa compra. Las fotos ya cargadas no se borran.`}
          confirmLabel="Revertir"
          busy={busy}
          onConfirm={() => revertirCompra(revirtiendo)}
          onCancel={() => setRevirtiendo(null)}
        />
      )}
    </div>
  )
}

/** "Polines" es el único insumo que comparten los dos proyectos y el que
 *  Juan mira primero para comprar. El match va por nombre porque el catálogo
 *  no tiene una columna de familia. */
function esPolin(nombre: string) {
  return nombre.trim().toLowerCase().startsWith('polines')
}

function TagSegmento({ tag }: { tag: 'CP' | 'INV' }) {
  return (
    <span
      className="text-[10px] font-bold px-1.5 py-0.5 rounded-[3px] tracking-wide"
      style={tag === 'CP'
        ? { background: 'var(--tinta)', color: 'var(--papel)' }
        : { background: 'var(--acento)', color: 'var(--tinta)' }}
    >
      {tag}
    </span>
  )
}

function PanelSegmento({
  seg, sigla, nombre, gasto, polines, materiales, socios, compra, totalGasto,
  nombreProveedor, puedeConfirmar, onConfirmar, onRevertir,
}: {
  seg: Segmento
  sigla: 'CP' | 'INV'
  nombre: string
  gasto: number
  polines: number
  materiales: FilaConsolidado[]
  socios: number
  compra: CompraSegmento | null
  totalGasto: number
  nombreProveedor: (id: string) => string
  puedeConfirmar: boolean
  onConfirmar: () => void
  onRevertir: () => void
}) {
  const pct = totalGasto > 0 ? Math.round((gasto / totalGasto) * 100) : 0

  return (
    <div className="p-6 space-y-5" style={{ background: 'var(--papel)' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{sigla} · {nombre}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--tinta-45)' }}>{socios} socios</p>
        </div>
        {compra
          ? <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-[3px]"
                  style={{ background: 'var(--acento)', color: 'var(--tinta)' }}>
              <Check size={11} strokeWidth={3} /> Comprado
            </span>
          : <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-[3px]"
                  style={{ border: '1px solid var(--linea-fuerte)', color: 'var(--tinta-70)' }}>
              Cotizando
            </span>}
      </div>

      <div>
        <p className="titulo-lg tabular-nums">{gasto > 0 ? formatCLP(gasto) : '—'}</p>
        {gasto > 0 && (
          <p className="text-xs mt-2" style={{ color: 'var(--tinta-45)' }}>{pct}% del total de la compra</p>
        )}
      </div>

      <dl className="space-y-0">
        {materiales.map(m => (
          <div key={m.key} className="flex items-baseline justify-between py-2.5" style={{ borderTop: '1px solid var(--linea)' }}>
            <dt className="text-sm" style={{ color: 'var(--tinta-70)' }}>{m.nombre}</dt>
            <dd className="text-lg font-semibold tabular-nums">{m.cantidad} <span className="text-xs font-normal" style={{ color: 'var(--tinta-45)' }}>{m.formato_venta}</span></dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between py-2.5" style={{ borderTop: '1px solid var(--linea)' }}>
          <dt className="text-sm" style={{ color: 'var(--tinta-70)' }}>Polines</dt>
          <dd className="text-lg font-semibold tabular-nums">{polines || '—'}</dd>
        </div>
      </dl>

      {compra ? (
        <div className="pt-2 space-y-3">
          <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--tinta-70)' }}>
            <Lock size={13} className="shrink-0 mt-0.5" />
            <span>
              Comprado a <strong style={{ color: 'var(--tinta)' }}>{nombreProveedor(compra.proveedor_id)}</strong> el{' '}
              {new Date(compra.confirmada_at).toLocaleDateString('es-CL')}. Precios y cantidades bloqueados.
            </span>
          </p>
          <Button size="sm" variant="ghost" onClick={onRevertir}>
            <RotateCcw size={14} /> Revertir compra
          </Button>
        </div>
      ) : (
        <div className="pt-2">
          <Button variant="accent" onClick={onConfirmar} disabled={!puedeConfirmar || gasto <= 0} className="w-full">
            Marcar {sigla} como comprado
          </Button>
          {!puedeConfirmar && (
            <p className="text-xs mt-2" style={{ color: 'var(--tinta-45)' }}>
              Elige primero un proveedor en Beneficiarios.
            </p>
          )}
          <p className="sr-only">Marcar la compra de {seg} como realizada</p>
        </div>
      )}
    </div>
  )
}
