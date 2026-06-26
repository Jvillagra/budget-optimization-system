# Contexto del Proyecto — Sistema de Optimización de Presupuestos

**Última actualización:** 2026-06-25

---

## Propósito

Este sistema administra el fondo de materiales de una comunidad agrícola chilena. Hay **29 beneficiarios** organizados en dos proyectos, cada uno con un presupuesto fijo de **$189.000 CLP** del fondo.

---

## Estructura del Proyecto

```
budget-optimization-system/
├── app/
│   ├── layout.tsx          # Root layout con Navbar + PWA meta tags
│   ├── page.tsx            # Redirige a /simulador
│   ├── beneficiarios/
│   │   └── page.tsx        # Gestor de beneficiarios + carrito
│   ├── precios/
│   │   └── page.tsx        # CRUD insumos (Maestro de Precios)
│   └── simulador/
│       └── page.tsx        # Comparativo de proveedores
├── components/
│   ├── Navbar.tsx          # Navegación principal
│   ├── BeneficiarioCard.tsx # Tarjeta de beneficiario con estado de presupuesto
│   └── PresupuestoPanel.tsx # Panel lateral con desglose financiero
├── lib/
│   ├── supabase.ts         # Cliente Supabase (singleton)
│   ├── types.ts            # Tipos TypeScript del modelo de datos
│   └── business-logic.ts  # Lógica de negocio pura (sin side effects)
├── supabase/migrations/
│   ├── 001_initial_schema.sql  # Creación de tablas + índices
│   └── 002_seed_data.sql       # 2 proveedores + 7 insumos × 2 + 29 beneficiarios
├── public/
│   └── manifest.json       # PWA manifest
└── docs/
    ├── PRD.md              # Requerimientos del producto
    └── CONTEXT.md          # Este archivo
```

---

## Modelo Mental de Negocio

```
Proveedor → tiene → [Insumos con precio]
Beneficiario → pertenece a → [Proyecto: Invernadero | Cierre Perimetral]
Beneficiario → tiene → [Asignaciones de Insumos]
Asignacion.costo_total → determina → Saldo Disponible
Saldo < 0 → genera → Aporte de Bolsillo
```

---

## Variables de Entorno

| Variable | Descripción |
|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anon pública |

Ver `.env.example` para plantilla.

---

## Stack Técnico

| Tecnología | Versión | Rol |
|-----------|---------|-----|
| Next.js | 16.x | Framework (App Router) |
| React | 19.x | UI |
| Tailwind CSS | v4 | Estilos |
| Supabase JS | 2.x | BaaS / PostgreSQL |
| TypeScript | 5.x | Tipado estático |

---

## Flujo de Despliegue

1. Conectar repositorio a Vercel
2. Agregar variables de entorno en Vercel Dashboard
3. Ejecutar migraciones SQL en Supabase (Panel SQL o Supabase CLI)
4. Ejecutar seed data en Supabase
5. Deploy automático en cada push a `main`

---

## Convenciones de Código

- Lógica de negocio en `lib/business-logic.ts` (funciones puras, testeables)
- Tipos en `lib/types.ts` (un solo lugar de verdad)
- Componentes en `components/` (solo UI, sin lógica de negocio)
- Páginas en `app/*/page.tsx` (orquestación: fetch + estado + layout)
- Sin comentarios en código obvio; solo cuando el WHY no es evidente

---

## Datos Seed

- **2 proveedores:** Agrícola Villarrica, Proveedor B
- **7 tipos de insumos** por proveedor (Polietileno, Polines, 5 tipos de Malla)
- **29 beneficiarios:** 15 Invernadero + 14 Cierre Perimetral

---

## Decisiones Técnicas Clave

1. **`precio_unitario_snapshot`** en asignaciones: evita que cambios de precio afecten costos históricos.
2. **`costo_total` como columna generada**: integridad garantizada por la BD, no por el frontend.
3. **Sin Service Worker**: App funciona solo online; no se requiere cache offline en esta fase.
4. **`'use client'`** en todas las páginas: el dashboard es completamente interactivo, no hay SSR útil aquí.
