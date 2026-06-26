-- Seed: Proveedor base
INSERT INTO proveedores (id, nombre) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Agrícola Villarrica'),
  ('00000000-0000-0000-0000-000000000002', 'Proveedor B');

-- Seed: Insumos Agrícola Villarrica
INSERT INTO insumos (proveedor_id, categoria, nombre, formato_venta, precio_unitario) VALUES
  -- Polietileno (precio por metro)
  ('00000000-0000-0000-0000-000000000001', 'Polietileno', 'Polietileno 3m ancho', 'Metro', 2800),
  -- Polines
  ('00000000-0000-0000-0000-000000000001', 'Polines', 'Polin 3 a 4 cm', 'Unidad', 3500),
  -- Mallas Ursus
  ('00000000-0000-0000-0000-000000000001', 'Malla', 'Malla Ursus 80 cm', 'Rollo 100m', 45000),
  ('00000000-0000-0000-0000-000000000001', 'Malla', 'Malla Ursus 100 cm', 'Rollo 100m', 52000),
  -- Mallas Inchalam
  ('00000000-0000-0000-0000-000000000001', 'Malla', 'Malla Inchalam 120 cm', 'Rollo 25m', 38000),
  ('00000000-0000-0000-0000-000000000001', 'Malla', 'Malla Inchalam 150 cm', 'Rollo 25m', 44000),
  -- Malla Galvanizada
  ('00000000-0000-0000-0000-000000000001', 'Malla', 'Malla Galvanizada 5014 100 cm', 'Rollo 25m', 41000);

-- Seed: Insumos Proveedor B
INSERT INTO insumos (proveedor_id, categoria, nombre, formato_venta, precio_unitario) VALUES
  ('00000000-0000-0000-0000-000000000002', 'Polietileno', 'Polietileno 3m ancho', 'Metro', 2600),
  ('00000000-0000-0000-0000-000000000002', 'Polines', 'Polin 3 a 4 cm', 'Unidad', 3200),
  ('00000000-0000-0000-0000-000000000002', 'Malla', 'Malla Ursus 80 cm', 'Rollo 100m', 43000),
  ('00000000-0000-0000-0000-000000000002', 'Malla', 'Malla Ursus 100 cm', 'Rollo 100m', 49000),
  ('00000000-0000-0000-0000-000000000002', 'Malla', 'Malla Inchalam 120 cm', 'Rollo 25m', 36000),
  ('00000000-0000-0000-0000-000000000002', 'Malla', 'Malla Inchalam 150 cm', 'Rollo 25m', 42000),
  ('00000000-0000-0000-0000-000000000002', 'Malla', 'Malla Galvanizada 5014 100 cm', 'Rollo 25m', 39000);

-- Seed: 29 Beneficiarios (15 Invernadero, 14 Cierre Perimetral)
INSERT INTO beneficiarios (nombre, proyecto) VALUES
  ('Ana González', 'Invernadero'),
  ('Carlos Muñoz', 'Invernadero'),
  ('María Pérez', 'Invernadero'),
  ('Pedro Soto', 'Invernadero'),
  ('Laura Rivas', 'Invernadero'),
  ('Juan Díaz', 'Invernadero'),
  ('Rosa Fuentes', 'Invernadero'),
  ('Diego Morales', 'Invernadero'),
  ('Cecilia Vargas', 'Invernadero'),
  ('Héctor Castro', 'Invernadero'),
  ('Sofía Rojas', 'Invernadero'),
  ('Alberto Torres', 'Invernadero'),
  ('Carmen Silva', 'Invernadero'),
  ('Rodrigo Vega', 'Invernadero'),
  ('Patricia Herrera', 'Invernadero'),
  ('Manuel Flores', 'Cierre Perimetral'),
  ('Elena Campos', 'Cierre Perimetral'),
  ('Francisco Ríos', 'Cierre Perimetral'),
  ('Beatriz Medina', 'Cierre Perimetral'),
  ('Andrés Guerrero', 'Cierre Perimetral'),
  ('Valeria Romero', 'Cierre Perimetral'),
  ('Luis Navarro', 'Cierre Perimetral'),
  ('Isabel Reyes', 'Cierre Perimetral'),
  ('Arturo Mendoza', 'Cierre Perimetral'),
  ('Pilar Aguilar', 'Cierre Perimetral'),
  ('Sergio Carrasco', 'Cierre Perimetral'),
  ('Mónica Espinoza', 'Cierre Perimetral'),
  ('Gonzalo Pinto', 'Cierre Perimetral'),
  ('Lucía Alvarado', 'Cierre Perimetral');
