'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Insumo, Proveedor, Categoria } from '@/lib/types'
import { formatCLP } from '@/lib/business-logic'

const CATEGORIAS: Categoria[] = ['Malla', 'Polietileno', 'Polines', 'Otro']

type InsumoForm = {
  proveedor_id: string
  categoria: Categoria
  nombre: string
  formato_venta: string
  precio_unitario: number
}

const FORM_INICIAL: InsumoForm = {
  proveedor_id: '',
  categoria: 'Malla',
  nombre: '',
  formato_venta: '',
  precio_unitario: 0,
}

export default function PreciosPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [form, setForm] = useState<InsumoForm>(FORM_INICIAL)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filtroProveedor, setFiltroProveedor] = useState<string>('todos')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const [{ data: ins }, { data: provs }] = await Promise.all([
      supabase.from('insumos').select('*, proveedores(nombre)').order('categoria').order('nombre'),
      supabase.from('proveedores').select('*').order('nombre'),
    ])
    if (ins) setInsumos(ins as Insumo[])
    if (provs) {
      setProveedores(provs as Proveedor[])
      if (provs.length > 0 && !form.proveedor_id) {
        setForm((f) => ({ ...f, proveedor_id: provs[0].id }))
      }
    }
    setLoading(false)
  }

  async function guardar() {
    if (!form.nombre || !form.precio_unitario || !form.proveedor_id) return
    setGuardando(true)

    if (editandoId) {
      await supabase.from('insumos').update({
        proveedor_id: form.proveedor_id,
        categoria: form.categoria,
        nombre: form.nombre,
        formato_venta: form.formato_venta,
        precio_unitario: form.precio_unitario,
      }).eq('id', editandoId)
    } else {
      await supabase.from('insumos').insert({
        proveedor_id: form.proveedor_id,
        categoria: form.categoria,
        nombre: form.nombre,
        formato_venta: form.formato_venta,
        precio_unitario: form.precio_unitario,
      })
    }

    setForm({ ...FORM_INICIAL, proveedor_id: proveedores[0]?.id ?? '' })
    setEditandoId(null)
    setGuardando(false)
    await fetchData()
  }

  async function eliminar(id: string) {
    await supabase.from('insumos').delete().eq('id', id)
    setInsumos((prev) => prev.filter((i) => i.id !== id))
  }

  function editar(insumo: Insumo) {
    setEditandoId(insumo.id)
    setForm({
      proveedor_id: insumo.proveedor_id,
      categoria: insumo.categoria,
      nombre: insumo.nombre,
      formato_venta: insumo.formato_venta,
      precio_unitario: insumo.precio_unitario,
    })
  }

  const insumosFiltrados =
    filtroProveedor === 'todos' ? insumos : insumos.filter((i) => i.proveedor_id === filtroProveedor)

  const insumosPorCategoria = insumosFiltrados.reduce<Record<string, Insumo[]>>((acc, i) => {
    if (!acc[i.categoria]) acc[i.categoria] = []
    acc[i.categoria].push(i)
    return acc
  }, {})

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Tabla de insumos */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold" style={{ color: 'var(--verde-dark)' }}>Maestro de Precios</h1>
          <select
            value={filtroProveedor}
            onChange={(e) => setFiltroProveedor(e.target.value)}
            className="text-sm rounded-lg px-3 py-1.5 focus:outline-none"
            style={{ border: '1px solid rgba(58,125,68,0.25)', background: 'rgba(255,255,255,0.7)' }}
          >
            <option value="todos">Todos los proveedores</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(insumosPorCategoria).map(([categoria, items]) => (
              <div key={categoria}>
                <h2 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--cafe)' }}>{categoria}</h2>
                <div className="rounded-2xl overflow-hidden glass">
                  <table className="w-full text-sm">
                    <thead style={{ background: 'rgba(58,125,68,0.06)', borderBottom: '1px solid rgba(58,125,68,0.12)' }}>
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-semibold" style={{ color: 'var(--verde-dark)' }}>Nombre</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold hidden sm:table-cell" style={{ color: 'var(--verde-dark)' }}>Formato</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold hidden sm:table-cell" style={{ color: 'var(--verde-dark)' }}>Proveedor</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold" style={{ color: 'var(--verde-dark)' }}>Precio</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody style={{ borderTop: 'none' }}>
                      {items.map((insumo) => (
                        <tr key={insumo.id} className="transition-colors" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                          <td className="px-4 py-3 font-medium" style={{ color: '#1c1c1c' }}>{insumo.nombre}</td>
                          <td className="px-4 py-3 hidden sm:table-cell" style={{ color: 'rgba(0,0,0,0.5)' }}>{insumo.formato_venta}</td>
                          <td className="px-4 py-3 hidden sm:table-cell" style={{ color: 'rgba(0,0,0,0.5)' }}>{insumo.proveedores?.nombre}</td>
                          <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--verde-dark)' }}>{formatCLP(insumo.precio_unitario)}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={() => editar(insumo)}
                                className="text-xs px-2 py-1 rounded-lg transition-colors"
                                style={{ color: 'var(--cafe)', background: 'var(--cafe-muted)' }}
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => eliminar(insumo.id)}
                                className="text-xs px-2 py-1 rounded-lg transition-colors"
                                style={{ color: '#dc2626', background: '#fee2e2' }}
                              >
                                ✕
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Formulario */}
      <div>
        <div className="rounded-2xl p-5 space-y-4 sticky top-20 glass-strong">
          <h2 className="text-sm font-bold" style={{ color: 'var(--cafe-dark)' }}>
            {editandoId ? 'Editar insumo' : 'Nuevo insumo'}
          </h2>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--cafe)' }}>Proveedor</label>
              <select
                value={form.proveedor_id}
                onChange={(e) => setForm((f) => ({ ...f, proveedor_id: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ border: '1px solid rgba(58,125,68,0.25)', background: 'rgba(255,255,255,0.7)' }}
              >
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--cafe)' }}>Categoría</label>
              <select
                value={form.categoria}
                onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value as Categoria }))}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ border: '1px solid rgba(58,125,68,0.25)', background: 'rgba(255,255,255,0.7)' }}
              >
                {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--cafe)' }}>Nombre</label>
              <input
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Malla Ursus 80 cm"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ border: '1px solid rgba(58,125,68,0.25)', background: 'rgba(255,255,255,0.7)' }}
              />
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--cafe)' }}>Formato de venta</label>
              <input
                value={form.formato_venta}
                onChange={(e) => setForm((f) => ({ ...f, formato_venta: e.target.value }))}
                placeholder="Ej: Rollo 100m, Metro, Unidad"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ border: '1px solid rgba(58,125,68,0.25)', background: 'rgba(255,255,255,0.7)' }}
              />
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--cafe)' }}>Precio unitario (CLP)</label>
              <input
                type="number"
                min={0}
                value={form.precio_unitario || ''}
                onChange={(e) => setForm((f) => ({ ...f, precio_unitario: parseFloat(e.target.value) || 0 }))}
                placeholder="0"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ border: '1px solid rgba(58,125,68,0.25)', background: 'rgba(255,255,255,0.7)' }}
              />
            </div>
          </div>

          <div className="flex gap-2">
            {editandoId && (
              <button
                onClick={() => { setEditandoId(null); setForm({ ...FORM_INICIAL, proveedor_id: proveedores[0]?.id ?? '' }) }}
                className="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors" style={{ border: '1px solid rgba(0,0,0,0.15)', color: 'rgba(0,0,0,0.6)' }}
              >
                Cancelar
              </button>
            )}
            <button
              onClick={guardar}
              disabled={guardando || !form.nombre}
              className="flex-1 rounded-lg px-3 py-2 text-sm text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all" style={{ background: 'var(--verde)' }}
            >
              {guardando ? 'Guardando...' : editandoId ? 'Actualizar' : 'Agregar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
