import { NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logAudit } from '@/lib/audit'

// Envío masivo de Magic Link a todos los socios con email cargado. Usa
// signInWithOtp del lado del servidor (con service_role, que también puede
// firmar OTPs) -- el envío real de correo lo hace Supabase Auth con el SMTP
// custom configurado a nivel de proyecto (Gmail), no un backend de mail
// propio. Pausa breve entre envíos para no saturar el rate limit de Gmail.

// Sin esto, el endpoint corría con el timeout por defecto de Vercel: 29
// envíos secuenciales × 400ms + latencia SMTP lo cortaban a la mitad y el
// reporte que veía el admin parecía completo.
export const maxDuration = 60

const PAUSA_MS = 400
// Margen para responder antes de que la plataforma mate la función: si se
// acaba, devolvemos lo hecho MARCADO como incompleto en vez de morir.
const PRESUPUESTO_MS = 50_000

export async function POST(req: Request) {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const inicio = Date.now()
  const admin = getSupabaseAdmin()
  const { data: beneficiarios, error } = await admin
    .from('beneficiarios')
    .select('id, nombre, email')
    .not('email', 'is', null)
    .order('nombre')

  if (error) {
    console.error('enviar-magic-links', error)
    return NextResponse.json({ error: 'Error al cargar los socios' }, { status: 500 })
  }

  const destinatarios = (beneficiarios ?? []).filter(b => b.email)
  const resultados: { nombre: string; email: string; ok: boolean; error?: string }[] = []
  let pendientes = 0

  // El template del correo arma el link como `{{ .RedirectTo }}&token_hash=...`
  // (ver app/auth/callback/page.tsx). Sin emailRedirectTo, Supabase usa el
  // Site URL pelado y el link sale malformado (`host&token_hash=...`): el
  // socio tocaba el botón y no llegaba a ninguna parte. Misma URL de
  // retorno que usa /login, con el origen de esta misma petición.
  const emailRedirectTo = `${new URL(req.url).origin}/auth/callback?next=${encodeURIComponent('/mi-dashboard')}`
  for (const [i, b] of destinatarios.entries()) {
    if (Date.now() - inicio > PRESUPUESTO_MS) {
      pendientes = destinatarios.length - i
      break
    }
    const { error: sendError } = await admin.auth.signInWithOtp({
      email: b.email!,
      options: { emailRedirectTo },
    })
    resultados.push({ nombre: b.nombre, email: b.email!, ok: !sendError, error: sendError?.message })
    await new Promise(r => setTimeout(r, PAUSA_MS))
  }

  const enviados = resultados.filter(r => r.ok).length
  const fallidos = resultados.filter(r => !r.ok).length

  await logAudit('beneficiarios', 'update', 'magic-links-masivos', {
    enviados, fallidos, pendientes, total: destinatarios.length,
    actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })

  return NextResponse.json({
    enviados,
    fallidos,
    // > 0 significa que el envío quedó a medias por tiempo: hay que volver a
    // ejecutarlo. Antes esto simplemente no se sabía.
    pendientes,
    total: destinatarios.length,
    detalle: resultados,
  })
}
