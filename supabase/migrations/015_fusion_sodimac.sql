-- 015 — Los dos "Sodimac" son la misma empresa (2026-09-14)
--
-- `proveedores` tenía dos filas para Sodimac: "Sodimac último"
-- (00000000-0000-0000-0000-000000000002, la carga inicial) y "Sodimac"
-- (4adc64ec-e67e-4864-8179-fa9c2e372d65, creada después). Juan confirmó el
-- 2026-09-14 que es la misma empresa y que los precios vigentes son los de
-- "Sodimac último" donde existen. Esa fila tenía tres huecos que se rellenan
-- con la otra: Polines (4 a 5 cm) sin precio, Malla Inchalam Ecosol 150 cm
-- sin precio y Polietileno en $0 (carga inicial, no cotización -- ver 011).
--
-- Por qué importa que quede UNA sola: el proveedor de referencia se elige
-- por nombre (proveedorPorDefecto en lib/business-logic.ts: el primero que
-- contenga "sodimac"). Con dos filas, cuál gana dependía del orden
-- alfabético, y sin polines en la que quedara 27 de 29 socios pasarían a
-- "sin cotizar completo".
--
-- Las cantidades de los carritos NO se tocan acá: el reajuste al presupuesto
-- (lib/ajuste-carritos.ts) se corre desde la app después, mirando el
-- resultado antes de aplicarlo.

begin;

-- 1. Rellenar los huecos de la fila que se conserva con los precios de la otra.
update precios_proveedor viejo
set precio_unitario = nuevo.precio_unitario
from precios_proveedor nuevo
where viejo.proveedor_id = '00000000-0000-0000-0000-000000000002'
  and nuevo.proveedor_id = '4adc64ec-e67e-4864-8179-fa9c2e372d65'
  and nuevo.insumo_id = viejo.insumo_id
  and (viejo.precio_unitario is null or viejo.precio_unitario = 0)
  and nuevo.precio_unitario is not null;

-- 2. La única compra confirmada con la fila que se va pasa a la que queda.
update beneficiarios
set proveedor_compra_id = '00000000-0000-0000-0000-000000000002'
where proveedor_compra_id = '4adc64ec-e67e-4864-8179-fa9c2e372d65';

update compras_segmento
set proveedor_id = '00000000-0000-0000-0000-000000000002'
where proveedor_id = '4adc64ec-e67e-4864-8179-fa9c2e372d65';

-- 3. Borrar la fila duplicada (sus precios se van en cascada) y dejar un
--    solo nombre.
delete from proveedores where id = '4adc64ec-e67e-4864-8179-fa9c2e372d65';

update proveedores
set nombre = 'Sodimac'
where id = '00000000-0000-0000-0000-000000000002';

commit;
