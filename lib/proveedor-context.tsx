'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

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
    const saved = localStorage.getItem('pat_proveedor_id')
    if (saved) setProveedorIdState(saved)
    setIsLoaded(true)
  }, [])

  const setProveedorId = useCallback((id: string) => {
    setProveedorIdState(id)
    localStorage.setItem('pat_proveedor_id', id)
  }, [])

  return (
    <ProveedorContext.Provider value={{ proveedorId, setProveedorId, isLoaded }}>
      {children}
    </ProveedorContext.Provider>
  )
}

export const useProveedor = () => useContext(ProveedorContext)
