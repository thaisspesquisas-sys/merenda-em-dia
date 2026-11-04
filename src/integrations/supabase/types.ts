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
      document_access: {
        Row: {
          permission: string
          school_id: string
          user_id: string
        }
        Insert: {
          permission: string
          school_id: string
          user_id: string
        }
        Update: {
          permission?: string
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_access_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_events: {
        Row: {
          action: string
          created_at: string
          document_id: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          document_id: string
          id?: string
          user_id?: string
        }
        Update: {
          action?: string
          created_at?: string
          document_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "school_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_models: {
        Row: {
          archived: boolean
          category: string
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          school_id: string | null
        }
        Insert: {
          archived?: boolean
          category: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          school_id?: string | null
        }
        Update: {
          archived?: boolean
          category?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_models_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      document_revisions: {
        Row: {
          changed_by: string | null
          content: Json
          created_at: string
          document_id: string
          id: number
          name: string
          revision: number
          school_id: string
        }
        Insert: {
          changed_by?: string | null
          content: Json
          created_at?: string
          document_id: string
          id?: never
          name: string
          revision: number
          school_id: string
        }
        Update: {
          changed_by?: string | null
          content?: Json
          created_at?: string
          document_id?: string
          id?: never
          name?: string
          revision?: number
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_revisions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "school_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_revisions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      model_adoptions: {
        Row: {
          model_id: string
          school_id: string
          version_id: string
        }
        Insert: {
          model_id: string
          school_id: string
          version_id: string
        }
        Update: {
          model_id?: string
          school_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_adoptions_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "document_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_adoptions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_adoptions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "model_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      model_versions: {
        Row: {
          change_note: string
          content: Json
          created_at: string
          created_by: string | null
          id: string
          model_id: string
          source_name: string | null
          source_path: string | null
          status: string
          version: number
        }
        Insert: {
          change_note?: string
          content: Json
          created_at?: string
          created_by?: string | null
          id?: string
          model_id: string
          source_name?: string | null
          source_path?: string | null
          status?: string
          version: number
        }
        Update: {
          change_note?: string
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          model_id?: string
          source_name?: string | null
          source_path?: string | null
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "model_versions_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "document_models"
            referencedColumns: ["id"]
          },
        ]
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
      report_header_template: {
        Row: {
          id: boolean
          image_data: string
          source_name: string
          updated_at: string
        }
        Insert: {
          id?: boolean
          image_data: string
          source_name: string
          updated_at?: string
        }
        Update: {
          id?: boolean
          image_data?: string
          source_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      school_documents: {
        Row: {
          archived: boolean
          category: string
          content: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          reference_date: string | null
          responsible: string
          revision: number
          school_id: string
          updated_at: string
          version_id: string | null
        }
        Insert: {
          archived?: boolean
          category?: string
          content: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          reference_date?: string | null
          responsible?: string
          revision?: number
          school_id: string
          updated_at?: string
          version_id?: string | null
        }
        Update: {
          archived?: boolean
          category?: string
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          reference_date?: string | null
          responsible?: string
          revision?: number
          school_id?: string
          updated_at?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_documents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_documents_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "model_versions"
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
      can_edit_documents: { Args: { s: string }; Returns: boolean }
      can_manage_model: { Args: { m: string }; Returns: boolean }
      can_manage_models: { Args: { s: string }; Returns: boolean }
      can_read_documents: { Args: { s: string }; Returns: boolean }
      can_view_school: { Args: { _school: string }; Returns: boolean }
      can_write_school: { Args: { _school: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      model_school: { Args: { m: string }; Returns: string }
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
