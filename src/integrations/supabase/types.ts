export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          acao: string
          created_at: string
          dados: Json | null
          id: number
          registro_id: string | null
          tabela: string
          user_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dados?: Json | null
          id?: number
          registro_id?: string | null
          tabela: string
          user_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dados?: Json | null
          id?: number
          registro_id?: string | null
          tabela?: string
          user_id?: string | null
        }
        Relationships: []
      }
      monthly_closings: {
        Row: {
          ano: number
          closed_at: string
          closed_by: string | null
          id: string
          mes: number
          observacoes: string | null
          responsavel: string | null
          school_id: string
          snapshot: Json
        }
        Insert: {
          ano: number
          closed_at?: string
          closed_by?: string | null
          id?: string
          mes: number
          observacoes?: string | null
          responsavel?: string | null
          school_id: string
          snapshot?: Json
        }
        Update: {
          ano?: number
          closed_at?: string
          closed_by?: string | null
          id?: string
          mes?: number
          observacoes?: string | null
          responsavel?: string | null
          school_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "monthly_closings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      movements: {
        Row: {
          created_at: string
          created_by: string | null
          data: string
          destino: string | null
          fornecedor: string | null
          id: string
          nota_fiscal: string | null
          observacoes: string | null
          origem: Database["public"]["Enums"]["origem_tipo"]
          product_id: string
          quantidade: number
          responsavel: string | null
          school_id: string
          tipo: Database["public"]["Enums"]["mov_tipo"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data: string
          destino?: string | null
          fornecedor?: string | null
          id?: string
          nota_fiscal?: string | null
          observacoes?: string | null
          origem: Database["public"]["Enums"]["origem_tipo"]
          product_id: string
          quantidade: number
          responsavel?: string | null
          school_id: string
          tipo: Database["public"]["Enums"]["mov_tipo"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          destino?: string | null
          fornecedor?: string | null
          id?: string
          nota_fiscal?: string | null
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["origem_tipo"]
          product_id?: string
          quantidade?: number
          responsavel?: string | null
          school_id?: string
          tipo?: Database["public"]["Enums"]["mov_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          ativo: boolean
          categoria: string
          created_at: string
          estoque_minimo: number
          id: string
          nome: string
          origem_padrao: Database["public"]["Enums"]["origem_tipo"]
          unidade: Database["public"]["Enums"]["unidade_tipo"]
        }
        Insert: {
          ativo?: boolean
          categoria: string
          created_at?: string
          estoque_minimo?: number
          id?: string
          nome: string
          origem_padrao?: Database["public"]["Enums"]["origem_tipo"]
          unidade: Database["public"]["Enums"]["unidade_tipo"]
        }
        Update: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          estoque_minimo?: number
          id?: string
          nome?: string
          origem_padrao?: Database["public"]["Enums"]["origem_tipo"]
          unidade?: Database["public"]["Enums"]["unidade_tipo"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string | null
          school_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nome?: string | null
          school_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          ativo: boolean
          created_at: string
          diretor: string | null
          endereco: string | null
          id: string
          nome: string
          responsavel: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          diretor?: string | null
          endereco?: string | null
          id?: string
          nome: string
          responsavel?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          diretor?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          responsavel?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_school: { Args: { _school: string }; Returns: boolean }
      can_write_school: { Args: { _school: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      registrar_saida: {
        Args: {
          _data: string
          _destino: string
          _observacoes: string
          _origem: string
          _product: string
          _quantidade: number
          _responsavel: string
          _school: string
        }
        Returns: undefined
      }
      user_school: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "estoquista" | "diretor"
      mov_tipo: "entrada" | "saida"
      origem_tipo: "mercado" | "agricultura"
      unidade_tipo: "kg" | "L" | "un"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "estoquista", "diretor"],
      mov_tipo: ["entrada", "saida"],
      origem_tipo: ["mercado", "agricultura"],
      unidade_tipo: ["kg", "L", "un"],
    },
  },
} as const
