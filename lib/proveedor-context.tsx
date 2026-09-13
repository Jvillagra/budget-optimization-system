'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

// v2 (2026-09-07): antes el default automático (primer proveedor por orden
// alfabético) también se persistía, así que los socios quedaban pegados a
// "Agricola Pucon" con polines a $0. Cambiar la clave resetea ese default
// guardado una sola vez; una elección hecha a mano después se sigue respetando.
export const STORAGE_KEY = 'pat_proveedor_id_v2'

// El proveedor por defecto (Sodimac) se define en lib/business-logic.ts: lo
// comparten este selector y la rendición server-side, y con dos definiciones
// las dos pantallas podían mostrar proveedores distintos para el mismo socio.
export { proveedorPorDefecto } from './business-logic'

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
