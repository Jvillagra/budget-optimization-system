import { NextRequest } from 'next/server'

// Gate de contraseña compartida: la app no tiene login por usuario (comunidad
// pequeña, sin roles), pero sí necesita que "cualquiera con la anon key"
// deje de poder escribir. La cookie de sesión es un token firmado (HMAC),
// no una sesión de servidor con estado -- suficiente para este caso de uso.
//
// Usa Web Crypto (`crypto.subtle`) en vez de `node:crypto` porque
// middleware.ts corre en Edge Runtime, que no soporta módulos de Node.

export const SESSION_COOKIE = 'pat_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 días

function getSecret(): string {
  const secret = process.env.APP_SESSION_SECRET
  if (!secret) throw new Error('APP_SESSION_SECRET no configurada')
  return secret
}

async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a)
  const bufB = new TextEncoder().encode(b)
  if (bufA.length !== bufB.length) return false
  let diff = 0
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i]
  return diff === 0
}

export async function createSessionToken(): Promise<{ token: string; maxAge: number }> {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  const sig = await hmac(String(expiresAt))
  return { token: `${expiresAt}.${sig}`, maxAge: SESSION_MAX_AGE_SECONDS }
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false
  const [expiresAtStr, sig] = token.split('.')
  if (!expiresAtStr || !sig) return false
  const expiresAt = Number(expiresAtStr)
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false

  const expectedSig = await hmac(expiresAtStr)
  return timingSafeEqualStr(sig, expectedSig)
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.APP_PASSWORD
  if (!expected) throw new Error('APP_PASSWORD no configurada')
  return timingSafeEqualStr(candidate, expected)
}

/** Para usar dentro de Route Handlers de escritura (defensa en profundidad además del middleware). */
export async function requireAuth(req: NextRequest): Promise<boolean> {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
}
