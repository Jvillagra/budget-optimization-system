-- Enable uuid extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Proveedores
CREATE TABLE proveedores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Insumos (Catálogo y Empaquetado)
CREATE TABLE insumos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proveedor_id UUID REFERENCES proveedores(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL CHECK (categoria IN ('Malla', 'Polietileno', 'Polines', 'Otro')),
  nombre TEXT NOT NULL,
  formato_venta TEXT NOT NULL,
  precio_unitario NUMERIC NOT NULL CHECK (precio_unitario >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Beneficiarios (Comunidad)
CREATE TABLE beneficiarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  proyecto TEXT NOT NULL CHECK (proyecto IN ('Invernadero', 'Cierre Perimetral')),
  presupuesto_base NUMERIC DEFAULT 189000,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Asignaciones (Carrito dinámico)
-- Nota: precio_unitario se desnormaliza aquí para que el costo_total sea estable
-- incluso si el precio del insumo cambia a futuro.
CREATE TABLE asignaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beneficiario_id UUID REFERENCES beneficiarios(id) ON DELETE CASCADE,
  insumo_id UUID REFERENCES insumos(id) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario_snapshot NUMERIC NOT NULL,
  costo_total NUMERIC GENERATED ALWAYS AS (cantidad * precio_unitario_snapshot) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_asignaciones_beneficiario ON asignaciones(beneficiario_id);
CREATE INDEX idx_asignaciones_insumo ON asignaciones(insumo_id);
CREATE INDEX idx_insumos_proveedor ON insumos(proveedor_id);
