'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { X, ImageOff, CheckCircle2, RotateCcw } from 'lucide-react'
import { formatCLP } from '@/lib/business-logic'
import { FOTOS_REQUERIDAS } from '@/lib/constants'

type Foto = { id: string; uploaded_at: string; url: string }
type FilaRendicion = {
  id: string
  nombre: string
  segmento: string
  proveedorNombre: string | null
  total: number
  itemsSinPrecio: number
  fotos: Foto[]
  fotosCount: number
  compraCompleta: boolean
  compraCompletaAt: string | null
}
type Resumen = {
  total: number
  completos: number
  porSegmento: Record<string, { total: number; completos: number }>
}

const SEG_COLOR: Record<string, string> = {
  'Invernadero': 'var(--verde-dark)',
  'Cierre Perimetral': 'var(--cafe-dark)',
}
const SEG_BADGE: Record<string, { background: string; color: string }> = {
  'Invernadero': { background: 'var(--verde-muted)', color: 'var(--verde-dark)' },
  'Cierre Perimetral': { background: 'var(--cafe-muted)', color: 'var(--cafe-dark)' },
}

export default function RendicionPage() {
  const [filas, setFilas] = useState<FilaRendicion[]>([])
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ nombre: string; fotos: Foto[]; index: number } | null>(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch('/api/rendicion')
      if (!res.ok) throw new Error('load failed')
      const { beneficiarios, resumen: r } = await res.json()
      setFilas(beneficiarios ?? [])
      setResumen(r ?? null)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  async function marcarCompleto(id: string) {
    setBusyId(id)
    const res = await fetch(`/api/rendicion/${id}/completar`, { method: 'POST' })
    if (res.ok) {
      const { data } = await res.json()
      setFilas(prev => prev.map(f => f.id === id ? { ...f, compraCompleta: data.compra_completa, compraCompletaAt: data.compra_completa_at } : f))
      setResumen(prev => prev ? recomputarResumen(filas, id, true) : prev)
    }
    setBusyId(null)
  }

  async function revertir(id: string) {
    setBusyId(id)
    const res = await fetch(`/api/rendicion/${id}/revertir`, { method: 'POST' })
    if (res.ok) {
      const { data } = await res.json()
      setFilas(prev => prev.map(f => f.id === id ? { ...f, compraCompleta: data.compra_completa, compraCompletaAt: data.compra_completa_at } : f))
      setResumen(prev => prev ? recomputarResumen(filas, id, false) : prev)
    }
    setBusyId(null)
  }

  function recomputarResumen(filasActuales: FilaRendicion[], id: string, completo: boolean): Resumen {
    const actualizadas = filasActuales.map(f => f.id === id ? { ...f, compraCompleta: completo } : f)
    const porSegmento: Record<string, { total: number; completos: number }> = {}
    for (const f of actualizadas) {
      if (!porSegmento[f.segmento]) porSegmento[f.segmento] = { total: 0, completos: 0 }
      porSegmento[f.segmento].total++
      if (f.compraCompleta) porSegmento[f.segmento].completos++
    }
    return {
      total: actualizadas.length,
      completos: actualizadas.filter(f => f.compraCompleta).length,
      porSegmento,
    }
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.4)' }} />
        ))}
      </div>
      <div className="h-96 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.4)' }} />
    </div>
  )

  if (loadError) return (
    <div className="rounded-2xl p-8 glass text-center space-y-3">
      <p className="text-sm font-semibold" style={{ color: 'var(--cafe-dark)' }}>Error al cargar la rendición</p>
      <button
        onClick={cargar}
        className="text-sm font-semibold px-4 py-2 rounded-lg transition-transform active:scale-[0.97]"
        style={{ background: 'var(--verde)', color: '#fff' }}
      >
        Reintentar
      </button>
    </div>
  )

  const pctCompleto = resumen && resumen.total > 0 ? (resumen.completos / resumen.total) * 100 : 0
  const donutData = resumen ? [
    { name: 'Completos', value: resumen.completos },
    { name: 'Pendientes', value: resumen.total - resumen.completos },
  ] : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--verde-dark)' }}>Rendición</h1>
        <p className="text-sm" style={{ color: 'rgba(0,0,0,0.45)' }}>
          Estado de compra por beneficiario · mínimo {FOTOS_REQUERIDAS} fotos de comprobante para marcar completo
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl p-4 glass flex items-center gap-4">
          <div className="shrink-0">
            <ResponsiveContainer width={72} height={72}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={22} outerRadius={34} dataKey="value" strokeWidth={0} startAngle={90} endAngle={-270}>
                  <Cell fill="var(--verde)" />
                  <Cell fill="rgba(0,0,0,0.10)" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'rgba(0,0,0,0.4)' }}>Progreso de rendición</p>
            <p className="text-xl font-bold" style={{ color: '#1c1c1c' }}>
              {resumen?.completos ?? 0} de {resumen?.total ?? 0}
            </p>
            <p className="text-xs font-semibold" style={{ color: 'var(--verde-dark)' }}>{pctCompleto.toFixed(0)}% completo</p>
          </div>
        </div>

        {Object.entries(resumen?.porSegmento ?? {}).map(([seg, d]) => (
          <div key={seg} className="rounded-2xl p-4 glass">
            <p className="text-xs font-semibold" style={{ color: SEG_COLOR[seg] ?? 'var(--cafe)' }}>{seg}</p>
            <p className="text-xl font-bold mt-1" style={{ color: '#1c1c1c' }}>{d.completos} de {d.total}</p>
            <div className="h-1.5 rounded-full overflow-hidden mt-2" style={{ background: 'rgba(0,0,0,0.08)' }}>
              <div
                className="h-full rounded-full transition-[width] duration-300 ease-out"
                style={{ width: `${d.total > 0 ? (d.completos / d.total) * 100 : 0}%`, background: SEG_COLOR[seg] ?? 'var(--cafe)' }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div className="rounded-2xl glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                <th className="text-left font-semibold px-4 py-3" style={{ color: 'rgba(0,0,0,0.45)' }}>Beneficiario</th>
                <th className="text-left font-semibold px-4 py-3" style={{ color: 'rgba(0,0,0,0.45)' }}>Segmento</th>
                <th className="text-left font-semibold px-4 py-3" style={{ color: 'rgba(0,0,0,0.45)' }}>Proveedor</th>
                <th className="text-left font-semibold px-4 py-3" style={{ color: 'rgba(0,0,0,0.45)' }}>Fotos</th>
                <th className="text-right font-semibold px-4 py-3" style={{ color: 'rgba(0,0,0,0.45)' }}>Total cotizado</th>
                <th className="text-left font-semibold px-4 py-3" style={{ color: 'rgba(0,0,0,0.45)' }}>Estado</th>
                <th className="text-right font-semibold px-4 py-3" style={{ color: 'rgba(0,0,0,0.45)' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(f => {
                const suficientesFotos = f.fotosCount >= FOTOS_REQUERIDAS
                return (
                  <tr key={f.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td className="px-4 py-3 font-medium" style={{ color: '#1c1c1c' }}>{f.nombre}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={SEG_BADGE[f.segmento] ?? {}}>
                        {f.segmento}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'rgba(0,0,0,0.6)' }}>
                      {f.proveedorNombre ?? <span style={{ color: 'rgba(0,0,0,0.3)' }}>—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {f.fotos.length === 0 ? (
                        <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(0,0,0,0.3)' }}>
                          <ImageOff size={13} /> sin fotos
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
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
                          <span className="text-xs ml-1" style={{ color: suficientesFotos ? 'var(--verde-dark)' : 'var(--cafe)' }}>
                            {f.fotosCount}/{FOTOS_REQUERIDAS}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium" style={{ color: '#1c1c1c' }}>{formatCLP(f.total)}</td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs px-2.5 py-1 rounded-full font-semibold inline-flex items-center gap-1"
                        style={f.compraCompleta
                          ? { background: 'var(--verde-muted)', color: 'var(--verde-dark)' }
                          : { background: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.45)' }}
                      >
                        {f.compraCompleta && <CheckCircle2 size={12} />}
                        {f.compraCompleta ? 'Completo' : 'Pendiente'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {f.compraCompleta ? (
                        <button
                          onClick={() => revertir(f.id)}
                          disabled={busyId === f.id}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg inline-flex items-center gap-1 transition-transform active:scale-[0.97] disabled:opacity-50"
                          style={{ color: 'var(--cafe-dark)', background: 'var(--cafe-muted)' }}
                        >
                          <RotateCcw size={12} /> Revertir
                        </button>
                      ) : (
                        <div className="inline-block group relative">
                          <button
                            onClick={() => marcarCompleto(f.id)}
                            disabled={!suficientesFotos || busyId === f.id}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-transform active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100"
                            style={{ background: 'var(--verde)' }}
                          >
                            {busyId === f.id ? '...' : 'Marcar completo'}
                          </button>
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
      </div>

      {lightbox && (
        <Lightbox
          nombre={lightbox.nombre}
          fotos={lightbox.fotos}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={i => setLightbox(prev => prev ? { ...prev, index: i } : prev)}
        />
      )}
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
