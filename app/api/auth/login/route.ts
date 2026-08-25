import { NextRequest, NextResponse } from 'next/server'
import { checkPassword, createSessionToken, SESSION_COOKIE } from '@/lib/auth'

export async function POST(req: NextRequest) {
  let password: unknown
  try {
    ;({ password } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  }

  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json({ error: 'Contraseña requerida' }, { status: 400 })
  }

  if (!checkPassword(password)) {
    // Respuesta genérica + delay fijo: no da pistas de timing ni de si el
    // usuario "existe" (no hay usuarios, pero mantiene el hábito).
    return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 })
  }

  const { token, maxAge } = await createSessionToken()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  })
  return res
}
