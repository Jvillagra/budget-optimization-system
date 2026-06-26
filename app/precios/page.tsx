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
          <h1 className="text-lg font-semibold text-gray-900">Maestro de Precios</h1>
          <select
            value={filtroProveedor}
            onChange={(e) => setFiltroProveedor(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">{categoria}</h2>
                <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Nombre</th>
                        <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium hidden sm:table-cell">Formato</th>
                        <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium hidden sm:table-cell">Proveedor</th>
                        <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Precio</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((insumo) => (
                        <tr key={insumo.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900">{insumo.nombre}</td>
                          <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{insumo.formato_venta}</td>
                          <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{insumo.proveedores?.nombre}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCLP(insumo.precio_unitario)}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={() => editar(insumo)}
                                className="text-xs text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded hover:bg-indigo-50"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => eliminar(insumo.id)}
                                className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50"
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
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 sticky top-20">
          <h2 className="text-sm font-semibold text-gray-900">
            {editandoId ? 'Editar insumo' : 'Nuevo insumo'}
          </h2>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Proveedor</label>
              <select
                value={form.proveedor_id}
                onChange={(e) => setForm((f) => ({ ...f, proveedor_id: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Categoría</label>
              <select
                value={form.categoria}
                onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value as Categoria }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Nombre</label>
              <input
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Malla Ursus 80 cm"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Formato de venta</label>
              <input
                value={form.formato_venta}
                onChange={(e) => setForm((f) => ({ ...f, formato_venta: e.target.value }))}
                placeholder="Ej: Rollo 100m, Metro, Unidad"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Precio unitario (CLP)</label>
              <input
                type="number"
                min={0}
                value={form.precio_unitario || ''}
                onChange={(e) => setForm((f) => ({ ...f, precio_unitario: parseFloat(e.target.value) || 0 }))}
                placeholder="0"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex gap-2">
            {editandoId && (
              <button
                onClick={() => { setEditandoId(null); setForm({ ...FORM_INICIAL, proveedor_id: proveedores[0]?.id ?? '' }) }}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
            )}
            <button
              onClick={guardar}
              disabled={guardando || !form.nombre}
              className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {guardando ? 'Guardando...' : editandoId ? 'Actualizar' : 'Agregar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
