import { requireBeneficiario } from '@/lib/guards'
import { cargarMiDashboard, cargarFotosDeBeneficiario } from '@/lib/mi-dashboard-data'
import MiDashboardClient from './MiDashboardClient'

// Server Component: la pantalla que el socio abre desde el celular llega con
// sus datos y sus fotos ya dentro del HTML. Antes eran dos fetch encadenados
// después de hidratar (/api/mi-dashboard y /api/fotos), cada uno volviendo a
// pasar por el gate de sesión -- en una conexión de terreno eso era varios
// segundos de skeleton.
export const dynamic = 'force-dynamic'

export default async function MiDashboardPage() {
  const ctx = await requireBeneficiario()

  const [res, fotos] = await Promise.all([
    cargarMiDashboard(ctx.beneficiarioId),
    cargarFotosDeBeneficiario(ctx.beneficiarioId),
  ])

  if (!res.ok) {
    console.error('mi-dashboard page', res.error)
    return <MiDashboardClient inicial={null} />
  }

  return <MiDashboardClient inicial={{ ...res.data, fotos }} />
}
