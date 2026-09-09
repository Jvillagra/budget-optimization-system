import { Suspense } from 'react'
import { MotionRoot } from '@/components/motion/MotionRoot'
import { LoginHero } from './LoginHero'
import { FeatureGrid } from './FeatureGrid'
import { LoginForm } from './LoginForm'

// Pantalla partida: la identidad y el "qué es esto" a la izquierda, la acción
// a la derecha. En mobile se apila en el orden del DOM -- hero, formulario,
// grid -- porque un socio abre esto desde el correo, en terreno, y lo que
// necesita es el campo de email; el grid es contexto y va al final.
//
// La ubicación en desktop se resuelve con col-start/row-start sobre el MISMO
// nodo, no renderizando el grid dos veces con `hidden lg:block`. Duplicarlo
// duplicaría cada `layoutId` de las tarjetas (la transición de elemento
// compartido dejaría de saber cuál es el origen) y cada `id` del diálogo.
export default function LoginPage() {
  return (
    <MotionRoot>
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_minmax(360px,420px)] gap-10 lg:gap-x-16 lg:gap-y-12 items-start py-4 lg:py-10">
        <div className="lg:col-start-1 lg:row-start-1">
          <LoginHero />
        </div>

        <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-20">
          {/* Suspense por useSearchParams dentro del formulario. */}
          <Suspense fallback={<div className="glass-strong rounded-[6px] h-[320px]" />}>
            <LoginForm />
          </Suspense>
        </div>

        <div className="lg:col-start-1 lg:row-start-2">
          <FeatureGrid />
        </div>
      </div>
    </MotionRoot>
  )
}
