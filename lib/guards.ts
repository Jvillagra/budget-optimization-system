import 'server-only'
import { redirect } from 'next/navigation'
import { getViewerContext, isStaff, type ViewerContext } from './roles'

// Gate de rol del lado del SERVIDOR para las páginas.
//
// Hasta ahora la única autorización real vivía en los route handlers: todas
// las páginas son 'use client' y cualquier socio que escribiera /admin o
// /precios en la barra de direcciones veía la pantalla completa de staff
// (formularios, botones, estructura) y solo fallaba la carga de datos, con
// un "Error al cargar" que no explica nada. Estos guards se ejecutan en el
// layout de cada sección, antes de mandar HTML al navegador.

/** Solo owner/admin. Un socio se va a su propio dashboard; un usuario sin
 *  rol, a la pantalla que le explica que su cuenta no está habilitada. */
export async function requireStaff(): Promise<Extract<ViewerContext, { role: 'owner' | 'admin' }>> {
  const ctx = await getViewerContext()
  if (isStaff(ctx)) return ctx
  if (ctx.role === 'socio') redirect('/mi-dashboard')
  if (!ctx.userId) redirect('/login')
  redirect('/sin-acceso')
}

/** Cualquiera que tenga un beneficiario asociado: socio puro, o staff que
 *  además es socio (caso real: María Inés, ver lib/roles.ts). */
export async function requireBeneficiario(): Promise<ViewerContext & { beneficiarioId: string }> {
  const ctx = await getViewerContext()
  if (ctx.beneficiarioId) return ctx as ViewerContext & { beneficiarioId: string }
  if (!ctx.userId) redirect('/login')
  redirect('/sin-acceso')
}
