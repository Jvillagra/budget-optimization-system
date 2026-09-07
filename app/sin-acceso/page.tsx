import Link from 'next/link'
import { Card } from '@/components/design-system'

// Usuario autenticado cuyo email no está en app_roles ni en beneficiarios.
// Antes caía en /rendicion y veía "Error al cargar la rendición", que hacía
// pensar en una caída del sistema en vez de en una cuenta sin habilitar.
export default function SinAccesoPage() {
  return (
    <Card strong className="max-w-md mx-auto mt-16 p-8 text-center space-y-3">
      <h1 className="text-lg font-semibold" style={{ color: '#1c1c1c' }}>
        Tu cuenta todavía no está habilitada
      </h1>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Iniciaste sesión correctamente, pero tu correo no está asociado a
        ningún beneficiario del Proyecto PAT. Avisa a la organización para
        que lo asocien.
      </p>
      <Link href="/login" className="inline-block text-sm font-medium underline underline-offset-2" style={{ color: 'var(--verde-dark)' }}>
        Entrar con otro correo
      </Link>
    </Card>
  )
}
