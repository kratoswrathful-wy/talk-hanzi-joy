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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      cases: {
        Row: {
          billing_unit: string
          body_content: Json | null
          case_reference_materials: Json | null
          category: string
          client: string
          client_guidelines: Json
          client_po_number: string
          client_question_form: boolean
          client_receipt: string
          client_receipt_files: Json | null
          collab_count: number
          collab_rows: Json
          comments: Json | null
          common_info: Json
          common_links: Json | null
          contact: string
          created_at: string
          created_by: string | null
          custom_guidelines_url: Json
          delivery_method: string
          delivery_method_files: Json | null
          env: string
          execution_tool: string
          fee_entry: string
          id: string
          inquiry_note: string
          internal_comments: Json | null
          internal_note_form: boolean
          internal_records: Json
          internal_review_final: Json
          keyword: string
          login_account: string
          login_password: string
          multi_collab: boolean
          online_tool_filename: string
          online_tool_project: string
          other_login_info: string
          process_note: string
          question_form: string
          question_tools: Json | null
          reference_materials: Json
          review_deadline: string | null
          reviewer: string
          series_reference_materials: Json | null
          source_files: Json
          status: string
          task_status: string
          title: string
          tool_field_values: Json
          tools: Json
          track_changes: Json
          translation_deadline: string | null
          translator: Json
          translator_final: Json
          unit_count: number
          updated_at: string
          work_groups: Json
          work_type: Json
          working_files: Json
        }
        Insert: {
          billing_unit?: string
          body_content?: Json | null
          case_reference_materials?: Json | null
          category?: string
          client?: string
          client_guidelines?: Json
          client_po_number?: string
          client_question_form?: boolean
          client_receipt?: string
          client_receipt_files?: Json | null
          collab_count?: number
          collab_rows?: Json
          comments?: Json | null
          common_info?: Json
          common_links?: Json | null
          contact?: string
          created_at?: string
          created_by?: string | null
          custom_guidelines_url?: Json
          delivery_method?: string
          delivery_method_files?: Json | null
          env?: string
          execution_tool?: string
          fee_entry?: string
          id?: string
          inquiry_note?: string
          internal_comments?: Json | null
          internal_note_form?: boolean
          internal_records?: Json
          internal_review_final?: Json
          keyword?: string
          login_account?: string
          login_password?: string
          multi_collab?: boolean
          online_tool_filename?: string
          online_tool_project?: string
          other_login_info?: string
          process_note?: string
          question_form?: string
          question_tools?: Json | null
          reference_materials?: Json
          review_deadline?: string | null
          reviewer?: string
          series_reference_materials?: Json | null
          source_files?: Json
          status?: string
          task_status?: string
          title?: string
          tool_field_values?: Json
          tools?: Json
          track_changes?: Json
          translation_deadline?: string | null
          translator?: Json
          translator_final?: Json
          unit_count?: number
          updated_at?: string
          work_groups?: Json
          work_type?: Json
          working_files?: Json
        }
        Update: {
          billing_unit?: string
          body_content?: Json | null
          case_reference_materials?: Json | null
          category?: string
          client?: string
          client_guidelines?: Json
          client_po_number?: string
          client_question_form?: boolean
          client_receipt?: string
          client_receipt_files?: Json | null
          collab_count?: number
          collab_rows?: Json
          comments?: Json | null
          common_info?: Json
          common_links?: Json | null
          contact?: string
          created_at?: string
          created_by?: string | null
          custom_guidelines_url?: Json
          delivery_method?: string
          delivery_method_files?: Json | null
          env?: string
          execution_tool?: string
          fee_entry?: string
          id?: string
          inquiry_note?: string
          internal_comments?: Json | null
          internal_note_form?: boolean
          internal_records?: Json
          internal_review_final?: Json
          keyword?: string
          login_account?: string
          login_password?: string
          multi_collab?: boolean
          online_tool_filename?: string
          online_tool_project?: string
          other_login_info?: string
          process_note?: string
          question_form?: string
          question_tools?: Json | null
          reference_materials?: Json
          review_deadline?: string | null
          reviewer?: string
          series_reference_materials?: Json | null
          source_files?: Json
          status?: string
          task_status?: string
          title?: string
          tool_field_values?: Json
          tools?: Json
          track_changes?: Json
          translation_deadline?: string | null
          translator?: Json
          translator_final?: Json
          unit_count?: number
          updated_at?: string
          work_groups?: Json
          work_type?: Json
          working_files?: Json
        }
        Relationships: []
      }
      client_invoice_fees: {
        Row: {
          client_invoice_id: string
          created_at: string
          env: string
          fee_id: string
          id: string
        }
        Insert: {
          client_invoice_id: string
          created_at?: string
          env?: string
          fee_id: string
          id?: string
        }
        Update: {
          client_invoice_id?: string
          created_at?: string
          env?: string
          fee_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_invoice_fees_client_invoice_id_fkey"
            columns: ["client_invoice_id"]
            isOneToOne: false
            referencedRelation: "client_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invoice_fees_fee_id_fkey"
            columns: ["fee_id"]
            isOneToOne: false
            referencedRelation: "fees"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invoices: {
        Row: {
          client: string
          comments: Json
          created_at: string
          created_by: string | null
          edit_logs: Json
          env: string
          id: string
          note: string
          payments: Json
          status: string
          title: string
          transfer_date: string | null
          updated_at: string
        }
        Insert: {
          client?: string
          comments?: Json
          created_at?: string
          created_by?: string | null
          edit_logs?: Json
          env?: string
          id?: string
          note?: string
          payments?: Json
          status?: string
          title?: string
          transfer_date?: string | null
          updated_at?: string
        }
        Update: {
          client?: string
          comments?: Json
          created_at?: string
          created_by?: string | null
          edit_logs?: Json
          env?: string
          id?: string
          note?: string
          payments?: Json
          status?: string
          title?: string
          transfer_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fees: {
        Row: {
          assignee: string
          client_info: Json | null
          created_at: string
          created_by: string | null
          edit_logs: Json
          env: string
          finalized_at: string | null
          finalized_by: string | null
          id: string
          internal_note: string
          internal_note_url: string
          notes: Json
          status: string
          task_items: Json
          title: string
          updated_at: string
        }
        Insert: {
          assignee?: string
          client_info?: Json | null
          created_at?: string
          created_by?: string | null
          edit_logs?: Json
          env?: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          internal_note?: string
          internal_note_url?: string
          notes?: Json
          status?: string
          task_items?: Json
          title?: string
          updated_at?: string
        }
        Update: {
          assignee?: string
          client_info?: Json | null
          created_at?: string
          created_by?: string | null
          edit_logs?: Json
          env?: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          internal_note?: string
          internal_note_url?: string
          notes?: Json
          status?: string
          task_items?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      invoice_fees: {
        Row: {
          created_at: string
          env: string
          fee_id: string
          id: string
          invoice_id: string
        }
        Insert: {
          created_at?: string
          env?: string
          fee_id: string
          id?: string
          invoice_id: string
        }
        Update: {
          created_at?: string
          env?: string
          fee_id?: string
          id?: string
          invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_fees_fee_id_fkey"
            columns: ["fee_id"]
            isOneToOne: false
            referencedRelation: "fees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_fees_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          comments: Json
          created_at: string
          created_by: string | null
          edit_logs: Json
          env: string
          id: string
          note: string
          payments: Json
          status: string
          title: string
          transfer_date: string | null
          translator: string
          updated_at: string
        }
        Insert: {
          comments?: Json
          created_at?: string
          created_by?: string | null
          edit_logs?: Json
          env?: string
          id?: string
          note?: string
          payments?: Json
          status?: string
          title?: string
          transfer_date?: string | null
          translator?: string
          updated_at?: string
        }
        Update: {
          comments?: Json
          created_at?: string
          created_by?: string | null
          edit_logs?: Json
          env?: string
          id?: string
          note?: string
          payments?: Json
          status?: string
          title?: string
          transfer_date?: string | null
          translator?: string
          updated_at?: string
        }
        Relationships: []
      }
      member_translator_settings: {
        Row: {
          email: string
          frozen: boolean
          id: string
          no_fee: boolean
          note: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          email: string
          frozen?: boolean
          id?: string
          no_fee?: boolean
          note?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          email?: string
          frozen?: boolean
          id?: string
          no_fee?: boolean
          note?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      permission_settings: {
        Row: {
          config: Json
          env: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          env?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          env?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          mobile: string | null
          phone: string | null
          status_message: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          mobile?: string | null
          phone?: string | null
          status_message?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          mobile?: string | null
          phone?: string | null
          status_message?: string | null
          timezone?: string | null
          updated_at?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "member" | "pm" | "executive"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["member", "pm", "executive"],
    },
  },
} as const
