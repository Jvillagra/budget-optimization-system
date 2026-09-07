import { PantallaCargando } from '@/components/PantallaCargando'

// La rendición abre con el bloque de totales (alto ~14rem) y después la
// lista de socios.
export default function Loading() {
  return <PantallaCargando filas={6} />
}
