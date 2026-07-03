-- W5-1：為 33 個缺索引的外鍵補上索引（對應 Supabase advisors performance: unindexed_foreign_keys）。
-- 使用一般 CREATE INDEX IF NOT EXISTS（非 CONCURRENTLY），以便可在單一 transaction 內套用
-- （比照 20260502130000_perf_indexes.sql）。純效能改善，不影響任何前端行為。

CREATE INDEX IF NOT EXISTS idx_app_settings_updated_by ON public.app_settings (updated_by);
CREATE INDEX IF NOT EXISTS idx_cat_ai_guidelines_created_by ON public.cat_ai_guidelines (created_by);
CREATE INDEX IF NOT EXISTS idx_cat_ai_project_settings_updated_by ON public.cat_ai_project_settings (updated_by);
CREATE INDEX IF NOT EXISTS idx_cat_ai_settings_updated_by ON public.cat_ai_settings (updated_by);
CREATE INDEX IF NOT EXISTS idx_cat_ai_style_examples_created_by ON public.cat_ai_style_examples (created_by);
CREATE INDEX IF NOT EXISTS idx_cat_assignments_created_by ON public.cat_assignments (created_by);
CREATE INDEX IF NOT EXISTS idx_cat_file_assignments_assigned_by ON public.cat_file_assignments (assigned_by);
CREATE INDEX IF NOT EXISTS idx_cat_file_user_access_file_id ON public.cat_file_user_access (file_id);
CREATE INDEX IF NOT EXISTS idx_cat_guidelines_created_by_id ON public.cat_guidelines (created_by_id);
CREATE INDEX IF NOT EXISTS idx_cat_note_replies_created_by_id ON public.cat_note_replies (created_by_id);
CREATE INDEX IF NOT EXISTS idx_cat_private_notes_user_id ON public.cat_private_notes (user_id);
CREATE INDEX IF NOT EXISTS idx_cat_segment_annotations_author_user_id ON public.cat_segment_annotations (author_user_id);
CREATE INDEX IF NOT EXISTS idx_cat_segment_annotations_parent_annotation_id ON public.cat_segment_annotations (parent_annotation_id);
CREATE INDEX IF NOT EXISTS idx_cat_segment_stage_snapshots_confirmed_by ON public.cat_segment_stage_snapshots (confirmed_by);
CREATE INDEX IF NOT EXISTS idx_cat_segments_wf_review_confirmed_by ON public.cat_segments (wf_review_confirmed_by);
CREATE INDEX IF NOT EXISTS idx_cat_segments_wf_trans_confirmed_by ON public.cat_segments (wf_trans_confirmed_by);
CREATE INDEX IF NOT EXISTS idx_cat_stage_assignments_assigned_by ON public.cat_stage_assignments (assigned_by);
CREATE INDEX IF NOT EXISTS idx_cat_tbs_owner_user_id ON public.cat_tbs (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_cat_tms_owner_user_id ON public.cat_tms (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_cat_translator_question_form_prefs_project_id ON public.cat_translator_question_form_prefs (project_id);
CREATE INDEX IF NOT EXISTS idx_cat_user_segment_markers_file_id ON public.cat_user_segment_markers (file_id);
CREATE INDEX IF NOT EXISTS idx_cat_user_segment_markers_segment_id ON public.cat_user_segment_markers (segment_id);
CREATE INDEX IF NOT EXISTS idx_cat_view_assignments_assigned_by ON public.cat_view_assignments (assigned_by);
CREATE INDEX IF NOT EXISTS idx_cat_workspace_notes_file_id ON public.cat_workspace_notes (file_id);
CREATE INDEX IF NOT EXISTS idx_client_invoice_fees_client_invoice_id ON public.client_invoice_fees (client_invoice_id);
CREATE INDEX IF NOT EXISTS idx_client_invoice_fees_fee_id ON public.client_invoice_fees (fee_id);
CREATE INDEX IF NOT EXISTS idx_fees_created_by ON public.fees (created_by);
CREATE INDEX IF NOT EXISTS idx_fees_finalized_by ON public.fees (finalized_by);
CREATE INDEX IF NOT EXISTS idx_invitations_invited_by ON public.invitations (invited_by);
CREATE INDEX IF NOT EXISTS idx_invoice_fees_fee_id ON public.invoice_fees (fee_id);
CREATE INDEX IF NOT EXISTS idx_ops_incidents_created_by ON public.ops_incidents (created_by);
CREATE INDEX IF NOT EXISTS idx_permission_settings_updated_by ON public.permission_settings (updated_by);
CREATE INDEX IF NOT EXISTS idx_slack_oauth_states_user_id ON public.slack_oauth_states (user_id);
