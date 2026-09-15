-- 016 — Se va la marca "la paga el socio" (2026-09-14)
--
-- La migración 014 agregó `asignaciones.es_extra` para separar lo que paga el
-- programa de lo que el socio sumaba por su cuenta. En la práctica el botón
-- "Del programa / Del socio" confundía más de lo que aclaraba, y Juan decidió
-- la regla que lo reemplaza:
--
--   - el material base (malla, polietileno) nunca se recorta;
--   - los polines son siempre el saldo del presupuesto;
--   - todo lo que el carrito pasa de $189.000 es aporte propio del socio, y
--     la barra de presupuesto lo muestra sola.
--
-- Con esa regla la marca no tiene qué decir: la única línea marcada (los 47
-- polines de María Inés Burgos) pasa a ser compra del programa y cabe en su
-- presupuesto ($185.650). Se borra la columna y su índice; la regla vive en
-- lib/business-logic.ts (ajustarCarritoAPresupuesto) y aporteDeBolsillo.

drop index if exists asignaciones_es_extra_idx;

alter table asignaciones
  drop column if exists es_extra;
