import { requireBeneficiario } from '@/lib/guards'

// Gate de rol server-side: ver lib/guards.ts.
export default async function MiDashboardLayout({ children }: { children: React.ReactNode }) {
  await requireBeneficiario()
  return <>{children}</>
}
