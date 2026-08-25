import 'server-only'
import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
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
  if (size > MAX_BYTES) {
    return `El archivo supera el máximo de 8MB.`
  }
  return null
}

export { MAX_FOTOS_POR_SOCIO }

// Presigned PUT: el navegador sube el archivo DIRECTO a R2 (no pasa por
// nuestro servidor) -- evita el límite de ~4.5MB de request body de las
// funciones serverless de Vercel, que 8MB por foto superaría si proxyáramos
// el archivo por una ruta /api/*.
export async function urlFirmadaSubida(key: string, contentType: string, expiresInSeconds = 300) {
  const client = getClient()
  const command = new PutObjectCommand({ Bucket: getBucket(), Key: key, ContentType: contentType })
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds })
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
