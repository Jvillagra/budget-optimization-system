-- 012 — Un insumo, una fila por socio (2026-09-13)
--
-- `asignaciones` no tenía unicidad por (beneficiario_id, insumo_id), así que
-- el mismo insumo se podía cargar N veces para la misma persona. Ana Luz
-- Huisca tenía "Polines (3 a 4 cm) × 5" tres veces y "Malla Inchalam 120 cm
-- × 1" dos veces: su tarjeta decía "5 ítems" cuando el resto de los socios
-- tiene 1 o 2, y borrar una línea del carrito solo borraba un pedazo de la
-- cantidad real.
--
-- El total nunca estuvo mal (la app suma las filas), y por eso el error
-- sobrevivió: solo se notaba en el conteo de ítems y en el detalle repetido.
--
-- Paso 1: consolidar. Se conserva la fila más antigua de cada par y se le
-- suma la cantidad de las repetidas. El total cotizado de cada socio queda
-- idéntico -- es una suma de las mismas cantidades.

with agrupadas as (
  select beneficiario_id, insumo_id,
         min(id::text)::uuid as id_conservada,
         sum(cantidad)       as cantidad_total
  from asignaciones
  group by beneficiario_id, insumo_id
  having count(*) > 1
)
update asignaciones a
set cantidad = ag.cantidad_total
from agrupadas ag
where a.id = ag.id_conservada;

with agrupadas as (
  select beneficiario_id, insumo_id, min(id::text)::uuid as id_conservada
  from asignaciones
  group by beneficiario_id, insumo_id
  having count(*) > 1
)
delete from asignaciones a
using agrupadas ag
where a.beneficiario_id = ag.beneficiario_id
  and a.insumo_id = ag.insumo_id
  and a.id <> ag.id_conservada;

-- Paso 2: que no vuelva a pasar.
--
-- Ojo con el efecto en la app: POST /api/asignaciones hacía un INSERT pelado
-- y con esta restricción empezaría a fallar cuando el insumo ya está en el
-- carrito. Ese endpoint pasó a sumar sobre la fila existente, que es lo que
-- el staff espera al apretar "Agregar" dos veces.
alter table asignaciones
  add constraint asignaciones_beneficiario_insumo_key
  unique (beneficiario_id, insumo_id);
