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
          change_log_enabled_at: string | null
          client: string
          client_case_link: Json | null
          client_guidelines: Json | null
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
          custom_guidelines_url: Json | null
          decline_records: Json
          delivery_method: string
          delivery_method_files: Json | null
          dispatch_route: string | null
          edit_logs: Json
          env: string
          execution_tool: string
          fee_entry: string
          icon_url: string | null
          id: string
          inquiry_note: string
          inquiry_slack_records: Json
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
          track_changes: Json | null
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
          change_log_enabled_at?: string | null
          client?: string
          client_case_link?: Json | null
          client_guidelines?: Json | null
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
          custom_guidelines_url?: Json | null
          decline_records?: Json
          delivery_method?: string
          delivery_method_files?: Json | null
          dispatch_route?: string | null
          edit_logs?: Json
          env?: string
          execution_tool?: string
          fee_entry?: string
          icon_url?: string | null
          id?: string
          inquiry_note?: string
          inquiry_slack_records?: Json
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
          track_changes?: Json | null
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
          change_log_enabled_at?: string | null
          client?: string
          client_case_link?: Json | null
          client_guidelines?: Json | null
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
          custom_guidelines_url?: Json | null
          decline_records?: Json
          delivery_method?: string
          delivery_method_files?: Json | null
          dispatch_route?: string | null
          edit_logs?: Json
          env?: string
          execution_tool?: string
          fee_entry?: string
          icon_url?: string | null
          id?: string
          inquiry_note?: string
          inquiry_slack_records?: Json
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
          track_changes?: Json | null
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
      cat_assignments: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          deadline: string | null
          env: string
          id: string
          notes: string | null
          source_file_name: string
          source_file_storage_path: string
          source_lang: string
          status: string
          target_lang: string
          translator_user_id: string
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          env?: string
          id?: string
          notes?: string | null
          source_file_name: string
          source_file_storage_path: string
          source_lang?: string
          status?: string
          target_lang?: string
          translator_user_id: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          env?: string
          id?: string
          notes?: string | null
          source_file_name?: string
          source_file_storage_path?: string
          source_lang?: string
          status?: string
          target_lang?: string
          translator_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_assignments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_assignments_translator_user_id_fkey"
            columns: ["translator_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_file_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          assignee_user_id: string
          file_id: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          assignee_user_id: string
          file_id: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          assignee_user_id?: string
          file_id?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_file_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_file_assignments_assignee_user_id_fkey"
            columns: ["assignee_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_file_assignments_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cat_files"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_files: {
        Row: {
          applicable_special_instruction_ids: Json
          created_at: string
          id: string
          last_modified: string
          name: string
          original_file_base64: string | null
          original_source_lang: string
          original_target_lang: string
          project_id: string
          source_lang: string
          target_lang: string
          workspace_note_draft: string
        }
        Insert: {
          applicable_special_instruction_ids?: Json
          created_at?: string
          id?: string
          last_modified?: string
          name: string
          original_file_base64?: string | null
          original_source_lang?: string
          original_target_lang?: string
          project_id: string
          source_lang?: string
          target_lang?: string
          workspace_note_draft?: string
        }
        Update: {
          applicable_special_instruction_ids?: Json
          created_at?: string
          id?: string
          last_modified?: string
          name?: string
          original_file_base64?: string | null
          original_source_lang?: string
          original_target_lang?: string
          project_id?: string
          source_lang?: string
          target_lang?: string
          workspace_note_draft?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "cat_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_guidelines: {
        Row: {
          content: string
          created_at: string
          created_by_id: string | null
          created_by_name: string
          id: string
          project_id: string
          sort_order: number
          type: string
          updated_at: string
          versions: Json
        }
        Insert: {
          content?: string
          created_at?: string
          created_by_id?: string | null
          created_by_name?: string
          id?: string
          project_id: string
          sort_order?: number
          type?: string
          updated_at?: string
          versions?: Json
        }
        Update: {
          content?: string
          created_at?: string
          created_by_id?: string | null
          created_by_name?: string
          id?: string
          project_id?: string
          sort_order?: number
          type?: string
          updated_at?: string
          versions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cat_guidelines_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_guidelines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "cat_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_module_logs: {
        Row: {
          at: string
          id: number
          module: string
          payload: Json | null
        }
        Insert: {
          at?: string
          id?: number
          module: string
          payload?: Json | null
        }
        Update: {
          at?: string
          id?: number
          module?: string
          payload?: Json | null
        }
        Relationships: []
      }
      cat_note_replies: {
        Row: {
          content: string
          created_at: string
          created_by_id: string | null
          created_by_name: string
          depth: number
          guideline_id: string
          id: string
          is_resolved: boolean
          parent_reply_id: string | null
          resolved_at: string | null
          resolved_by_name: string | null
        }
        Insert: {
          content?: string
          created_at?: string
          created_by_id?: string | null
          created_by_name?: string
          depth?: number
          guideline_id: string
          id?: string
          is_resolved?: boolean
          parent_reply_id?: string | null
          resolved_at?: string | null
          resolved_by_name?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          created_by_id?: string | null
          created_by_name?: string
          depth?: number
          guideline_id?: string
          id?: string
          is_resolved?: boolean
          parent_reply_id?: string | null
          resolved_at?: string | null
          resolved_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cat_note_replies_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_note_replies_guideline_id_fkey"
            columns: ["guideline_id"]
            isOneToOne: false
            referencedRelation: "cat_guidelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_note_replies_parent_reply_id_fkey"
            columns: ["parent_reply_id"]
            isOneToOne: false
            referencedRelation: "cat_note_replies"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_private_notes: {
        Row: {
          content: string
          created_at: string
          created_by_name: string
          id: string
          item_type: string
          project_id: string
          todo_done: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by_name?: string
          id?: string
          item_type?: string
          project_id: string
          todo_done?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by_name?: string
          id?: string
          item_type?: string
          project_id?: string
          todo_done?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_private_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "cat_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_private_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_projects: {
        Row: {
          assignment_id: string | null
          change_log: Json
          created_at: string
          env: string
          id: string
          last_modified: string
          name: string
          owner_user_id: string | null
          read_tbs: string[]
          read_tms: string[]
          source_langs: string[]
          target_langs: string[]
          write_tb: string | null
          write_tms: string[]
        }
        Insert: {
          assignment_id?: string | null
          change_log?: Json
          created_at?: string
          env?: string
          id?: string
          last_modified?: string
          name?: string
          owner_user_id?: string | null
          read_tbs?: string[]
          read_tms?: string[]
          source_langs?: string[]
          target_langs?: string[]
          write_tb?: string | null
          write_tms?: string[]
        }
        Update: {
          assignment_id?: string | null
          change_log?: Json
          created_at?: string
          env?: string
          id?: string
          last_modified?: string
          name?: string
          owner_user_id?: string | null
          read_tbs?: string[]
          read_tms?: string[]
          source_langs?: string[]
          target_langs?: string[]
          write_tb?: string | null
          write_tms?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "cat_projects_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "cat_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_projects_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_segments: {
        Row: {
          col_src: string | null
          col_tgt: string | null
          created_at: string
          editor_note: string
          extra_value: string | null
          file_id: string
          id: string
          id_value: string | null
          is_locked: boolean
          is_locked_system: boolean
          is_locked_user: boolean
          last_modified: string
          match_value: number | null
          row_idx: number
          segment_revision: number
          sheet_name: string
          source_text: string
          status: string
          target_text: string
        }
        Insert: {
          col_src?: string | null
          col_tgt?: string | null
          created_at?: string
          editor_note?: string
          extra_value?: string | null
          file_id: string
          id?: string
          id_value?: string | null
          is_locked?: boolean
          is_locked_system?: boolean
          is_locked_user?: boolean
          last_modified?: string
          match_value?: number | null
          row_idx?: number
          segment_revision?: number
          sheet_name?: string
          source_text?: string
          status?: string
          target_text?: string
        }
        Update: {
          col_src?: string | null
          col_tgt?: string | null
          created_at?: string
          editor_note?: string
          extra_value?: string | null
          file_id?: string
          id?: string
          id_value?: string | null
          is_locked?: boolean
          is_locked_system?: boolean
          is_locked_user?: boolean
          last_modified?: string
          match_value?: number | null
          row_idx?: number
          segment_revision?: number
          sheet_name?: string
          source_text?: string
          status?: string
          target_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_segments_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cat_files"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_tbs: {
        Row: {
          change_log: Json
          created_at: string
          env: string
          id: string
          last_modified: string
          name: string
          next_term_number: number
          owner_user_id: string | null
          source_langs: string[]
          target_langs: string[]
          terms: Json
        }
        Insert: {
          change_log?: Json
          created_at?: string
          env?: string
          id?: string
          last_modified?: string
          name?: string
          next_term_number?: number
          owner_user_id?: string | null
          source_langs?: string[]
          target_langs?: string[]
          terms?: Json
        }
        Update: {
          change_log?: Json
          created_at?: string
          env?: string
          id?: string
          last_modified?: string
          name?: string
          next_term_number?: number
          owner_user_id?: string | null
          source_langs?: string[]
          target_langs?: string[]
          terms?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cat_tbs_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_tm_segments: {
        Row: {
          change_log: Json
          created_at: string
          created_by: string
          id: string
          key: string
          last_modified: string
          next_segment: string
          prev_segment: string
          source_lang: string
          source_text: string
          target_lang: string
          target_text: string
          tm_id: string
          written_file: string
          written_project: string
        }
        Insert: {
          change_log?: Json
          created_at?: string
          created_by?: string
          id?: string
          key?: string
          last_modified?: string
          next_segment?: string
          prev_segment?: string
          source_lang?: string
          source_text?: string
          target_lang?: string
          target_text?: string
          tm_id: string
          written_file?: string
          written_project?: string
        }
        Update: {
          change_log?: Json
          created_at?: string
          created_by?: string
          id?: string
          key?: string
          last_modified?: string
          next_segment?: string
          prev_segment?: string
          source_lang?: string
          source_text?: string
          target_lang?: string
          target_text?: string
          tm_id?: string
          written_file?: string
          written_project?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_tm_segments_tm_id_fkey"
            columns: ["tm_id"]
            isOneToOne: false
            referencedRelation: "cat_tms"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_tms: {
        Row: {
          change_log: Json
          created_at: string
          env: string
          id: string
          last_modified: string
          name: string
          owner_user_id: string | null
          source_langs: string[]
          target_langs: string[]
        }
        Insert: {
          change_log?: Json
          created_at?: string
          env?: string
          id?: string
          last_modified?: string
          name?: string
          owner_user_id?: string | null
          source_langs?: string[]
          target_langs?: string[]
        }
        Update: {
          change_log?: Json
          created_at?: string
          env?: string
          id?: string
          last_modified?: string
          name?: string
          owner_user_id?: string | null
          source_langs?: string[]
          target_langs?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "cat_tms_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_workspace_notes: {
        Row: {
          content: string
          created_by: string
          display_title: string
          file_id: string | null
          id: string
          project_id: string
          saved_at: string
        }
        Insert: {
          content?: string
          created_by?: string
          display_title?: string
          file_id?: string | null
          id?: string
          project_id: string
          saved_at?: string
        }
        Update: {
          content?: string
          created_by?: string
          display_title?: string
          file_id?: string | null
          id?: string
          project_id?: string
          saved_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_workspace_notes_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cat_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_workspace_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "cat_projects"
            referencedColumns: ["id"]
          },
        ]
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
          actual_collection_date: string | null
          adjustment_lines: Json
          billing_channel: string
          client: string
          comments: Json
          created_at: string
          created_by: string | null
          edit_log_started_at: string | null
          edit_logs: Json
          env: string
          expected_collection_date: string | null
          id: string
          invoice_number: string
          is_record_only: boolean
          note: string
          payments: Json
          record_amount: number
          record_currency: string | null
          status: string
          title: string
          transfer_date: string | null
          updated_at: string
        }
        Insert: {
          actual_collection_date?: string | null
          adjustment_lines?: Json
          billing_channel?: string
          client?: string
          comments?: Json
          created_at?: string
          created_by?: string | null
          edit_log_started_at?: string | null
          edit_logs?: Json
          env?: string
          expected_collection_date?: string | null
          id?: string
          invoice_number?: string
          is_record_only?: boolean
          note?: string
          payments?: Json
          record_amount?: number
          record_currency?: string | null
          status?: string
          title?: string
          transfer_date?: string | null
          updated_at?: string
        }
        Update: {
          actual_collection_date?: string | null
          adjustment_lines?: Json
          billing_channel?: string
          client?: string
          comments?: Json
          created_at?: string
          created_by?: string | null
          edit_log_started_at?: string | null
          edit_logs?: Json
          env?: string
          expected_collection_date?: string | null
          id?: string
          invoice_number?: string
          is_record_only?: boolean
          note?: string
          payments?: Json
          record_amount?: number
          record_currency?: string | null
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
          edit_log_phases: Json
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
          edit_log_phases?: Json
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
          edit_log_phases?: Json
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
      icon_library: {
        Row: {
          created_at: string
          created_by: string | null
          env: string
          id: string
          name: string
          storage_path: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          env?: string
          id?: string
          name?: string
          storage_path?: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          env?: string
          id?: string
          name?: string
          storage_path?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      internal_notes: {
        Row: {
          comments: Json
          created_at: string
          created_by: string | null
          creator: string
          edit_log_started_at: string | null
          edit_logs: Json
          env: string
          file_name: string
          id: string
          id_row_count: string
          internal_assignee: Json
          invalidated: boolean
          invalidated_at: string | null
          invalidated_by: string | null
          invalidation_reason: string | null
          note_type: string
          question_or_note: string
          question_or_note_blocks: Json
          reference_files: Json
          related_case: string
          source_text: string
          status: string
          title: string
          translated_text: string
          updated_at: string
        }
        Insert: {
          comments?: Json
          created_at?: string
          created_by?: string | null
          creator?: string
          edit_log_started_at?: string | null
          edit_logs?: Json
          env?: string
          file_name?: string
          id?: string
          id_row_count?: string
          internal_assignee?: Json
          invalidated?: boolean
          invalidated_at?: string | null
          invalidated_by?: string | null
          invalidation_reason?: string | null
          note_type?: string
          question_or_note?: string
          question_or_note_blocks?: Json
          reference_files?: Json
          related_case?: string
          source_text?: string
          status?: string
          title?: string
          translated_text?: string
          updated_at?: string
        }
        Update: {
          comments?: Json
          created_at?: string
          created_by?: string | null
          creator?: string
          edit_log_started_at?: string | null
          edit_logs?: Json
          env?: string
          file_name?: string
          id?: string
          id_row_count?: string
          internal_assignee?: Json
          invalidated?: boolean
          invalidated_at?: string | null
          invalidated_by?: string | null
          invalidation_reason?: string | null
          note_type?: string
          question_or_note?: string
          question_or_note_blocks?: Json
          reference_files?: Json
          related_case?: string
          source_text?: string
          status?: string
          title?: string
          translated_text?: string
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
          edit_log_started_at: string | null
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
          edit_log_started_at?: string | null
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
          edit_log_started_at?: string | null
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
      ops_incidents: {
        Row: {
          affected_modules: string[]
          created_at: string
          created_by: string | null
          id: string
          occurred_at: string
          reference_links: Json
          resolution: string
          root_cause: string
          severity: string
          symptoms: string
          title: string
          updated_at: string
        }
        Insert: {
          affected_modules?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          occurred_at?: string
          reference_links?: Json
          resolution?: string
          root_cause?: string
          severity?: string
          symptoms?: string
          title: string
          updated_at?: string
        }
        Update: {
          affected_modules?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          occurred_at?: string
          reference_links?: Json
          resolution?: string
          root_cause?: string
          severity?: string
          symptoms?: string
          title?: string
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
          receive_translator_case_reply_slack_dms: boolean
          slack_message_defaults: Json
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
          receive_translator_case_reply_slack_dms?: boolean
          slack_message_defaults?: Json
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
          receive_translator_case_reply_slack_dms?: boolean
          slack_message_defaults?: Json
          status_message?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      slack_oauth_states: {
        Row: {
          expires_at: string
          id: string
          state: string
          user_id: string
        }
        Insert: {
          expires_at: string
          id?: string
          state: string
          user_id: string
        }
        Update: {
          expires_at?: string
          id?: string
          state?: string
          user_id?: string
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
      user_slack_credentials: {
        Row: {
          access_token: string
          refresh_token: string | null
          slack_team_id: string | null
          slack_user_id: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          refresh_token?: string | null
          slack_team_id?: string | null
          slack_user_id: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          refresh_token?: string | null
          slack_team_id?: string | null
          slack_user_id?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_slack_meta: {
        Row: {
          slack_team_id: string | null
          slack_user_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          slack_team_id?: string | null
          slack_user_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          slack_team_id?: string | null
          slack_user_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      /** CAT 句段譯文寫庫樂觀鎖（migration: apply_cat_segment_target_update） */
      apply_cat_segment_target_update: {
        Args: {
          p_segment_id: string
          p_new_target_text: string
          p_expected_segment_revision: number
          p_extras?: Json
        }
        Returns: Database["public"]["Tables"]["cat_segments"]["Row"][]
      }
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
