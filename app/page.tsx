import { redirect } from 'next/navigation'
import { getViewerContext, isStaff } from '@/lib/roles'

// La raíz mandaba a todo el mundo a /rendicion, que es staff-only: un socio
// entraba por el link del correo y lo primero que veía era un error de carga.
export default async function Home() {
  const ctx = await getViewerContext()
  if (isStaff(ctx)) redirect('/rendicion')
  if (ctx.beneficiarioId) redirect('/mi-dashboard')
  if (!ctx.userId) redirect('/login')
  redirect('/sin-acceso')
}
