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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_model_providers: {
        Row: {
          created_at: string
          display_name: string
          enabled: boolean
          id: string
          provider_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          enabled?: boolean
          id?: string
          provider_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          enabled?: boolean
          id?: string
          provider_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_model_sync_runs: {
        Row: {
          discovered_count: number
          error_message: string | null
          finished_at: string | null
          id: string
          missing_count: number
          new_count: number
          provider_key: string
          raw: Json
          started_at: string
          status: string
        }
        Insert: {
          discovered_count?: number
          error_message?: string | null
          finished_at?: string | null
          id?: string
          missing_count?: number
          new_count?: number
          provider_key: string
          raw?: Json
          started_at?: string
          status: string
        }
        Update: {
          discovered_count?: number
          error_message?: string | null
          finished_at?: string | null
          id?: string
          missing_count?: number
          new_count?: number
          provider_key?: string
          raw?: Json
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      ai_provider_models: {
        Row: {
          api_object: string | null
          first_seen_at: string
          id: string
          is_currently_available: boolean
          last_seen_at: string
          model_id: string
          owned_by: string | null
          provider_created_at: string | null
          provider_key: string
          raw: Json
        }
        Insert: {
          api_object?: string | null
          first_seen_at?: string
          id?: string
          is_currently_available?: boolean
          last_seen_at?: string
          model_id: string
          owned_by?: string | null
          provider_created_at?: string | null
          provider_key: string
          raw?: Json
        }
        Update: {
          api_object?: string | null
          first_seen_at?: string
          id?: string
          is_currently_available?: boolean
          last_seen_at?: string
          model_id?: string
          owned_by?: string | null
          provider_created_at?: string | null
          provider_key?: string
          raw?: Json
        }
        Relationships: []
      }
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
      case_change_signals: {
        Row: {
          case_id: string
          created_at: string
          env: string
          id: string
          op: string
        }
        Insert: {
          case_id: string
          created_at?: string
          env: string
          id?: string
          op: string
        }
        Update: {
          case_id?: string
          created_at?: string
          env?: string
          id?: string
          op?: string
        }
        Relationships: []
      }
      case_mutation_audit: {
        Row: {
          action: string
          actor_user_id: string
          case_id: string
          changed_fields: string[]
          created_at: string
          env: string
          id: string
          new_revision: number
          previous_revision: number
        }
        Insert: {
          action: string
          actor_user_id: string
          case_id: string
          changed_fields?: string[]
          created_at?: string
          env: string
          id?: string
          new_revision: number
          previous_revision: number
        }
        Update: {
          action?: string
          actor_user_id?: string
          case_id?: string
          changed_fields?: string[]
          created_at?: string
          env?: string
          id?: string
          new_revision?: number
          previous_revision?: number
        }
        Relationships: []
      }
      case_participant_backfill_unresolved: {
        Row: {
          candidate_role: string | null
          candidate_user_id: string | null
          case_id: string | null
          created_at: string
          env: string
          id: string
          reason: string
          source_kind: string
          source_record_id: string | null
        }
        Insert: {
          candidate_role?: string | null
          candidate_user_id?: string | null
          case_id?: string | null
          created_at?: string
          env: string
          id?: string
          reason: string
          source_kind: string
          source_record_id?: string | null
        }
        Update: {
          candidate_role?: string | null
          candidate_user_id?: string | null
          case_id?: string | null
          created_at?: string
          env?: string
          id?: string
          reason?: string
          source_kind?: string
          source_record_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_participant_backfill_unresolved_candidate_user_id_fkey"
            columns: ["candidate_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_participant_backfill_unresolved_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_participant_backfill_unresolved_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      case_participants: {
        Row: {
          access_revoked_at: string | null
          access_revoked_by: string | null
          case_id: string
          created_at: string
          created_by: string | null
          id: string
          role: string
          source: string
          updated_at: string
          updated_by: string | null
          user_id: string
          work_status: string
        }
        Insert: {
          access_revoked_at?: string | null
          access_revoked_by?: string | null
          case_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          role: string
          source: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
          work_status?: string
        }
        Update: {
          access_revoked_at?: string | null
          access_revoked_by?: string | null
          case_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          role?: string
          source?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          work_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_participants_access_revoked_by_fkey"
            columns: ["access_revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_participants_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_participants_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_participants_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_participants_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          billing_unit: string
          body_content: Json | null
          case_reference_materials: Json | null
          cat_tool_enabled: boolean
          category: string
          change_log_enabled_at: string | null
          client: string
          client_case_link: Json | null
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
          review_rows: Json
          reviewer: string
          revision: number
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
          cat_tool_enabled?: boolean
          category?: string
          change_log_enabled_at?: string | null
          client?: string
          client_case_link?: Json | null
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
          review_rows?: Json
          reviewer?: string
          revision?: number
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
          cat_tool_enabled?: boolean
          category?: string
          change_log_enabled_at?: string | null
          client?: string
          client_case_link?: Json | null
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
          review_rows?: Json
          reviewer?: string
          revision?: number
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
      cat_ai_category_tags: {
        Row: {
          created_at: string
          id: number
          list_hidden: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: number
          list_hidden?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: number
          list_hidden?: boolean
          name?: string
        }
        Relationships: []
      }
      cat_ai_guidelines: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string | null
          examples: Json
          id: number
          is_default: boolean
          issue_group_id: string | null
          mutex_group: string | null
          scope: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          examples?: Json
          id?: number
          is_default?: boolean
          issue_group_id?: string | null
          mutex_group?: string | null
          scope?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          examples?: Json
          id?: number
          is_default?: boolean
          issue_group_id?: string | null
          mutex_group?: string | null
          scope?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_ai_guidelines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_ai_guidelines_issue_group_id_fkey"
            columns: ["issue_group_id"]
            isOneToOne: false
            referencedRelation: "cat_ai_issue_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_ai_issue_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          project_id: string | null
          scope: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          project_id?: string | null
          scope: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          project_id?: string | null
          scope?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "cat_ai_issue_groups_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "cat_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_ai_model_options: {
        Row: {
          created_at: string
          display_name_en: string | null
          display_name_zh: string
          enabled: boolean
          fallback_model_option_id: string | null
          id: string
          is_default: boolean
          max_output_tokens: number | null
          model_id: string
          provider_key: string
          reasoning_effort: string | null
          short_label_en: string | null
          short_label_zh: string | null
          sort_order: number
          supports_chat_completions: boolean
          supports_responses_api: boolean
          temperature: number | null
          tier: string
          updated_at: string
          usage_hint_en: string | null
          usage_hint_zh: string | null
          use_case: string
        }
        Insert: {
          created_at?: string
          display_name_en?: string | null
          display_name_zh: string
          enabled?: boolean
          fallback_model_option_id?: string | null
          id?: string
          is_default?: boolean
          max_output_tokens?: number | null
          model_id: string
          provider_key?: string
          reasoning_effort?: string | null
          short_label_en?: string | null
          short_label_zh?: string | null
          sort_order?: number
          supports_chat_completions?: boolean
          supports_responses_api?: boolean
          temperature?: number | null
          tier?: string
          updated_at?: string
          usage_hint_en?: string | null
          usage_hint_zh?: string | null
          use_case?: string
        }
        Update: {
          created_at?: string
          display_name_en?: string | null
          display_name_zh?: string
          enabled?: boolean
          fallback_model_option_id?: string | null
          id?: string
          is_default?: boolean
          max_output_tokens?: number | null
          model_id?: string
          provider_key?: string
          reasoning_effort?: string | null
          short_label_en?: string | null
          short_label_zh?: string | null
          sort_order?: number
          supports_chat_completions?: boolean
          supports_responses_api?: boolean
          temperature?: number | null
          tier?: string
          updated_at?: string
          usage_hint_en?: string | null
          usage_hint_zh?: string | null
          use_case?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_ai_model_options_fallback_model_option_id_fkey"
            columns: ["fallback_model_option_id"]
            isOneToOne: false
            referencedRelation: "cat_ai_model_options"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_ai_project_settings: {
        Row: {
          batch_introduction: string
          batch_ref_options: Json
          project_ai_instructions: Json
          project_guidelines: Json
          project_id: string
          selected_guideline_ids: number[]
          selected_style_guideline_ids: number[]
          special_instructions: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          batch_introduction?: string
          batch_ref_options?: Json
          project_ai_instructions?: Json
          project_guidelines?: Json
          project_id: string
          selected_guideline_ids?: number[]
          selected_style_guideline_ids?: number[]
          special_instructions?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          batch_introduction?: string
          batch_ref_options?: Json
          project_ai_instructions?: Json
          project_guidelines?: Json
          project_id?: string
          selected_guideline_ids?: number[]
          selected_style_guideline_ids?: number[]
          special_instructions?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cat_ai_project_settings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "cat_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_ai_project_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_ai_settings: {
        Row: {
          api_base_url: string
          api_key: string
          batch_size: number
          id: number
          model: string
          prefer_openai_proxy: boolean
          prompts: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          api_base_url?: string
          api_key?: string
          batch_size?: number
          id: number
          model?: string
          prefer_openai_proxy?: boolean
          prompts?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          api_base_url?: string
          api_key?: string
          batch_size?: number
          id?: number
          model?: string
          prefer_openai_proxy?: boolean
          prompts?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cat_ai_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_ai_style_examples: {
        Row: {
          ai_draft: string
          categories: Json
          context_next: string
          context_prev: string
          created_at: string
          created_by: string | null
          edit_notes: Json
          id: number
          mod_tags: Json
          seg_id: string | null
          source_lang: string
          source_text: string
          target_lang: string
          updated_at: string
          user_final: string
        }
        Insert: {
          ai_draft?: string
          categories?: Json
          context_next?: string
          context_prev?: string
          created_at?: string
          created_by?: string | null
          edit_notes?: Json
          id?: number
          mod_tags?: Json
          seg_id?: string | null
          source_lang?: string
          source_text?: string
          target_lang?: string
          updated_at?: string
          user_final?: string
        }
        Update: {
          ai_draft?: string
          categories?: Json
          context_next?: string
          context_prev?: string
          created_at?: string
          created_by?: string | null
          edit_notes?: Json
          id?: number
          mod_tags?: Json
          seg_id?: string | null
          source_lang?: string
          source_text?: string
          target_lang?: string
          updated_at?: string
          user_final?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_ai_style_examples_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_ai_user_batch_prefs: {
        Row: {
          env: string
          prefs: Json
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          env?: string
          prefs?: Json
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          env?: string
          prefs?: Json
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cat_annotation_options: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          option_type: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          option_type: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          option_type?: string
          sort_order?: number
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
            foreignKeyName: "cat_assignments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_visible"
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
      cat_file_attachments: {
        Row: {
          body_base64: string
          created_at: string
          file_id: string
          id: string
          mime_type: string
          name: string
          size_bytes: number
        }
        Insert: {
          body_base64?: string
          created_at?: string
          file_id: string
          id?: string
          mime_type?: string
          name?: string
          size_bytes?: number
        }
        Update: {
          body_base64?: string
          created_at?: string
          file_id?: string
          id?: string
          mime_type?: string
          name?: string
          size_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "cat_file_attachments_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cat_files"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_file_user_access: {
        Row: {
          file_id: string
          last_opened_at: string
          user_id: string
        }
        Insert: {
          file_id: string
          last_opened_at?: string
          user_id: string
        }
        Update: {
          file_id?: string
          last_opened_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_file_user_access_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cat_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_file_user_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_file_work_memos: {
        Row: {
          file_id: string
          history: Json
          text: string
          updated_at: string
        }
        Insert: {
          file_id: string
          history?: Json
          text?: string
          updated_at?: string
        }
        Update: {
          file_id?: string
          history?: Json
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_file_work_memos_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: true
            referencedRelation: "cat_files"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_file_workflow_stages: {
        Row: {
          completed_at: string | null
          created_at: string
          file_id: string
          id: string
          label: string
          stage_kind: string
          stage_order: number
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          file_id: string
          id?: string
          label: string
          stage_kind: string
          stage_order: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          file_id?: string
          id?: string
          label?: string
          stage_kind?: string
          stage_order?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_file_workflow_stages_file_id_fkey"
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
          default_mq_role: string
          env: string
          file_format: string
          google_sheet_url: string
          id: string
          last_modified: string
          meta_display_config: Json | null
          name: string
          original_file_base64: string | null
          original_file_path: string | null
          original_source_lang: string
          original_target_lang: string
          project_id: string
          related_lms_case_id: string | null
          related_lms_case_title: string
          source_lang: string
          target_lang: string
          workspace_note_draft: string
        }
        Insert: {
          applicable_special_instruction_ids?: Json
          created_at?: string
          default_mq_role?: string
          env?: string
          file_format?: string
          google_sheet_url?: string
          id?: string
          last_modified?: string
          meta_display_config?: Json | null
          name: string
          original_file_base64?: string | null
          original_file_path?: string | null
          original_source_lang?: string
          original_target_lang?: string
          project_id: string
          related_lms_case_id?: string | null
          related_lms_case_title?: string
          source_lang?: string
          target_lang?: string
          workspace_note_draft?: string
        }
        Update: {
          applicable_special_instruction_ids?: Json
          created_at?: string
          default_mq_role?: string
          env?: string
          file_format?: string
          google_sheet_url?: string
          id?: string
          last_modified?: string
          meta_display_config?: Json | null
          name?: string
          original_file_base64?: string | null
          original_file_path?: string | null
          original_source_lang?: string
          original_target_lang?: string
          project_id?: string
          related_lms_case_id?: string | null
          related_lms_case_title?: string
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
          env: string
          id: number
          module: string
          payload: Json | null
        }
        Insert: {
          at?: string
          env?: string
          id?: number
          module: string
          payload?: Json | null
        }
        Update: {
          at?: string
          env?: string
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
      cat_project_attachments: {
        Row: {
          body_base64: string
          created_at: string
          id: string
          mime_type: string
          name: string
          project_id: string
          size_bytes: number
        }
        Insert: {
          body_base64?: string
          created_at?: string
          id?: string
          mime_type?: string
          name?: string
          project_id: string
          size_bytes?: number
        }
        Update: {
          body_base64?: string
          created_at?: string
          id?: string
          mime_type?: string
          name?: string
          project_id?: string
          size_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "cat_project_attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "cat_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_projects: {
        Row: {
          assignment_id: string | null
          change_log: Json
          client_question_form_columns: Json | null
          client_question_form_url: string
          created_at: string
          env: string
          id: string
          last_modified: string
          meta_display_templates: Json
          name: string
          owner_user_id: string | null
          read_tbs: string[]
          read_tms: string[]
          source_langs: string[]
          target_langs: string[]
          tm_penalties: Json
          write_tb: string | null
          write_tms: string[]
        }
        Insert: {
          assignment_id?: string | null
          change_log?: Json
          client_question_form_columns?: Json | null
          client_question_form_url?: string
          created_at?: string
          env?: string
          id?: string
          last_modified?: string
          meta_display_templates?: Json
          name?: string
          owner_user_id?: string | null
          read_tbs?: string[]
          read_tms?: string[]
          source_langs?: string[]
          target_langs?: string[]
          tm_penalties?: Json
          write_tb?: string | null
          write_tms?: string[]
        }
        Update: {
          assignment_id?: string | null
          change_log?: Json
          client_question_form_columns?: Json | null
          client_question_form_url?: string
          created_at?: string
          env?: string
          id?: string
          last_modified?: string
          meta_display_templates?: Json
          name?: string
          owner_user_id?: string | null
          read_tbs?: string[]
          read_tms?: string[]
          source_langs?: string[]
          target_langs?: string[]
          tm_penalties?: Json
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
      cat_segment_annotations: {
        Row: {
          author_user_id: string | null
          created_at: string
          file_id: string
          id: string
          is_translator_ack: boolean
          issue_type: string | null
          note: string
          parent_annotation_id: string | null
          responder_role: string
          segment_id: string
          severity: string | null
        }
        Insert: {
          author_user_id?: string | null
          created_at?: string
          file_id: string
          id?: string
          is_translator_ack?: boolean
          issue_type?: string | null
          note?: string
          parent_annotation_id?: string | null
          responder_role: string
          segment_id: string
          severity?: string | null
        }
        Update: {
          author_user_id?: string | null
          created_at?: string
          file_id?: string
          id?: string
          is_translator_ack?: boolean
          issue_type?: string | null
          note?: string
          parent_annotation_id?: string | null
          responder_role?: string
          segment_id?: string
          severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cat_segment_annotations_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_segment_annotations_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cat_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_segment_annotations_parent_annotation_id_fkey"
            columns: ["parent_annotation_id"]
            isOneToOne: false
            referencedRelation: "cat_segment_annotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_segment_annotations_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "cat_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_segment_edit_leases: {
        Row: {
          created_at: string
          expires_at: string
          file_id: string
          holder_name: string | null
          holder_user_id: string | null
          segment_id: string
          session_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          file_id: string
          holder_name?: string | null
          holder_user_id?: string | null
          segment_id: string
          session_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          file_id?: string
          holder_name?: string | null
          holder_user_id?: string | null
          segment_id?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_segment_edit_leases_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cat_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_segment_edit_leases_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: true
            referencedRelation: "cat_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_segment_stage_snapshots: {
        Row: {
          confirmed_by: string | null
          file_id: string
          id: string
          segment_id: string
          snapshot_reason: string
          snapshotted_at: string
          target_tags: Json | null
          target_text: string
        }
        Insert: {
          confirmed_by?: string | null
          file_id: string
          id?: string
          segment_id: string
          snapshot_reason: string
          snapshotted_at?: string
          target_tags?: Json | null
          target_text?: string
        }
        Update: {
          confirmed_by?: string | null
          file_id?: string
          id?: string
          segment_id?: string
          snapshot_reason?: string
          snapshotted_at?: string
          target_tags?: Json | null
          target_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_segment_stage_snapshots_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_segment_stage_snapshots_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cat_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_segment_stage_snapshots_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "cat_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_segments: {
        Row: {
          col_src: string | null
          col_tgt: string | null
          confirmation_role: string | null
          created_at: string
          editor_note: string
          extra_value: string | null
          file_id: string
          global_id: number | null
          id: string
          id_value: string | null
          is_locked: boolean
          is_locked_system: boolean
          is_locked_user: boolean
          last_modified: string
          match_value: number | null
          meta_items: Json
          mq_inserted_match: Json | null
          original_role: string | null
          row_idx: number
          segment_revision: number
          sheet_name: string
          source_change_info: Json | null
          source_tags: Json
          source_text: string
          status: string
          target_tags: Json
          target_text: string
          wf_review_confirmed_at: string | null
          wf_review_confirmed_by: string | null
          wf_review_restore_snapshot: Json | null
          wf_review_revoked_pending: boolean
          wf_trans_confirmed_at: string | null
          wf_trans_confirmed_by: string | null
          xliff_tu_id: string | null
        }
        Insert: {
          col_src?: string | null
          col_tgt?: string | null
          confirmation_role?: string | null
          created_at?: string
          editor_note?: string
          extra_value?: string | null
          file_id: string
          global_id?: number | null
          id?: string
          id_value?: string | null
          is_locked?: boolean
          is_locked_system?: boolean
          is_locked_user?: boolean
          last_modified?: string
          match_value?: number | null
          meta_items?: Json
          mq_inserted_match?: Json | null
          original_role?: string | null
          row_idx?: number
          segment_revision?: number
          sheet_name?: string
          source_change_info?: Json | null
          source_tags?: Json
          source_text?: string
          status?: string
          target_tags?: Json
          target_text?: string
          wf_review_confirmed_at?: string | null
          wf_review_confirmed_by?: string | null
          wf_review_restore_snapshot?: Json | null
          wf_review_revoked_pending?: boolean
          wf_trans_confirmed_at?: string | null
          wf_trans_confirmed_by?: string | null
          xliff_tu_id?: string | null
        }
        Update: {
          col_src?: string | null
          col_tgt?: string | null
          confirmation_role?: string | null
          created_at?: string
          editor_note?: string
          extra_value?: string | null
          file_id?: string
          global_id?: number | null
          id?: string
          id_value?: string | null
          is_locked?: boolean
          is_locked_system?: boolean
          is_locked_user?: boolean
          last_modified?: string
          match_value?: number | null
          meta_items?: Json
          mq_inserted_match?: Json | null
          original_role?: string | null
          row_idx?: number
          segment_revision?: number
          sheet_name?: string
          source_change_info?: Json | null
          source_tags?: Json
          source_text?: string
          status?: string
          target_tags?: Json
          target_text?: string
          wf_review_confirmed_at?: string | null
          wf_review_confirmed_by?: string | null
          wf_review_restore_snapshot?: Json | null
          wf_review_revoked_pending?: boolean
          wf_trans_confirmed_at?: string | null
          wf_trans_confirmed_by?: string | null
          xliff_tu_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cat_segments_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cat_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_segments_wf_review_confirmed_by_fkey"
            columns: ["wf_review_confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_segments_wf_trans_confirmed_by_fkey"
            columns: ["wf_trans_confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_stage_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          assignee_user_id: string
          collab_row_id: string | null
          file_id: string
          file_workflow_stage_id: string
          first_edited_at: string | null
          id: string
          line_end: number | null
          line_start: number | null
          scope_label: string | null
          updated_at: string
          view_id: string | null
          workflow_status: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          assignee_user_id: string
          collab_row_id?: string | null
          file_id: string
          file_workflow_stage_id: string
          first_edited_at?: string | null
          id?: string
          line_end?: number | null
          line_start?: number | null
          scope_label?: string | null
          updated_at?: string
          view_id?: string | null
          workflow_status?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          assignee_user_id?: string
          collab_row_id?: string | null
          file_id?: string
          file_workflow_stage_id?: string
          first_edited_at?: string | null
          id?: string
          line_end?: number | null
          line_start?: number | null
          scope_label?: string | null
          updated_at?: string
          view_id?: string | null
          workflow_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_stage_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_stage_assignments_assignee_user_id_fkey"
            columns: ["assignee_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_stage_assignments_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cat_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_stage_assignments_file_workflow_stage_id_fkey"
            columns: ["file_workflow_stage_id"]
            isOneToOne: false
            referencedRelation: "cat_file_workflow_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_stage_assignments_view_id_fkey"
            columns: ["view_id"]
            isOneToOne: false
            referencedRelation: "cat_views"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_tbs: {
        Row: {
          change_log: Json
          created_at: string
          env: string
          google_sheet_url: string
          id: string
          last_modified: string
          name: string
          next_term_number: number
          online_import_config: Json
          online_tabs: Json
          owner_user_id: string | null
          source_langs: string[]
          source_type: string
          source_type_locked: boolean
          target_langs: string[]
          terms: Json
        }
        Insert: {
          change_log?: Json
          created_at?: string
          env?: string
          google_sheet_url?: string
          id?: string
          last_modified?: string
          name?: string
          next_term_number?: number
          online_import_config?: Json
          online_tabs?: Json
          owner_user_id?: string | null
          source_langs?: string[]
          source_type?: string
          source_type_locked?: boolean
          target_langs?: string[]
          terms?: Json
        }
        Update: {
          change_log?: Json
          created_at?: string
          env?: string
          google_sheet_url?: string
          id?: string
          last_modified?: string
          name?: string
          next_term_number?: number
          online_import_config?: Json
          online_tabs?: Json
          owner_user_id?: string | null
          source_langs?: string[]
          source_type?: string
          source_type_locked?: boolean
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
      cat_translator_question_form_prefs: {
        Row: {
          project_id: string
          settings_json: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          project_id: string
          settings_json?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          project_id?: string
          settings_json?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_translator_question_form_prefs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "cat_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_user_segment_markers: {
        Row: {
          colors: string[]
          file_id: string
          segment_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          colors?: string[]
          file_id: string
          segment_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          colors?: string[]
          file_id?: string
          segment_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_user_segment_markers_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cat_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_user_segment_markers_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "cat_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_user_segment_markers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_user_ui_prefs: {
        Row: {
          hide_completed_dashboard: boolean
          qa_report_surface: string
          updated_at: string
          user_id: string
        }
        Insert: {
          hide_completed_dashboard?: boolean
          qa_report_surface?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          hide_completed_dashboard?: boolean
          qa_report_surface?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_user_ui_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_view_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          assignee_user_id: string
          id: string
          status: string
          updated_at: string
          view_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          assignee_user_id: string
          id?: string
          status?: string
          updated_at?: string
          view_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          assignee_user_id?: string
          id?: string
          status?: string
          updated_at?: string
          view_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_view_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_view_assignments_assignee_user_id_fkey"
            columns: ["assignee_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_view_assignments_view_id_fkey"
            columns: ["view_id"]
            isOneToOne: false
            referencedRelation: "cat_views"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_views: {
        Row: {
          created_at: string
          file_ids: string[]
          file_roles: Json
          filter_summary: Json
          id: string
          last_modified: string
          name: string
          owner_user_id: string | null
          project_id: string
          segment_ids: string[]
        }
        Insert: {
          created_at?: string
          file_ids?: string[]
          file_roles?: Json
          filter_summary?: Json
          id?: string
          last_modified?: string
          name?: string
          owner_user_id?: string | null
          project_id: string
          segment_ids?: string[]
        }
        Update: {
          created_at?: string
          file_ids?: string[]
          file_roles?: Json
          filter_summary?: Json
          id?: string
          last_modified?: string
          name?: string
          owner_user_id?: string | null
          project_id?: string
          segment_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "cat_views_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cat_views_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "cat_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_workflow_template_stages: {
        Row: {
          created_at: string
          id: string
          label: string
          stage_kind: string
          stage_order: number
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          stage_kind: string
          stage_order: number
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          stage_kind?: string
          stage_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_workflow_template_stages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cat_workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_workflow_templates: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          last_modified: string
          name: string
          project_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          last_modified?: string
          name?: string
          project_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          last_modified?: string
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cat_workflow_templates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "cat_projects"
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
          {
            foreignKeyName: "client_invoice_fees_fee_id_fkey"
            columns: ["fee_id"]
            isOneToOne: false
            referencedRelation: "fees_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invoices: {
        Row: {
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
      fee_change_signals: {
        Row: {
          assignee: string
          assignee_visible: boolean
          created_at: string
          env: string
          fee_id: string
          id: string
          op: string
        }
        Insert: {
          assignee?: string
          assignee_visible?: boolean
          created_at?: string
          env: string
          fee_id: string
          id?: string
          op: string
        }
        Update: {
          assignee?: string
          assignee_visible?: boolean
          created_at?: string
          env?: string
          fee_id?: string
          id?: string
          op?: string
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
          consultation_slack_records: Json
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
          consultation_slack_records?: Json
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
          consultation_slack_records?: Json
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
            foreignKeyName: "invoice_fees_fee_id_fkey"
            columns: ["fee_id"]
            isOneToOne: false
            referencedRelation: "fees_visible"
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
          is_test: boolean
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
          is_test?: boolean
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
          is_test?: boolean
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
      cases_visible: {
        Row: {
          billing_unit: string | null
          body_content: Json | null
          case_reference_materials: Json | null
          cat_tool_enabled: boolean | null
          category: string | null
          change_log_enabled_at: string | null
          client: string | null
          client_case_link: Json | null
          client_guidelines: Json | null
          client_po_number: string | null
          client_question_form: boolean | null
          client_receipt: string | null
          client_receipt_files: Json | null
          collab_count: number | null
          collab_rows: Json | null
          comments: Json | null
          common_info: Json | null
          common_links: Json | null
          contact: string | null
          created_at: string | null
          created_by: string | null
          custom_guidelines_url: Json | null
          decline_records: Json | null
          delivery_method: string | null
          delivery_method_files: Json | null
          dispatch_route: string | null
          edit_logs: Json | null
          env: string | null
          execution_tool: string | null
          fee_entry: string | null
          icon_url: string | null
          id: string | null
          inquiry_note: string | null
          inquiry_slack_records: Json | null
          internal_comments: Json | null
          internal_note_form: boolean | null
          internal_records: Json | null
          internal_review_final: Json | null
          keyword: string | null
          login_account: string | null
          login_password: string | null
          multi_collab: boolean | null
          online_tool_filename: string | null
          online_tool_project: string | null
          other_login_info: string | null
          process_note: string | null
          question_form: string | null
          question_tools: Json | null
          reference_materials: Json | null
          review_deadline: string | null
          review_rows: Json | null
          reviewer: string | null
          revision: number | null
          series_reference_materials: Json | null
          source_files: Json | null
          status: string | null
          task_status: string | null
          title: string | null
          tool_field_values: Json | null
          tools: Json | null
          track_changes: Json | null
          translation_deadline: string | null
          translator: Json | null
          translator_final: Json | null
          unit_count: number | null
          updated_at: string | null
          work_groups: Json | null
          work_type: Json | null
          working_files: Json | null
        }
        Insert: {
          billing_unit?: string | null
          body_content?: Json | null
          case_reference_materials?: Json | null
          cat_tool_enabled?: boolean | null
          category?: string | null
          change_log_enabled_at?: string | null
          client?: never
          client_case_link?: never
          client_guidelines?: Json | null
          client_po_number?: never
          client_question_form?: boolean | null
          client_receipt?: string | null
          client_receipt_files?: Json | null
          collab_count?: number | null
          collab_rows?: Json | null
          comments?: Json | null
          common_info?: Json | null
          common_links?: Json | null
          contact?: never
          created_at?: string | null
          created_by?: string | null
          custom_guidelines_url?: Json | null
          decline_records?: Json | null
          delivery_method?: string | null
          delivery_method_files?: Json | null
          dispatch_route?: never
          edit_logs?: never
          env?: string | null
          execution_tool?: string | null
          fee_entry?: string | null
          icon_url?: string | null
          id?: string | null
          inquiry_note?: string | null
          inquiry_slack_records?: Json | null
          internal_comments?: never
          internal_note_form?: boolean | null
          internal_records?: Json | null
          internal_review_final?: Json | null
          keyword?: never
          login_account?: never
          login_password?: never
          multi_collab?: boolean | null
          online_tool_filename?: string | null
          online_tool_project?: string | null
          other_login_info?: never
          process_note?: string | null
          question_form?: string | null
          question_tools?: never
          reference_materials?: Json | null
          review_deadline?: string | null
          review_rows?: Json | null
          reviewer?: string | null
          revision?: number | null
          series_reference_materials?: Json | null
          source_files?: Json | null
          status?: string | null
          task_status?: string | null
          title?: string | null
          tool_field_values?: never
          tools?: never
          track_changes?: Json | null
          translation_deadline?: string | null
          translator?: Json | null
          translator_final?: Json | null
          unit_count?: number | null
          updated_at?: string | null
          work_groups?: Json | null
          work_type?: Json | null
          working_files?: Json | null
        }
        Update: {
          billing_unit?: string | null
          body_content?: Json | null
          case_reference_materials?: Json | null
          cat_tool_enabled?: boolean | null
          category?: string | null
          change_log_enabled_at?: string | null
          client?: never
          client_case_link?: never
          client_guidelines?: Json | null
          client_po_number?: never
          client_question_form?: boolean | null
          client_receipt?: string | null
          client_receipt_files?: Json | null
          collab_count?: number | null
          collab_rows?: Json | null
          comments?: Json | null
          common_info?: Json | null
          common_links?: Json | null
          contact?: never
          created_at?: string | null
          created_by?: string | null
          custom_guidelines_url?: Json | null
          decline_records?: Json | null
          delivery_method?: string | null
          delivery_method_files?: Json | null
          dispatch_route?: never
          edit_logs?: never
          env?: string | null
          execution_tool?: string | null
          fee_entry?: string | null
          icon_url?: string | null
          id?: string | null
          inquiry_note?: string | null
          inquiry_slack_records?: Json | null
          internal_comments?: never
          internal_note_form?: boolean | null
          internal_records?: Json | null
          internal_review_final?: Json | null
          keyword?: never
          login_account?: never
          login_password?: never
          multi_collab?: boolean | null
          online_tool_filename?: string | null
          online_tool_project?: string | null
          other_login_info?: never
          process_note?: string | null
          question_form?: string | null
          question_tools?: never
          reference_materials?: Json | null
          review_deadline?: string | null
          review_rows?: Json | null
          reviewer?: string | null
          revision?: number | null
          series_reference_materials?: Json | null
          source_files?: Json | null
          status?: string | null
          task_status?: string | null
          title?: string | null
          tool_field_values?: never
          tools?: never
          track_changes?: Json | null
          translation_deadline?: string | null
          translator?: Json | null
          translator_final?: Json | null
          unit_count?: number | null
          updated_at?: string | null
          work_groups?: Json | null
          work_type?: Json | null
          working_files?: Json | null
        }
        Relationships: []
      }
      fees_visible: {
        Row: {
          assignee: string | null
          client_info: Json | null
          created_at: string | null
          created_by: string | null
          edit_log_phases: Json | null
          edit_logs: Json | null
          env: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string | null
          internal_note: string | null
          internal_note_url: string | null
          notes: Json | null
          status: string | null
          task_items: Json | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          assignee?: string | null
          client_info?: never
          created_at?: string | null
          created_by?: string | null
          edit_log_phases?: Json | null
          edit_logs?: never
          env?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string | null
          internal_note?: string | null
          internal_note_url?: string | null
          notes?: Json | null
          status?: string | null
          task_items?: Json | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          assignee?: string | null
          client_info?: never
          created_at?: string | null
          created_by?: string | null
          edit_log_phases?: Json | null
          edit_logs?: never
          env?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string | null
          internal_note?: string | null
          internal_note_url?: string | null
          notes?: Json | null
          status?: string | null
          task_items?: Json | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_inquiry_collab_row: {
        Args: {
          p_case_id: string
          p_collab_row_id: string
          p_expected_revision: number
        }
        Returns: Json
      }
      accept_public_inquiry_case: {
        Args: { p_case_id: string; p_expected_revision: number }
        Returns: Json
      }
      admin_create_case: {
        Args: { p_case_id: string; p_payload: Json }
        Returns: Json
      }
      admin_delete_case: {
        Args: { p_case_id: string; p_expected_revision: number }
        Returns: Json
      }
      apply_case_update: {
        Args: { p_case_id: string; p_expected_revision: number; p_patch: Json }
        Returns: Json
      }
      apply_cat_segment_target_update: {
        Args: {
          p_expected_segment_revision: number
          p_extras?: Json
          p_new_target_text: string
          p_segment_id: string
        }
        Returns: {
          col_src: string | null
          col_tgt: string | null
          confirmation_role: string | null
          created_at: string
          editor_note: string
          extra_value: string | null
          file_id: string
          global_id: number | null
          id: string
          id_value: string | null
          is_locked: boolean
          is_locked_system: boolean
          is_locked_user: boolean
          last_modified: string
          match_value: number | null
          meta_items: Json
          mq_inserted_match: Json | null
          original_role: string | null
          row_idx: number
          segment_revision: number
          sheet_name: string
          source_change_info: Json | null
          source_tags: Json
          source_text: string
          status: string
          target_tags: Json
          target_text: string
          wf_review_confirmed_at: string | null
          wf_review_confirmed_by: string | null
          wf_review_restore_snapshot: Json | null
          wf_review_revoked_pending: boolean
          wf_trans_confirmed_at: string | null
          wf_trans_confirmed_by: string | null
          xliff_tu_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "cat_segments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      apply_cat_segments_patch_batch: {
        Args: { p_updates: Json }
        Returns: undefined
      }
      cat_case_all_linked_files_prep_ready: {
        Args: { p_case_id: string }
        Returns: boolean
      }
      cat_case_linked_files_not_prep_ready: {
        Args: { p_case_id: string }
        Returns: {
          file_id: string
          file_name: string
        }[]
      }
      cat_catchup_segment_snapshots: {
        Args: { p_file_id: string; p_rows: Json; p_snapshot_reason: string }
        Returns: number
      }
      cat_mark_stage_assignment_first_edited: {
        Args: { p_assignment_id: string }
        Returns: {
          assigned_at: string
          assigned_by: string | null
          assignee_user_id: string
          collab_row_id: string | null
          file_id: string
          file_workflow_stage_id: string
          first_edited_at: string | null
          id: string
          line_end: number | null
          line_start: number | null
          scope_label: string | null
          updated_at: string
          view_id: string | null
          workflow_status: string
        }
        SetofOptions: {
          from: "*"
          to: "cat_stage_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cat_parse_line_range: {
        Args: { p_range: string }
        Returns: Record<string, unknown>
      }
      cat_pm_assign_file: {
        Args: { p_assignee_user_ids: string[]; p_file_id: string }
        Returns: Json
      }
      cat_pm_assign_view: {
        Args: { p_assignee_user_ids: string[]; p_view_id: string }
        Returns: Json
      }
      cat_pm_unassign_file: {
        Args: { p_assignee_user_id: string; p_file_id: string }
        Returns: Json
      }
      cat_pm_unassign_view: {
        Args: { p_assignee_user_id: string; p_view_id: string }
        Returns: Json
      }
      cat_pm_update_file_workflow_stage_status: {
        Args: { p_stage_id: string; p_status: string }
        Returns: {
          completed_at: string | null
          created_at: string
          file_id: string
          id: string
          label: string
          stage_kind: string
          stage_order: number
          started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cat_file_workflow_stages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cat_pm_upsert_review_stage_assignment: {
        Args: {
          p_allow_downgrade?: boolean
          p_assigned_by?: string
          p_assignee_user_id: string
          p_collab_row_id?: string
          p_file_id: string
          p_line_end?: number
          p_line_start?: number
          p_scope_label?: string
          p_view_id?: string
          p_workflow_status?: string
        }
        Returns: undefined
      }
      cat_pm_upsert_translate_stage_assignment: {
        Args: {
          p_allow_downgrade?: boolean
          p_assigned_by?: string
          p_assignee_user_id: string
          p_collab_row_id?: string
          p_file_id: string
          p_line_end?: number
          p_line_start?: number
          p_scope_label?: string
          p_view_id?: string
          p_workflow_status?: string
        }
        Returns: undefined
      }
      cat_resolve_effective_upsert_workflow_status: {
        Args: {
          p_allow_downgrade?: boolean
          p_existing_status: string
          p_requested_status: string
          p_stage_status: string
        }
        Returns: string
      }
      cat_resolve_profile_id: { Args: { p_name: string }; Returns: string }
      cat_resolve_profile_id_dual: {
        Args: { p_name: string; p_user_id: string }
        Returns: string
      }
      cat_revert_workflow_stages_for_case: {
        Args: { p_case_id: string }
        Returns: undefined
      }
      cat_save_segment_annotation: {
        Args: {
          p_file_id: string
          p_is_translator_ack?: boolean
          p_issue_type: string
          p_note: string
          p_parent_annotation_id: string
          p_responder_role: string
          p_segment_id: string
          p_severity: string
        }
        Returns: {
          author_user_id: string | null
          created_at: string
          file_id: string
          id: string
          is_translator_ack: boolean
          issue_type: string | null
          note: string
          parent_annotation_id: string | null
          responder_role: string
          segment_id: string
          severity: string | null
        }
        SetofOptions: {
          from: "*"
          to: "cat_segment_annotations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cat_update_annotation_translator_ack: {
        Args: { p_ack: boolean; p_annotation_id: string }
        Returns: {
          author_user_id: string | null
          created_at: string
          file_id: string
          id: string
          is_translator_ack: boolean
          issue_type: string | null
          note: string
          parent_annotation_id: string | null
          responder_role: string
          segment_id: string
          severity: string | null
        }
        SetofOptions: {
          from: "*"
          to: "cat_segment_annotations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cat_update_file_assignment_status: {
        Args: { p_assignment_id: string; p_status: string }
        Returns: Json
      }
      cat_update_stage_assignment_workflow_status: {
        Args: { p_assignment_id: string; p_workflow_status: string }
        Returns: {
          assigned_at: string
          assigned_by: string | null
          assignee_user_id: string
          collab_row_id: string | null
          file_id: string
          file_workflow_stage_id: string
          first_edited_at: string | null
          id: string
          line_end: number | null
          line_start: number | null
          scope_label: string | null
          updated_at: string
          view_id: string | null
          workflow_status: string
        }
        SetofOptions: {
          from: "*"
          to: "cat_stage_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cat_update_view_assignment_status: {
        Args: { p_assignment_id: string; p_status: string }
        Returns: Json
      }
      cat_upsert_review_stage_assignment: {
        Args: {
          p_allow_downgrade?: boolean
          p_assignee_user_id: string
          p_collab_row_id: string
          p_file_id: string
          p_line_end: number
          p_line_start: number
          p_scope_label: string
          p_view_id: string
          p_workflow_status: string
        }
        Returns: undefined
      }
      cat_upsert_segment_snapshot: {
        Args: {
          p_confirmed_by?: string
          p_file_id: string
          p_segment_id: string
          p_snapshot_reason: string
          p_target_tags?: Json
          p_target_text: string
        }
        Returns: {
          confirmed_by: string | null
          file_id: string
          id: string
          segment_id: string
          snapshot_reason: string
          snapshotted_at: string
          target_tags: Json | null
          target_text: string
        }
        SetofOptions: {
          from: "*"
          to: "cat_segment_stage_snapshots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cat_upsert_segment_snapshots_batch: {
        Args: { p_rows: Json }
        Returns: number
      }
      cat_upsert_translate_stage_assignment: {
        Args: {
          p_allow_downgrade?: boolean
          p_assignee_user_id: string
          p_collab_row_id: string
          p_file_id: string
          p_line_end: number
          p_line_start: number
          p_scope_label: string
          p_view_id: string
          p_workflow_status: string
        }
        Returns: undefined
      }
      cat_wf_status_rank: { Args: { p_status: string }; Returns: number }
      cat_workflow_is_exception_file: {
        Args: { p_name: string }
        Returns: boolean
      }
      complete_case_collab_row: {
        Args: {
          p_case_id: string
          p_collab_row_id: string
          p_expected_revision: number
        }
        Returns: Json
      }
      complete_case_review_row: {
        Args: {
          p_case_id: string
          p_expected_revision: number
          p_review_row_id: string
        }
        Returns: Json
      }
      complete_case_translation: {
        Args: { p_case_id: string; p_expected_revision: number }
        Returns: Json
      }
      current_env: { Args: never; Returns: string }
      decline_public_inquiry_case: {
        Args: {
          p_case_id: string
          p_decline?: Json
          p_expected_revision: number
        }
        Returns: Json
      }
      ensure_cat_file_workflow_stages: {
        Args: { p_file_id: string }
        Returns: undefined
      }
      ensure_cat_project_default_workflow_template: {
        Args: { p_project_id: string }
        Returns: string
      }
      get_case_credentials: { Args: { p_case_id: string }; Returns: Json }
      get_own_slack_meta: {
        Args: never
        Returns: {
          slack_team_id: string
          slack_user_id: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      lms_sync_cat_file_assignments_for_case: {
        Args: { p_case_id: string }
        Returns: undefined
      }
      lms_sync_cat_workflow_for_case: {
        Args: { p_case_id: string }
        Returns: Json
      }
      release_cat_segment_edit_lease: {
        Args: { p_segment_id: string; p_session_id: string }
        Returns: boolean
      }
      revoke_case_participant_access: {
        Args: {
          p_case_id: string
          p_expected_revision: number
          p_role: string
          p_user_id: string
        }
        Returns: Json
      }
      sync_cat_file_assignments_for_case: {
        Args: { p_case_id: string }
        Returns: undefined
      }
      sync_cat_workflow_assignments_for_case: {
        Args: { p_case_id: string }
        Returns: Json
      }
      try_acquire_cat_segment_edit_lease: {
        Args: {
          p_file_id: string
          p_holder_name: string
          p_holder_user_id: string
          p_segment_id: string
          p_session_id: string
          p_ttl_seconds?: number
        }
        Returns: Json
      }
      update_case_credentials: {
        Args: {
          p_case_id: string
          p_credentials: Json
          p_expected_revision: number
        }
        Returns: Json
      }
      update_case_permitted_fields: {
        Args: {
          p_case_id: string
          p_changes: Json
          p_expected_revision: number
        }
        Returns: Json
      }
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
