import { NextRequest, NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

// Owner y admin tienen los mismos permisos (ver PRD v2) -- ambos pueden
// gestionar la lista de admins. No hay endpoint para cambiar quién es
// owner: ese dato se setea a mano en la base, a propósito.

export async function GET() {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from('app_roles').select('user_id, role, created_at').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: usersData } = await admin.auth.admin.listUsers()
  const emailPorId = new Map((usersData?.users ?? []).map(u => [u.id, u.email]))
  const roles = (data ?? []).map(r => ({ ...r, email: emailPorId.get(r.user_id) ?? '(sin login todavía)' }))

  return NextResponse.json({ roles })
}

// Agrega un admin por email. Si la persona nunca inició sesión, primero le
// mandamos un Magic Link (crea el auth.users) y recién ahí se puede
// vincular el rol -- se lo informamos al que hace el pedido.
export async function POST(req: NextRequest) {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) return NextResponse.json({ error: 'email es requerido' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const { data: usersData } = await admin.auth.admin.listUsers()
  const user = usersData?.users.find(u => u.email?.toLowerCase() === email)

  if (!user) {
    await admin.auth.admin.inviteUserByEmail(email).catch(() => null)
    return NextResponse.json({
      pending: true,
      message: `${email} todavía no tiene cuenta -- le mandamos una invitación. Cuando inicie sesión por primera vez, vuelve a intentar agregarlo como admin.`,
    })
  }

  const { error } = await admin.from('app_roles').upsert({ user_id: user.id, role: 'admin' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await logAudit('app_roles', 'insert', user.id, { email, role: 'admin' })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
  if (userId === ctx.userId) return NextResponse.json({ error: 'No puedes quitarte a ti mismo' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const { error } = await admin.from('app_roles').delete().eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await logAudit('app_roles', 'delete', userId, null)
  return NextResponse.json({ ok: true })
}
