import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // El PDF de la consultora (app/api/admin/informe-consultora) lanza el
  // Chromium de @sparticuz/chromium. Si el bundler lo mete dentro del chunk,
  // el binario en node_modules/@sparticuz/chromium/bin no viaja y en Vercel
  // la ruta muere con 'The input directory ".../bin" does not exist' (500
  // desde el 2026-09-08, visto en los runtime logs). Los dos paquetes quedan
  // fuera del bundle y el binario se incluye a mano en el trazado.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  outputFileTracingIncludes: {
    '/api/admin/informe-consultora': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
}

export default nextConfig
