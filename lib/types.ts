export type Segmento = 'Invernadero' | 'Cierre Perimetral'
export type SegmentoCatalogo = 'Invernadero' | 'Cierre Perimetral' | 'Ambos'

export interface Proveedor {
  id: string
  nombre: string
  es_activo: boolean
}

export interface CatalogoInsumo {
  id: string
  segmento: SegmentoCatalogo
  nombre: string
  formato_venta: string
}

export interface PrecioProveedor {
  id: string
  proveedor_id: string
  insumo_id: string
  precio_unitario: number | null
}

export interface Beneficiario {
  id: string
  nombre: string
  segmento: Segmento
  presupuesto_base: number
}

export interface AyudaMemoria {
  id: string
  beneficiario_id: string
  insumo_id: string
  detalle_original: string | null
  catalogo_insumos?: CatalogoInsumo | null
}

export interface Asignacion {
  id: string
  beneficiario_id: string
  insumo_id: string
  cantidad: number
  catalogo_insumos?: CatalogoInsumo | null
}

export interface ResultadoSimulacion {
  beneficiario: Beneficiario
  error: string | null
  insumo_base_id: string | null
  insumo_base_nombre: string | null
  insumo_base_cantidad: number
  polines: number
  volumen_total: number
  gasto_total: number
  aporte_bolsillo: number
}

export interface KPISimulacion {
  proveedor: Proveedor
  resultados: ResultadoSimulacion[]
  volumen_total_comunidad: number
  aporte_bolsillo_total: number
  socios_con_error: number
  es_ganador: boolean
}

export type Database = {
  public: {
    Tables: {
      proveedores: {
        Row: { id: string; nombre: string; es_activo: boolean }
        Insert: { id?: string; nombre: string; es_activo?: boolean }
        Update: { id?: string; nombre?: string; es_activo?: boolean }
        Relationships: []
      }
      catalogo_insumos: {
        Row: { id: string; segmento: string; nombre: string; formato_venta: string }
        Insert: { id?: string; segmento: string; nombre: string; formato_venta: string }
        Update: { id?: string; segmento?: string; nombre?: string; formato_venta?: string }
        Relationships: []
      }
      precios_proveedor: {
        Row: { id: string; proveedor_id: string; insumo_id: string; precio_unitario: number | null }
        Insert: { id?: string; proveedor_id: string; insumo_id: string; precio_unitario?: number | null }
        Update: { id?: string; proveedor_id?: string; insumo_id?: string; precio_unitario?: number | null }
        Relationships: []
      }
      beneficiarios: {
        Row: { id: string; nombre: string; segmento: string; presupuesto_base: number }
        Insert: { id?: string; nombre: string; segmento: string; presupuesto_base?: number }
        Update: { id?: string; nombre?: string; segmento?: string; presupuesto_base?: number }
        Relationships: []
      }
      ayuda_memoria: {
        Row: { id: string; beneficiario_id: string; insumo_id: string; detalle_original: string | null }
        Insert: { id?: string; beneficiario_id: string; insumo_id: string; detalle_original?: string | null }
        Update: { id?: string; beneficiario_id?: string; insumo_id?: string; detalle_original?: string | null }
        Relationships: []
      }
      asignaciones: {
        Row: { id: string; beneficiario_id: string; insumo_id: string; cantidad: number }
        Insert: { id?: string; beneficiario_id: string; insumo_id: string; cantidad: number }
        Update: { id?: string; beneficiario_id?: string; insumo_id?: string; cantidad?: number }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
