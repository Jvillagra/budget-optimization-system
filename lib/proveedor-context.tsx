'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

// v2 (2026-09-07): antes el default automático (primer proveedor por orden
// alfabético) también se persistía, así que los socios quedaban pegados a
// "Agricola Pucon" con polines a $0. Cambiar la clave resetea ese default
// guardado una sola vez; una elección hecha a mano después se sigue respetando.
export const STORAGE_KEY = 'pat_proveedor_id_v2'

/** Proveedor con el que arranca el comparador cuando no hay uno guardado:
 *  Sodimac por decisión del programa (es el que tiene los polines, el insumo
 *  que define la simulación). Si no existiera, el primero de la lista. */
export function proveedorPorDefecto<T extends { id: string; nombre: string }>(proveedores: T[]): T | undefined {
  return proveedores.find(p => p.nombre.trim().toLowerCase().includes('sodimac')) ?? proveedores[0]
}

type ProveedorCtx = {
  proveedorId: string
  setProveedorId: (id: string) => void
  isLoaded: boolean
}

const ProveedorContext = createContext<ProveedorCtx>({
  proveedorId: '',
  setProveedorId: () => {},
  isLoaded: false,
})

export function ProveedorProvider({ children }: { children: React.ReactNode }) {
  const [proveedorId, setProveedorIdState] = useState('')
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) setProveedorIdState(saved)
    setIsLoaded(true)
  }, [])

  const setProveedorId = useCallback((id: string) => {
    setProveedorIdState(id)
    localStorage.setItem(STORAGE_KEY, id)
  }, [])

  return (
    <ProveedorContext.Provider value={{ proveedorId, setProveedorId, isLoaded }}>
      {children}
    </ProveedorContext.Provider>
  )
}

export const useProveedor = () => useContext(ProveedorContext)
