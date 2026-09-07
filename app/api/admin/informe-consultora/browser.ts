import 'server-only'
import puppeteer, { type Browser } from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

// En Vercel (serverless/Lambda) usamos el binario de Chromium empaquetado
// por @sparticuz/chromium -- el paquete `puppeteer` completo no cabe en el
// runtime serverless. En desarrollo local (mac/laptop del equipo) no existe
// ese binario (está compilado para Linux/Lambda), así que apuntamos al
// Chrome real instalado en la máquina vía CHROME_EXECUTABLE_PATH (o el
// path por defecto de Google Chrome en macOS) -- puppeteer-core es el mismo
// paquete en ambos casos, solo cambia executablePath.
export async function getBrowser(): Promise<Browser> {
  const enVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)

  if (!enVercel) {
    // El path de macOS estaba hardcodeado: nadie en Linux o Windows podía
    // generar el informe en desarrollo. CHROME_EXECUTABLE_PATH sigue
    // teniendo prioridad; si no está, se prueba el path por defecto de cada
    // plataforma.
    const porPlataforma: Record<string, string> = {
      darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      linux: '/usr/bin/google-chrome',
      win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    }
    const localPath = process.env.CHROME_EXECUTABLE_PATH || porPlataforma[process.platform]
    if (!localPath) {
      throw new Error(
        `No hay un Chrome conocido para la plataforma ${process.platform}. Define CHROME_EXECUTABLE_PATH.`
      )
    }
    return puppeteer.launch({ executablePath: localPath, headless: true })
  }

  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  })
}
