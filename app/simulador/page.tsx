import { cargarDatosStaff } from '@/lib/staff-data'
import SimuladorClient from './SimuladorClient'

// Server Component: los datos viajan dentro del RSC de la navegación en vez
// de pedirse con un fetch después de hidratar -- ver lib/staff-data.ts. El
// rol ya lo verificó el layout de la sección (requireStaff).
export const dynamic = 'force-dynamic'

export default async function SimuladorPage() {
  const datos = await cargarDatosStaff()
  return <SimuladorClient initial={datos} />
}
