-- 011 — Un precio de $0 no es una cotización (2026-09-13)
--
-- Agrícola Pucón tenía `precio_unitario = 0` en Polines (3 a 4 cm),
-- Polines (4 a 5 cm) y Polietileno. Nunca cotizó esos insumos: el 0 era el
-- valor con el que quedó la carga inicial, no un precio real.
--
-- El código trata el 0 como precio VÁLIDO a propósito (un insumo donado o
-- incluido en el paquete cuesta 0 de verdad; ver getPrecio() en
-- lib/business-logic.ts, que distingue 0 de null). Esa decisión sigue en pie:
-- lo que estaba mal era el dato.
--
-- Consecuencia visible del dato malo: en /rendición el "proveedor de
-- referencia" se calculaba como el más barato que cotizara el carrito
-- completo, y Pucón ganaba siempre con polines gratis — Marcia Catrilef
-- aparecía con Sodimac ($190.450) en /beneficiarios y con Agrícola Pucón
-- ($86.000) en /rendición. El cálculo automático se reemplazó por un
-- proveedor de referencia fijo (Sodimac), pero el 0 igual tenía que irse:
-- seguía mintiendo en /simulador y /precios.
--
-- Efecto esperado en /simulador: Agrícola Pucón pasa a reportar
-- "Sin precio: Polines (3 a 4 cm)" para los socios, porque es la verdad.
-- Cuando Pucón cotice de verdad, se carga el precio desde /precios.

update precios_proveedor pp
set precio_unitario = null
from proveedores p, catalogo_insumos ci
where pp.proveedor_id = p.id
  and pp.insumo_id = ci.id
  and p.nombre ilike '%pucon%'
  and pp.precio_unitario = 0
  and (ci.nombre ilike 'polines%' or ci.nombre ilike 'polietileno%');
