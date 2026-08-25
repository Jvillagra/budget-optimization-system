import { NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Envío masivo de Magic Link a todos los socios con email cargado. Usa
// signInWithOtp del lado del servidor (con service_role, que también puede
// firmar OTPs) -- el envío real de correo lo hace Supabase Auth con el SMTP
// custom configurado a nivel de proyecto (Gmail), no un backend de mail
// propio. Pausa breve entre envíos para no saturar el rate limit de Gmail.
export async function POST() {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = getSupabaseAdmin()
  const { data: beneficiarios, error } = await admin
    .from('beneficiarios')
    .select('id, nombre, email')
    .not('email', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const resultados: { nombre: string; email: string; ok: boolean; error?: string }[] = []

  for (const b of beneficiarios ?? []) {
    if (!b.email) continue
    const { error: sendError } = await admin.auth.signInWithOtp({ email: b.email })
    resultados.push({ nombre: b.nombre, email: b.email, ok: !sendError, error: sendError?.message })
    await new Promise(r => setTimeout(r, 400)) // no saturar el rate limit de envío
  }

  return NextResponse.json({
    enviados: resultados.filter(r => r.ok).length,
    fallidos: resultados.filter(r => !r.ok).length,
    detalle: resultados,
  })
}
