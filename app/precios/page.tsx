'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { CatalogoInsumo, Proveedor } from '@/lib/types'
import { formatCLP } from '@/lib/business-logic'

type PrecioMap = Map<string, number | null>

export default function PreciosPage() {
  const [insumos, setInsumos] = useState<CatalogoInsumo[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [precios, setPrecios] = useState<PrecioMap>(new Map())
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [addingProv, setAddingProv] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')

  useEffect(() => {
    async function load() {
      const [{ data: ins }, { data: provs }, { data: precs }] = await Promise.all([
        supabase.from('catalogo_insumos').select('*').order('segmento').order('nombre'),
        supabase.from('proveedores').select('*').eq('es_activo', true).order('nombre'),
        supabase.from('precios_proveedor').select('*'),
      ])
      if (ins) setInsumos(ins as CatalogoInsumo[])
      if (provs) setProveedores(provs as Proveedor[])
      if (precs) {
        const map: PrecioMap = new Map()
        for (const p of precs) map.set(`${p.proveedor_id}_${p.insumo_id}`, p.precio_unitario)
        setPrecios(map)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleBlur(provId: string, insumoId: string, rawValue: string) {
    const key = `${provId}_${insumoId}`
    const precio = rawValue.trim() === '' ? null : parseFloat(rawValue)
    if (isNaN(precio as number) && precio !== null) return

    setSaving(s => new Set(s).add(key))
    await supabase
      .from('precios_proveedor')
      .upsert({ proveedor_id: provId, insumo_id: insumoId, precio_unitario: precio }, { onConflict: 'proveedor_id,insumo_id' })
    setPrecios(prev => new Map(prev).set(key, precio))
    setSaving(s => { const n = new Set(s); n.delete(key); return n })
  }

  async function agregarProveedor() {
    const nombre = nuevoNombre.trim()
    if (!nombre) return
    const { data } = await supabase.from('proveedores').insert({ nombre, es_activo: true }).select().single()
    if (data) {
      setProveedores(prev => [...prev, data as Proveedor].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setNuevoNombre('')
      setAddingProv(false)
    }
  }

  async function guardarNombreProveedor(id: string) {
    const nombre = editNombre.trim()
    if (!nombre) { setEditingId(null); return }
    await supabase.from('proveedores').update({ nombre }).eq('id', id)
    setProveedores(prev => prev.map(p => p.id === id ? { ...p, nombre } : p))
    setEditingId(null)
  }

  function hayPreciosIncompletos(provId: string): boolean {
    return insumos.some(i => {
      const p = precios.get(`${provId}_${i.id}`)
      return p === undefined || p === null
    })
  }

  const segmentos = ['Invernadero', 'Ambos', 'Cierre Perimetral'] as const

  if (loading) return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-10 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.4)' }} />
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Cabecera con gestión de proveedores */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--verde-dark)' }}>maestro de precios</h1>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(0,0,0,0.4)' }}>
            Edición inline. Celda vacía = no cotizado. ⚠ indica precios incompletos.
          </p>
        </div>
        <button
          onClick={() => setAddingProv(v => !v)}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white"
          style={{ background: 'var(--verde)' }}
        >
          + nuevo proveedor
        </button>
      </div>

      {/* Formulario nuevo proveedor */}
      {addingProv && (
        <div className="rounded-xl p-3 flex gap-2 glass-strong">
          <input
            autoFocus
            type="text"
            placeholder="Nombre del proveedor"
            value={nuevoNombre}
            onChange={e => setNuevoNombre(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && agregarProveedor()}
            className="flex-1 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
            style={{ border: '1px solid rgba(58,125,68,0.3)', background: 'rgba(255,255,255,0.8)' }}
          />
          <button
            onClick={agregarProveedor}
            disabled={!nuevoNombre.trim()}
            className="px-4 py-1.5 rounded-lg text-sm text-white font-semibold disabled:opacity-40"
            style={{ background: 'var(--verde)' }}
          >
            guardar
          </button>
          <button
            onClick={() => { setAddingProv(false); setNuevoNombre('') }}
            className="px-3 py-1.5 rounded-lg text-sm"
            style={{ color: 'rgba(0,0,0,0.45)' }}
          >
            cancelar
          </button>
        </div>
      )}

      {/* Matriz de precios */}
      <div className="rounded-2xl overflow-x-auto glass" style={{ maxHeight: '75vh' }}>
        <table className="w-full text-sm border-collapse">
          <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
            <tr style={{ background: 'rgba(45,95,53,0.92)', backdropFilter: 'blur(8px)' }}>
              <th
                className="text-left px-4 py-3 text-xs font-semibold text-white whitespace-nowrap"
                style={{ position: 'sticky', left: 0, zIndex: 30, background: 'var(--verde-dark)', minWidth: '220px' }}
              >
                insumo
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white whitespace-nowrap" style={{ minWidth: '100px' }}>
                formato
              </th>
              {proveedores.map(p => {
                const incompleto = hayPreciosIncompletos(p.id)
                return (
                  <th key={p.id} className="px-4 py-3 text-xs font-semibold text-white whitespace-nowrap" style={{ minWidth: '160px' }}>
                    <div className="flex items-center justify-end gap-1.5">
                      {incompleto && (
                        <span title="Precios incompletos — no apto para simulación" style={{ color: '#fca5a5', fontSize: '13px' }}>⚠</span>
                      )}
                      {editingId === p.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={editNombre}
                          onChange={e => setEditNombre(e.target.value)}
                          onBlur={() => guardarNombreProveedor(p.id)}
                          onKeyDown={e => e.key === 'Enter' && guardarNombreProveedor(p.id)}
                          className="rounded px-2 py-0.5 text-xs text-gray-900 w-32 focus:outline-none"
                          style={{ background: 'rgba(255,255,255,0.9)' }}
                        />
                      ) : (
                        <button
                          onClick={() => { setEditingId(p.id); setEditNombre(p.nombre) }}
                          className="hover:underline"
                          title="Editar nombre"
                        >
                          {p.nombre}
                        </button>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {segmentos.map(seg => {
              const items = insumos.filter(i => i.segmento === seg)
              if (!items.length) return null
              return [
                <tr key={`seg_${seg}`}>
                  <td
                    colSpan={2 + proveedores.length}
                    className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide"
                    style={{
                      background: seg === 'Invernadero' ? 'var(--verde-muted)' : seg === 'Cierre Perimetral' ? 'var(--cafe-muted)' : 'rgba(0,0,0,0.04)',
                      color: seg === 'Invernadero' ? 'var(--verde-dark)' : seg === 'Cierre Perimetral' ? 'var(--cafe-dark)' : 'rgba(0,0,0,0.5)',
                    }}
                  >
                    {seg}
                  </td>
                </tr>,
                ...items.map(insumo => (
                  <PrecioRow
                    key={insumo.id}
                    insumo={insumo}
                    proveedores={proveedores}
                    precios={precios}
                    saving={saving}
                    onBlur={handleBlur}
                  />
                )),
              ]
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs" style={{ color: 'rgba(0,0,0,0.35)' }}>
        {insumos.length} insumos · {proveedores.length} proveedores · Los precios se guardan al salir de cada celda. Haz clic en el nombre del proveedor para editarlo.
      </p>
    </div>
  )
}

function PrecioRow({ insumo, proveedores, precios, saving, onBlur }: {
  insumo: CatalogoInsumo
  proveedores: Proveedor[]
  precios: PrecioMap
  saving: Set<string>
  onBlur: (provId: string, insumoId: string, value: string) => void
}) {
  return (
    <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
      <td
        className="px-4 py-2.5 font-medium whitespace-nowrap"
        style={{
          position: 'sticky', left: 0, zIndex: 10,
          background: 'rgba(255,255,255,0.85)',
          color: '#1c1c1c',
          minWidth: '220px',
          backdropFilter: 'blur(8px)',
        }}
      >
        {insumo.nombre}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: 'rgba(0,0,0,0.45)' }}>
        {insumo.formato_venta}
      </td>
      {proveedores.map(prov => {
        const key = `${prov.id}_${insumo.id}`
        const precio = precios.get(key)
        const isSaving = saving.has(key)
        return (
          <td key={prov.id} className="px-2 py-1.5 text-right">
            <PrecioCell
              initialValue={precio !== undefined ? precio : null}
              isSaving={isSaving}
              onBlur={(val) => onBlur(prov.id, insumo.id, val)}
            />
          </td>
        )
      })}
    </tr>
  )
}

function PrecioCell({ initialValue, isSaving, onBlur }: {
  initialValue: number | null
  isSaving: boolean
  onBlur: (val: string) => void
}) {
  const [localVal, setLocalVal] = useState(initialValue !== null ? String(initialValue) : '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLocalVal(initialValue !== null ? String(initialValue) : '')
  }, [initialValue])

  return (
    <div className="relative flex items-center justify-end">
      {localVal && !isSaving && (
        <span className="absolute left-2 text-xs pointer-events-none" style={{ color: 'rgba(0,0,0,0.35)' }}>$</span>
      )}
      <input
        ref={inputRef}
        type="number"
        min="0"
        step="100"
        value={localVal}
        placeholder="—"
        onChange={e => setLocalVal(e.target.value)}
        onBlur={e => onBlur(e.target.value)}
        disabled={isSaving}
        className="w-32 text-right text-sm rounded-lg px-2 py-1 transition-all"
        style={{
          background: localVal ? 'rgba(58,125,68,0.07)' : 'rgba(0,0,0,0.03)',
          border: localVal ? '1px solid rgba(58,125,68,0.25)' : '1px solid transparent',
          color: localVal ? 'var(--verde-dark)' : 'rgba(0,0,0,0.25)',
          fontWeight: localVal ? '600' : '400',
          opacity: isSaving ? 0.5 : 1,
        }}
      />
      {isSaving && (
        <span className="absolute right-2 text-xs" style={{ color: 'var(--verde)' }}>...</span>
      )}
    </div>
  )
}
