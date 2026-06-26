# Product Requirements Document (PRD)
# Sistema de Optimización de Presupuestos

**Versión:** 1.0  
**Fecha:** 2026-06-25  
**Proyecto:** Plataforma de Gestión Comunitaria  
**Infraestructura:** Vercel (neurobot-innovations-platform)  
**Stack:** Next.js 16 (App Router), Tailwind CSS v4, Supabase (PostgreSQL), PWA (Online mode)

---

## 1. Contexto y Objetivo

Desarrollar una aplicación web instalable (PWA - online) para administrar un fondo comunitario. Existen **29 beneficiarios**, cada uno con un presupuesto estricto de **$189.000 CLP**.

El sistema debe:
- Automatizar el cálculo de materiales que cada persona puede adquirir sin pasarse del presupuesto.
- Si se excede el presupuesto, calcular automáticamente el **"Aporte de Bolsillo"** (copago).
- Proveer un **Simulador Comparativo** para evaluar distintos proveedores y maximizar el volumen de materiales.

---

## 2. Configuración y Entorno

Variables de entorno requeridas (ver `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

No se requiere autenticación de usuarios en esta fase.

---

## 3. Modelo de Datos

### Tablas PostgreSQL

| Tabla | Descripción |
|-------|-------------|
| `proveedores` | Catálogo de proveedores (ej: Agrícola Villarrica) |
| `insumos` | Materiales por proveedor con precio y formato |
| `beneficiarios` | 29 socios, con proyecto (Invernadero / Cierre Perimetral) |
| `asignaciones` | Carrito de compras por beneficiario (precio desnormalizado) |

**Columna generada:** `asignaciones.costo_total = cantidad × precio_unitario_snapshot`

---

## 4. Reglas de Negocio

### Presupuesto General
- **Saldo Disponible** = $189.000 − ∑(costo_total de asignaciones previas)
- Si el costo supera el saldo → se aprueba pero se calcula **Aporte de Bolsillo** = Total Gastado − $189.000

### Proyecto Invernadero
1. Compra mínima obligatoria: **20 metros de polietileno**
2. Saldo restante → se divide por precio del "Polin 3 a 4 cm"  
   `Cantidad Máx Polines = Math.floor(Saldo Restante / Precio Polin)`

### Proyecto Cierre Perimetral
1. Mínimo **1 unidad de malla** (rollo)
2. Saldo sobrante puede usarse para más rollos enteros o polines

### Catálogo de Mallas
| Malla | Formato |
|-------|---------|
| Malla Ursus 80 cm | Rollo 100m |
| Malla Ursus 100 cm | Rollo 100m |
| Malla Inchalam 120 cm | Rollo 25m |
| Malla Inchalam 150 cm | Rollo 25m |
| Malla Galvanizada 5014 100 cm | Rollo 25m |

---

## 5. Vistas de la Interfaz

### `/beneficiarios` — Gestor de Beneficiarios
- Grid de tarjetas dinámicas con barra de presupuesto
- Panel lateral con: presupuesto base, total gastado, saldo, Aporte de Bolsillo (destacado en rojo)
- Carrito de asignaciones con opción de eliminar
- Sugerencias automáticas según proyecto

### `/precios` — Maestro de Precios
- CRUD completo de insumos
- Filtro por proveedor
- Agrupación por categoría (Malla, Polietileno, Polines)

### `/simulador` — Simulador Comparativo (Vista Principal)
- Comparación side-by-side de todos los proveedores
- Cálculo automático de asignación óptima para 29 beneficiarios
- Insignia verde "Mejor opción" al proveedor con mayor volumen de materiales
- Análisis comparativo: diferencia de volumen, ahorro comunitario, recomendación

---

## 6. Configuración PWA

- `public/manifest.json` con `start_url: /simulador`
- `display: standalone`
- Meta tags en `app/layout.tsx`: `theme-color`, `apple-mobile-web-app-capable`
- **No se requiere Service Worker / cache offline** en esta fase

---

## 7. Decisiones de Arquitectura

- **Precio desnormalizado en asignaciones:** `precio_unitario_snapshot` captura el precio al momento de asignar. Esto garantiza que el `costo_total` (columna generada) no cambie si el precio del insumo se actualiza después.
- **Sin auth:** Primera fase sin sistema de usuarios. Supabase usa RLS deshabilitado.
- **Client Components:** Todas las páginas son `'use client'` por la naturaleza interactiva del dashboard.
- **Separación de lógica:** `lib/business-logic.ts` concentra todos los cálculos de presupuesto, sin mezclarlos con componentes UI.
