import { redirect } from 'next/navigation'

// El consolidado vivía en su propia ruta/tab de menú; ahora es un sub-tab de
// /rendicion (menos ítems en la barra mobile — ver components/Navbar.tsx).
// Se deja este redirect en vez de borrar la ruta para no romper enlaces
// guardados (ej. accesos directos en el celular de algún socio/staff).
export default function VistaResumenRedirect() {
  redirect('/rendicion?tab=resumen')
}
