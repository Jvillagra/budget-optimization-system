-- 014 — El carrito se ajusta al presupuesto, y la línea extra la paga el socio
--       (2026-09-14)
--
-- Dos cambios que van juntos porque son la misma regla.
--
-- ## `asignaciones.es_extra`
--
-- El presupuesto de cada socio es fijo ($189.000) y las cantidades son la
-- variable: si sube el precio de un material, el socio compra menos. Eso
-- convierte al carrito en algo que la app recalcula sola, y por primera vez
-- hace falta distinguir dos cosas que hasta ahora eran una:
--
--   - lo que paga el programa, que tiene que caber en el presupuesto y que el
--     recálculo puede bajar cuando cambia un precio;
--   - lo que el socio decidió sumar por su cuenta y paga de su bolsillo, que
--     NADIE puede bajarle automáticamente.
--
-- Sin esta columna las dos cosas son indistinguibles, y el ajuste automático
-- le borraría al socio lo que eligió pagar. Por eso el default es `false`:
-- todo lo cargado hasta hoy es compra del programa, que es lo que es.
--
-- El aporte de bolsillo (lib/business-logic.ts::aporteDeBolsillo) se mantiene,
-- pero pasa a significar otra cosa: ya no es "se pasó del presupuesto sin
-- querer" sino "esto lo eligió y lo paga". Son los dos totales que el staff
-- necesita ver por separado para cobrar.
--
-- ## El polín duplicado
--
-- `catalogo_insumos` tiene dos filas de polines, a0000000-…-0002 y
-- a0000000-…-0003, que el 2026-09-14 quedaron con el MISMO nombre
-- ("Polines (4 a 5 cm)"). Eso no es cosmético: los polines son la variable de
-- ajuste de todo el cálculo, y `simularBeneficiario` elige entre candidatos
-- ordenando por nombre y después por id (`primeroEstable`). Con los dos
-- nombres iguales, cuál gana depende del id — y el 0003 no tiene precio en
-- Sodimac, el proveedor de referencia, así que si ganara él la simulación
-- fallaría con "Sin precio" para los 29 socios.
--
-- Se desactiva el 0003, no el 0002, porque el 0002 es el que tiene los datos:
-- 519 unidades repartidas en 27 socios y precio en los dos proveedores que
-- cotizan. El 0003 no lo usa NADIE (0 asignaciones), así que no hay cantidades
-- que mover ni carrito que cambie: es una fila huérfana que solo generaba
-- ambigüedad. Desactivar y no borrar, igual que en la migración 013: sus
-- precios y su nombre siguen resolviendo si algún día aparece referenciado.

alter table asignaciones
  add column if not exists es_extra boolean not null default false;

comment on column asignaciones.es_extra is
  'true = esta línea la paga el socio de su bolsillo. El ajuste automático al presupuesto la ignora y nunca le baja la cantidad.';

-- Índice parcial: las consultas que arman el carrito financiado por el
-- programa filtran `es_extra = false`, y las líneas extra son la minoría.
create index if not exists asignaciones_es_extra_idx
  on asignaciones (beneficiario_id) where es_extra;

update catalogo_insumos
   set es_activo = false
 where id = 'a0000000-0000-0000-0000-000000000003'
   and not exists (select 1 from asignaciones where insumo_id = 'a0000000-0000-0000-0000-000000000003');
