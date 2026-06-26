export type Proyecto = 'Invernadero' | 'Cierre Perimetral'
export type Categoria = 'Malla' | 'Polietileno' | 'Polines' | 'Otro'

export interface Proveedor {
  id: string
  nombre: string
  created_at?: string | null
}

export interface Insumo {
  id: string
  proveedor_id: string
  categoria: Categoria
  nombre: string
  formato_venta: string
  precio_unitario: number
  created_at?: string | null
  proveedores?: Proveedor | null
}

export interface Beneficiario {
  id: string
  nombre: string
  proyecto: Proyecto
  presupuesto_base: number
  created_at?: string | null
}

export interface Asignacion {
  id: string
  beneficiario_id: string
  insumo_id: string
  cantidad: number
  precio_unitario_snapshot: number
  costo_total: number
  created_at?: string | null
  insumos?: Insumo | null
  beneficiarios?: Beneficiario | null
}

// Resumen de presupuesto para un beneficiario
export interface ResumenPresupuesto {
  beneficiario: Beneficiario
  asignaciones: Asignacion[]
  total_gastado: number
  saldo_disponible: number
  aporte_bolsillo: number
  tiene_aporte_bolsillo: boolean
}

// Para el simulador comparativo
export interface EscenarioProveedor {
  proveedor: Proveedor
  insumos: Insumo[]
  total_comunitario: number // suma de todos los gastos de los 29 beneficiarios
  volumen_total_materiales: number // unidades totales obtenidas
  aporte_bolsillo_total: number
  es_mejor_escenario: boolean
}

// Database type para Supabase client (formato requerido por @supabase/supabase-js v2)
export type Database = {
  public: {
    Tables: {
      proveedores: {
        Row: { id: string; nombre: string; created_at: string | null }
        Insert: { id?: string; nombre: string; created_at?: string | null }
        Update: { id?: string; nombre?: string; created_at?: string | null }
        Relationships: []
      }
      insumos: {
        Row: { id: string; proveedor_id: string; categoria: string; nombre: string; formato_venta: string; precio_unitario: number; created_at: string | null }
        Insert: { id?: string; proveedor_id: string; categoria: string; nombre: string; formato_venta: string; precio_unitario: number; created_at?: string | null }
        Update: { id?: string; proveedor_id?: string; categoria?: string; nombre?: string; formato_venta?: string; precio_unitario?: number; created_at?: string | null }
        Relationships: [{ foreignKeyName: 'insumos_proveedor_id_fkey'; columns: ['proveedor_id']; referencedRelation: 'proveedores'; referencedColumns: ['id'] }]
      }
      beneficiarios: {
        Row: { id: string; nombre: string; proyecto: string; presupuesto_base: number; created_at: string | null }
        Insert: { id?: string; nombre: string; proyecto: string; presupuesto_base?: number; created_at?: string | null }
        Update: { id?: string; nombre?: string; proyecto?: string; presupuesto_base?: number; created_at?: string | null }
        Relationships: []
      }
      asignaciones: {
        Row: { id: string; beneficiario_id: string; insumo_id: string; cantidad: number; precio_unitario_snapshot: number; costo_total: number; created_at: string | null }
        Insert: { id?: string; beneficiario_id: string; insumo_id: string; cantidad: number; precio_unitario_snapshot: number; created_at?: string | null }
        Update: { id?: string; beneficiario_id?: string; insumo_id?: string; cantidad?: number; precio_unitario_snapshot?: number; created_at?: string | null }
        Relationships: [
          { foreignKeyName: 'asignaciones_beneficiario_id_fkey'; columns: ['beneficiario_id']; referencedRelation: 'beneficiarios'; referencedColumns: ['id'] },
          { foreignKeyName: 'asignaciones_insumo_id_fkey'; columns: ['insumo_id']; referencedRelation: 'insumos'; referencedColumns: ['id'] }
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
