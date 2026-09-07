import { requireStaff } from '@/lib/guards'

// Gate de rol server-side: ver lib/guards.ts.
export default async function BeneficiariosLayout({ children }: { children: React.ReactNode }) {
  await requireStaff()
  return <>{children}</>
}
