import 'server-only'
import { S3Client, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const MAX_BYTES = 8 * 1024 * 1024 // 8MB
const MAX_FOTOS_POR_SOCIO = 5

function getClient() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Credenciales de Cloudflare R2 no configuradas')
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

function getBucket() {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET
  if (!bucket) throw new Error('CLOUDFLARE_R2_BUCKET no configurado')
  return bucket
}

export function validarTipoYTamano(contentType: string, size: number) {
  if (!TIPOS_PERMITIDOS.includes(contentType)) {
    return `Tipo de archivo no permitido (${contentType}). Usa JPG, PNG, WEBP o HEIC.`
  }
  if (!Number.isFinite(size) || size <= 0) {
    return 'Tamaño de archivo inválido.'
  }
  if (size > MAX_BYTES) {
    return `El archivo supera el máximo de 8MB.`
  }
  return null
}

export { MAX_FOTOS_POR_SOCIO, MAX_BYTES, TIPOS_PERMITIDOS }

// Presigned PUT: el navegador sube el archivo DIRECTO a R2 (no pasa por
// nuestro servidor) -- evita el límite de ~4.5MB de request body de las
// funciones serverless de Vercel, que 8MB por foto superaría si proxyáramos
// el archivo por una ruta /api/*.
//
// `ContentLength` va DENTRO de la firma a propósito: sin él, el `size` que
// validamos es solo el que declara el cliente y la URL firmada sirve para
// subir un objeto de cualquier tamaño (5GB incluidos). Al firmarlo, R2
// rechaza el PUT si el content-length real no coincide con el declarado.
// El navegador setea Content-Length solo a partir del body (File), así que
// coincide siempre en el flujo legítimo. Verificamos igual el tamaño real
// contra R2 al confirmar (ver objetoMeta), por si algún cliente lo elude.
export async function urlFirmadaSubida(key: string, contentType: string, contentLength: number, expiresInSeconds = 300) {
  const client = getClient()
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  })
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds })
}

/** Metadatos reales del objeto en R2, o null si no existe. */
export async function objetoMeta(key: string): Promise<{ size: number; contentType: string | null } | null> {
  const client = getClient()
  try {
    const res = await client.send(new HeadObjectCommand({ Bucket: getBucket(), Key: key }))
    return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? null }
  } catch {
    return null
  }
}

export async function borrarFoto(key: string) {
  const client = getClient()
  await client.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }))
}

export async function urlFirmadaLectura(key: string, expiresInSeconds = 300) {
  const client = getClient()
  const command = new GetObjectCommand({ Bucket: getBucket(), Key: key })
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds })
}

/** Descarga el objeto completo a memoria. null si no existe. Se usa para
 *  reprocesar a WebP lo recién subido (ver lib/imagen.ts): el archivo sube
 *  directo del navegador a R2, así que este es el único momento en que el
 *  servidor lo tiene entre manos. */
export async function descargarObjeto(key: string): Promise<Buffer | null> {
  const client = getClient()
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: getBucket(), Key: key }))
    if (!res.Body) return null
    return Buffer.from(await res.Body.transformToByteArray())
  } catch {
    return null
  }
}

export async function subirObjeto(key: string, body: Buffer, contentType: string) {
  const client = getClient()
  await client.send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: body,
    ContentType: contentType,
    ContentLength: body.byteLength,
  }))
}

// Sufijos de las dos versiones que produce la conversión a WebP (ver
// lib/imagen.ts). El marcador `.opt` no es decorativo: es lo que permite
// saber, mirando SOLO la key, si esa foto tiene miniatura -- sin agregar una
// columna a `fotos_compra` ni hacer un HEAD contra R2 por foto. Las fotos
// anteriores a la conversión terminan en .jpg/.png/.heic y quedan fuera; una
// key nunca puede terminar en `.opt.webp` por accidente.
const SUFIJO_OPTIMIZADA = '.opt.webp'
const SUFIJO_MINIATURA = '.thumb.webp'

export { SUFIJO_OPTIMIZADA, SUFIJO_MINIATURA }

/** Key de la miniatura de una foto, o null si esa foto no tiene (subida
 *  antes de que existiera la conversión, o conversión fallida). */
export function keyMiniatura(key: string): string | null {
  if (!key.endsWith(SUFIJO_OPTIMIZADA)) return null
  return key.slice(0, -SUFIJO_OPTIMIZADA.length) + SUFIJO_MINIATURA
}

/** Las dos URLs firmadas de una foto. `thumbUrl` cae a la principal cuando no
 *  hay miniatura, así el que consume no necesita saber nada de esto. */
export async function urlsFirmadasFoto(key: string, expiresInSeconds = 300) {
  const thumbKey = keyMiniatura(key)
  const [url, thumbUrl] = await Promise.all([
    urlFirmadaLectura(key, expiresInSeconds),
    thumbKey ? urlFirmadaLectura(thumbKey, expiresInSeconds) : null,
  ])
  return { url, thumbUrl: thumbUrl ?? url }
}
