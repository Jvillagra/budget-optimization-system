import { cargarDatosStaff } from '@/lib/staff-data'
import PreciosClient from './PreciosClient'

// Server Component: los datos viajan dentro del RSC de la navegación en vez
// de pedirse con un fetch después de hidratar -- ver lib/staff-data.ts. El
// rol ya lo verificó el layout de la sección (requireStaff).
export const dynamic = 'force-dynamic'

export default async function PreciosPage() {
  const datos = await cargarDatosStaff()
  return <PreciosClient initial={datos} />
}
