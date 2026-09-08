import { cargarRoles } from '@/lib/staff-data'
import AdminClient from './AdminClient'

// Server Component: los roles viajan dentro del RSC -- ver lib/staff-data.ts.
// El rol ya lo verificó app/admin/layout.tsx (requireStaff).
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const roles = await cargarRoles()
  return <AdminClient initial={roles} />
}
