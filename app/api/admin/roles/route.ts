import { NextRequest, NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

// Owner y admin tienen los mismos permisos operativos (ver PRD v2), pero el
// rol `owner` NO es administrable desde acá: no se puede crear, degradar ni
// borrar por API. Se setea a mano en la base, a propósito -- es el ancla que
// impide que un admin comprometido se quede con el proyecto.

export async function GET() {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from('app_roles').select('user_id, role, created_at').order('created_at')
  if (error) {
    console.error('roles GET', error)
    return NextResponse.json({ error: 'Error al cargar los roles' }, { status: 500 })
  }

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
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

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

  // El upsert ciego degradaba al owner a admin si alguien escribía su email
  // en el formulario "agregar admin". El rol owner nunca se toca por API.
  const { data: existente } = await admin
    .from('app_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existente?.role === 'owner') {
    return NextResponse.json({
      pending: true,
      message: `${email} ya es propietario del proyecto -- no hace falta agregarlo como administrador.`,
    })
  }
  if (existente?.role === 'admin') {
    return NextResponse.json({ ok: true, sinCambios: true })
  }

  const { error } = await admin.from('app_roles').insert({ user_id: user.id, role: 'admin' })
  if (error) {
    console.error('roles POST', error)
    return NextResponse.json({ error: 'No se pudo agregar el administrador' }, { status: 400 })
  }

  await logAudit('app_roles', 'insert', user.id, {
    email, role: 'admin', actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
  if (userId === ctx.userId) return NextResponse.json({ error: 'No puedes quitarte a ti mismo' }, { status: 400 })

  const admin = getSupabaseAdmin()

  const { data: objetivo } = await admin
    .from('app_roles')
    .select('user_id, role')
    .eq('user_id', userId)
    .maybeSingle()

  if (!objetivo) return NextResponse.json({ error: 'Ese usuario no tiene rol asignado' }, { status: 404 })
  if (objetivo.role !== 'admin') {
    // La UI ya esconde el botón para owners, pero eso es decoración: sin
    // este chequeo un admin dejaba el proyecto sin propietario con un curl.
    return NextResponse.json({ error: 'El rol de propietario no se puede quitar desde la aplicación' }, { status: 403 })
  }

  // El `.eq('role','admin')` es la barrera real: aunque el rol cambie entre
  // la lectura de arriba y esta línea, el DELETE nunca puede tocar un owner.
  const { error } = await admin.from('app_roles').delete().eq('user_id', userId).eq('role', 'admin')
  if (error) {
    console.error('roles DELETE', error)
    return NextResponse.json({ error: 'No se pudo quitar el administrador' }, { status: 400 })
  }

  await logAudit('app_roles', 'delete', userId, {
    role: 'admin', actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })
  return NextResponse.json({ ok: true })
}
