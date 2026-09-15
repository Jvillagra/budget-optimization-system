'use client'

import { useEffect, useRef, useState } from 'react'
import { Pencil, EyeOff, RotateCcw } from 'lucide-react'
import type { CatalogoInsumo, SegmentoCatalogo } from '@/lib/types'
import { Button, Alert, ConfirmDialog } from '@/components/design-system'

// Gestión del catálogo de productos. Vive al lado del panel de proveedores
// de PreciosClient y comparte su idioma visual a propósito: son la misma
// tarea ("mantener el maestro") y no merecen dos pantallas distintas.
//
// Está en su propio archivo y no dentro de PreciosClient porque ese archivo
// ya carga la matriz de precios, el flujo de Vision y el panel de
// proveedores; agregarle un cuarto estado con sus seis campos lo dejaba
// imposible de leer.

const SEGMENTOS: SegmentoCatalogo[] = ['Invernadero', 'Cierre Perimetral', 'Ambos']

type Borrador = { nombre: string; formato_venta: string; segmento: SegmentoCatalogo }

const BORRADOR_VACIO: Borrador = { nombre: '', formato_venta: '', segmento: 'Ambos' }

export function GestionInsumos({ insumos, onChange, usoPorInsumo, editarInicialId = null }: {
  insumos: CatalogoInsumo[]
  /** Material que llega ya en modo edición (el lápiz de la matriz). */
  editarInicialId?: string | null
  onChange: (insumos: CatalogoInsumo[]) => void
  /** Cuántos socios tienen cada insumo en su carrito. Se usa para avisar
   *  ANTES de cambiar el segmento y para explicar por qué no se puede
   *  desactivar; el servidor igual revalida — esto es cortesía, no control. */
  usoPorInsumo: Map<string, number>
}) {
  const [error, setError] = useState<string | null>(null)
  const [agregando, setAgregando] = useState(false)
  const [nuevo, setNuevo] = useState<Borrador>(BORRADOR_VACIO)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [edicion, setEdicion] = useState<Borrador>(BORRADOR_VACIO)
  const [aDesactivar, setADesactivar] = useState<CatalogoInsumo | null>(null)
  const [guardando, setGuardando] = useState(false)

  const activos = insumos.filter(i => i.es_activo !== false)

  // Al llegar desde el lápiz de la matriz, ese material abre editando. Se
  // ajusta el estado durante el render (patrón de React para "reaccionar a
  // una prop"), no en un efecto: un setState dentro de useEffect pinta dos
  // veces y lint lo marca. Solo dispara cuando cambia el id pedido: guardar
  // el nombre después no reabre nada.
  const [inicialAtendido, setInicialAtendido] = useState<string | null>(null)
  if (editarInicialId !== inicialAtendido) {
    setInicialAtendido(editarInicialId)
    const insumo = editarInicialId ? insumos.find(i => i.id === editarInicialId) : undefined
    if (insumo) {
      setEditandoId(insumo.id)
      setEdicion({ nombre: insumo.nombre, formato_venta: insumo.formato_venta, segmento: insumo.segmento })
    }
  }
  // El panel está arriba de la matriz: traer la fila a la vista.
  const filaRefs = useRef(new Map<string, HTMLLIElement>())
  useEffect(() => {
    if (editarInicialId) filaRefs.current.get(editarInicialId)?.scrollIntoView({ block: 'center' })
  }, [editarInicialId])

  function ordenar(lista: CatalogoInsumo[]) {
    return [...lista].sort((a, b) =>
      a.segmento.localeCompare(b.segmento) || a.nombre.localeCompare(b.nombre)
    )
  }

  async function crear() {
    const nombre = nuevo.nombre.trim()
    const formato_venta = nuevo.formato_venta.trim()
    if (!nombre || !formato_venta || guardando) return
    setGuardando(true); setError(null)
    const res = await fetch('/api/catalogo-insumos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, formato_venta, segmento: nuevo.segmento }),
    }).catch(() => null)
    const body = await res?.json().catch(() => null)
    if (!res?.ok || !body?.data) {
      setError(body?.error ?? 'No se pudo crear el material.')
    } else {
      onChange(ordenar([...insumos, body.data as CatalogoInsumo]))
      setNuevo(BORRADOR_VACIO)
      setAgregando(false)
    }
    setGuardando(false)
  }

  async function guardarEdicion(insumo: CatalogoInsumo) {
    const nombre = edicion.nombre.trim()
    const formato_venta = edicion.formato_venta.trim()
    if (!nombre || !formato_venta || guardando) return

    // Nada que guardar: se cierra el editor sin pegarle a la red ni escribir
    // una línea de auditoría que diría "cambió" sin haber cambiado nada.
    const sinCambios = nombre === insumo.nombre
      && formato_venta === insumo.formato_venta
      && edicion.segmento === insumo.segmento
    if (sinCambios) { setEditandoId(null); return }

    setGuardando(true); setError(null)
    const res = await fetch('/api/catalogo-insumos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: insumo.id, nombre, formato_venta, segmento: edicion.segmento }),
    }).catch(() => null)
    if (!res?.ok) {
      const body = await res?.json().catch(() => null)
      setError(body?.error ?? 'No se pudo guardar el material.')
    } else {
      onChange(ordenar(insumos.map(i =>
        i.id === insumo.id ? { ...i, nombre, formato_venta, segmento: edicion.segmento } : i
      )))
      setEditandoId(null)
    }
    setGuardando(false)
  }

  async function cambiarActivo(insumo: CatalogoInsumo, es_activo: boolean) {
    setError(null)
    const res = await fetch('/api/catalogo-insumos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: insumo.id, es_activo }),
    }).catch(() => null)
    if (!res?.ok) {
      const body = await res?.json().catch(() => null)
      setError(body?.error ?? 'No se pudo actualizar el material.')
      setADesactivar(null)
      return
    }
    onChange(insumos.map(i => (i.id === insumo.id ? { ...i, es_activo } : i)))
    setADesactivar(null)
  }

  function abrirEdicion(insumo: CatalogoInsumo) {
    setEditandoId(insumo.id)
    setEdicion({ nombre: insumo.nombre, formato_venta: insumo.formato_venta, segmento: insumo.segmento })
  }

  const inputStyle = { border: '1px solid var(--linea)', background: 'var(--papel-hueco)' } as const

  return (
    <section className="mb-8 rounded-[6px] glass-strong">
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--linea)' }}>
        <p className="eyebrow">Materiales ({activos.length})</p>
        <Button size="sm" variant="ghost" onClick={() => { setAgregando(v => !v); setError(null) }}>
          {agregando ? 'Cancelar' : '+ Agregar'}
        </Button>
      </div>

      {error && <div className="px-5 pt-4"><Alert tone="error">{error}</Alert></div>}

      {agregando && (
        <div className="px-5 py-4 flex flex-wrap gap-2" style={{ borderBottom: '1px solid var(--linea)' }}>
          <input
            autoFocus
            type="text"
            placeholder="Nombre (ej: Polines 3 a 4 cm)"
            value={nuevo.nombre}
            onChange={e => setNuevo(n => ({ ...n, nombre: e.target.value }))}
            className="flex-1 min-w-[180px] rounded-[4px] px-3 py-2 text-sm min-h-[44px]"
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Formato de venta (ej: Rollo 25m)"
            value={nuevo.formato_venta}
            onChange={e => setNuevo(n => ({ ...n, formato_venta: e.target.value }))}
            className="flex-1 min-w-[160px] rounded-[4px] px-3 py-2 text-sm min-h-[44px]"
            style={inputStyle}
          />
          <select
            value={nuevo.segmento}
            onChange={e => setNuevo(n => ({ ...n, segmento: e.target.value as SegmentoCatalogo }))}
            aria-label="Segmento del material nuevo"
            className="rounded-[4px] px-3 py-2 text-sm min-h-[44px]"
            style={inputStyle}
          >
            {SEGMENTOS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <Button onClick={crear} disabled={!nuevo.nombre.trim() || !nuevo.formato_venta.trim() || guardando}>
            Guardar
          </Button>
        </div>
      )}

      <ul>
        {insumos.map(insumo => {
          const enUso = usoPorInsumo.get(insumo.id) ?? 0
          const activo = insumo.es_activo !== false
          return (
            <li
              key={insumo.id}
              ref={el => { if (el) filaRefs.current.set(insumo.id, el); else filaRefs.current.delete(insumo.id) }}
              className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap"
              style={{ borderBottom: '1px solid var(--linea)', opacity: activo ? 1 : 0.55 }}
            >
              {editandoId === insumo.id ? (
                <div className="flex-1 min-w-0 flex flex-wrap gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={edicion.nombre}
                    onChange={e => setEdicion(v => ({ ...v, nombre: e.target.value }))}
                    aria-label={`Nombre de ${insumo.nombre}`}
                    className="flex-1 min-w-[160px] rounded-[4px] px-3 py-2 text-sm min-h-[44px]"
                    style={{ border: '1px solid var(--tinta)', background: 'var(--papel-hueco)' }}
                  />
                  <input
                    type="text"
                    value={edicion.formato_venta}
                    onChange={e => setEdicion(v => ({ ...v, formato_venta: e.target.value }))}
                    aria-label={`Formato de venta de ${insumo.nombre}`}
                    className="flex-1 min-w-[140px] rounded-[4px] px-3 py-2 text-sm min-h-[44px]"
                    style={{ border: '1px solid var(--tinta)', background: 'var(--papel-hueco)' }}
                  />
                  <select
                    value={edicion.segmento}
                    onChange={e => setEdicion(v => ({ ...v, segmento: e.target.value as SegmentoCatalogo }))}
                    aria-label={`Segmento de ${insumo.nombre}`}
                    className="rounded-[4px] px-3 py-2 text-sm min-h-[44px]"
                    style={{ border: '1px solid var(--tinta)', background: 'var(--papel-hueco)' }}
                  >
                    {SEGMENTOS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <Button onClick={() => guardarEdicion(insumo)} disabled={guardando}>Guardar</Button>
                  <Button variant="ghost" onClick={() => setEditandoId(null)}>Cancelar</Button>
                </div>
              ) : (
                <span className="min-w-0">
                  <span className="text-sm font-semibold flex items-center gap-2 min-w-0">
                    <span className="truncate">{insumo.nombre}</span>
                    {!activo && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-[3px]"
                        style={{ border: '1px solid var(--linea-fuerte)', color: 'var(--tinta-70)' }}>
                        Desactivado
                      </span>
                    )}
                  </span>
                  <span className="block text-xs mt-0.5" style={{ color: 'var(--tinta-70)' }}>
                    {insumo.formato_venta} · {insumo.segmento}
                    {enUso > 0 && ` · en ${enUso} carrito${enUso === 1 ? '' : 's'}`}
                  </span>
                </span>
              )}

              {editandoId !== insumo.id && (
                <span className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => abrirEdicion(insumo)}>
                    <Pencil size={14} /> Editar
                  </Button>
                  {activo ? (
                    <Button size="sm" variant="danger" onClick={() => { setError(null); setADesactivar(insumo) }}>
                      <EyeOff size={14} /> Desactivar
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => cambiarActivo(insumo, true)}>
                      <RotateCcw size={14} /> Reactivar
                    </Button>
                  )}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      <p className="px-5 py-3 text-xs" style={{ color: 'var(--tinta-45)' }}>
        Desactivar no borra nada: el insumo y sus precios quedan guardados, pero deja de aparecer
        en los selectores y en la matriz. Un insumo que está en el carrito de algún socio no se
        puede desactivar.
      </p>

      {aDesactivar && (
        <ConfirmDialog
          title={`Desactivar ${aDesactivar.nombre}`}
          description={
            (usoPorInsumo.get(aDesactivar.id) ?? 0) > 0
              ? `Está en el carrito de ${usoPorInsumo.get(aDesactivar.id)} socio(s), así que no se va a poder desactivar hasta sacarlo de esos carritos.`
              : 'Deja de aparecer en los selectores y en la matriz de precios. Sus precios quedan guardados y se puede reactivar cuando quieras.'
          }
          confirmLabel="Desactivar"
          onConfirm={() => cambiarActivo(aDesactivar, false)}
          onCancel={() => setADesactivar(null)}
        />
      )}
    </section>
  )
}
