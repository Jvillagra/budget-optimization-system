# Sistema de diseño — Proyecto PAT

Documento vivo. Formaliza el lenguaje visual que ya existía parcialmente en
`app/rendicion/page.tsx` y `components/Navbar.tsx` (paleta verde/café + efecto
"glass") y lo extiende a `login`, `admin` y `mi-dashboard` para que las 4
páginas se sientan como un mismo producto.

## 1. Auditoría inicial (2026-08-26)

Antes del rediseño, cada página usaba un lenguaje distinto:

| Página | Paleta | Tarjetas | Botones |
|---|---|---|---|
| `rendicion` | verde/café (`--verde*`, `--cafe*`) | `.glass` | color sólido + `active:scale-[0.97]` |
| `login` | `indigo-600`, `gray-300` (Tailwind default) | ninguna | `rounded-xl bg-indigo-600` |
| `admin` | `indigo-600`, `gray-200` (Tailwind default) | `bg-white border` plano | `rounded-lg bg-indigo-600` |
| `mi-dashboard` | `indigo-600`, `gray-200` (Tailwind default) | `bg-white border` plano | pills `bg-indigo-600` |

`rendicion` es la referencia: es la más reciente, ya en producción, y define
el patrón correcto. El trabajo de rediseño consiste en **generalizar ese
patrón**, no inventar uno nuevo, para minimizar riesgo sobre páginas
funcionalmente delicadas (Magic Link, upload R2).

## 2. Paleta

Definida como variables CSS en `app/globals.css` (`:root`). No se agregan
colores nuevos fuera de estados semánticos (error/warning), que ya existían
como `red-600` / `amber-700` en el código heredado.

| Token | Valor | Uso |
|---|---|---|
| `--verde` | `#3a7d44` | Acento primario, botones de acción, estado activo |
| `--verde-dark` | `#2d5f35` | Texto sobre fondo claro, títulos de sección |
| `--verde-light` | `#6ab07a` | Hover/decorativo |
| `--verde-muted` | `#e8f5eb` | Fondo de badges "completo"/éxito |
| `--cafe` | `#7f4f24` | Acento secundario |
| `--cafe-dark` | `#5c3519` | Texto secundario enfatizado |
| `--cafe-light` | `#a47148` | Hover/decorativo |
| `--cafe-muted` | `#f5ede4` | Fondo de badges neutros/segmento |
| `--bg-from` / `--bg-to` | `#f7f3ed` → `#edf4ee` | Gradiente de fondo global |
| `--glass-bg` / `--glass-border` / `--glass-shadow` | — | Superficie `.glass` |
| Error | `#b91c1c` (`red-700`) | Mensajes de error de formulario/badge/alert |
| Warning | `#b45309` (`amber-700`) | Avisos no bloqueantes |
| `--text-muted` | `rgba(0,0,0,0.62)` | Texto secundario/auxiliar (labels, metadata, "cargando…") |

Texto: `#1c1c1c` (foreground) sobre fondos claros; blanco sobre `--verde` /
`--cafe` sólidos; `--text-muted` para todo texto secundario. Todas estas
combinaciones cumplen WCAG AA (≥4.5:1) — verificado numéricamente (fórmula de
luminancia relativa WCAG) para cada par texto/fondo realmente usado en los
componentes base y en las 4 páginas rediseñadas:

| Par | Contraste |
|---|---|
| `--verde-dark` sobre `--verde-muted` (Badge) | 6.68:1 |
| `--cafe-dark` sobre `--cafe-muted` (Badge/Button secondary) | 9.16:1 |
| blanco sobre `--verde` (Button primary) | 5.00:1 |
| `--verde-dark` sobre blanco (H1) | 7.50:1 |
| `#1c1c1c` sobre blanco (cuerpo) | 17.04:1 |
| `red-700` sobre `red-50` (Button/Badge/Alert danger) | 5.91:1 |
| `amber-700` sobre `amber-50` (Alert warning) | 4.84:1 |
| `--text-muted` sobre blanco | 5.74:1 |
| `black/70` sobre `black/6` (Badge neutral) | 7.46:1 |

Nota de auditoría: el patrón heredado de `rendicion` usaba `rgba(0,0,0,0.3)`
a `rgba(0,0,0,0.45)` para texto secundario (contraste real: 2.1:1–3.4:1,
**no cumple AA**). Se corrigió a `--text-muted` en las 4 páginas como parte
de este rediseño — no solo en las páginas nuevas, también en `rendicion`
pese a ser la referencia, porque el criterio de éxito del brief exige AA en
las 4 páginas sin excepción. El botón "danger" pasó de `red-600` (4.41:1,
no cumple) a `red-700` (5.91:1) por el mismo motivo.

## 3. Tipografía

Una sola familia: **Geist Sans** (ya cargada vía `next/font/google` en
`app/layout.tsx`, variable `--font-geist-sans`). El brief permite hasta 3
familias, pero se decide **no** sumar una segunda para no aumentar peso ni
introducir una nueva dependencia — la variación viene de peso y tracking:

| Uso | Clase |
|---|---|
| H1 de página | `text-xl font-bold` (`--verde-dark`) |
| H2 de sección | `text-sm font-semibold` (`--cafe-dark` o `rgba(0,0,0,.45)`) |
| Cuerpo | `text-sm` (`#1c1c1c`) |
| Auxiliar / metadata | `text-xs` (`rgba(0,0,0,.45)`) |
| Números destacados (KPIs) | `text-xl font-bold` |

## 4. Espaciado

Grid de 8px (escala Tailwind por defecto: 1=4px, 2=8px, 3=12px, 4=16px...).
Reglas:
- Padding interno de tarjetas: `p-4` (16px) o `p-6` (24px) en containers grandes.
- Separación entre secciones: `space-y-6` u `space-y-8`.
- Separación entre elementos de un formulario: `space-y-3` (12px).
- Radios: `rounded-lg` (8px) en controles pequeños, `rounded-xl`/`rounded-2xl`
  (12–16px) en tarjetas y superficies `.glass`.

## 5. Componentes base — `components/design-system/`

Todos son wrappers finos sobre HTML nativo + Tailwind, sin librerías nuevas.
Contrato: mismas props de siempre (`onClick`, `disabled`, `type`, `children`,
`className`, atributos nativos vía spread) para no romper backward-compat.

- **`Button`** — variantes `primary` (verde sólido), `secondary` (café/verde
  muted), `danger` (rojo, para "quitar"/"revertir"), `ghost` (texto, para
  logout/acciones terciarias). `active:scale-[0.97]` + `disabled:opacity-50`
  heredado de `rendicion` (no hay estado `loading` propio; los botones usan
  `disabled` durante operaciones async). Focus visible con
  `focus-visible:ring-2`.
- **`Card`** — superficie `.glass` (`rounded-2xl`), con variante `strong` para
  contenido que necesita más contraste (formularios).
- **`Input`** — campo de texto con el mismo radio/padding en las 4 páginas,
  estado de error, `focus-visible` consistente.
- **`Badge`** — pill de estado (segmento, rol, completo/pendiente), reutiliza
  `--verde-muted` / `--cafe-muted` como en `rendicion`.
- **`Alert`** — mensaje de error/aviso (reemplaza `<p className="text-red-600">`
  sueltos).

## 6. Motion

Sutil, con presupuesto <300ms, siempre detrás de `motion-safe:` (ya usado en
el lightbox de `rendicion`, patrón que se respeta):
- Hover de tarjetas/fotos: `hover:scale-105` / `active:scale-95`.
- Botones: `active:scale-[0.97]`.
- Aparición de contenido: `motion-safe:animate-[fadeIn_150ms_ease-out]`.
- Todos los controles interactivos llevan `focus-visible:ring-2
  focus-visible:ring-offset-2` con color del token activo, para navegación
  por teclado.

## 7. No tocar

- `app/api/**`, `supabase/migrations/**`, RLS/policies.
- Flujo Magic Link (`window.location.assign` post-login en login/logout).
- Estructura de forms de upload a R2 (`app/mi-dashboard/page.tsx`).
- Rutas existentes.
