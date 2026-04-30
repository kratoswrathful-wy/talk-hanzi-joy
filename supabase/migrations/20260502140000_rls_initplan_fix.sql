-- Fix auth_rls_initplan: replace auth.uid() with (SELECT auth.uid()) in all RLS policies.
-- When auth.uid() is called directly in a USING/WITH CHECK expression, Postgres may
-- re-evaluate it for every row scanned. Wrapping it in (SELECT auth.uid()) forces a
-- single evaluation per statement (initplan), reducing CPU cost proportionally to row count.

-- ── app_settings ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete settings" ON public.app_settings;
CREATE POLICY "Admins can delete settings" ON public.app_settings FOR DELETE USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can insert settings" ON public.app_settings;
CREATE POLICY "Admins can insert settings" ON public.app_settings FOR INSERT WITH CHECK (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can update settings" ON public.app_settings;
CREATE POLICY "Admins can update settings" ON public.app_settings FOR UPDATE USING (is_admin((SELECT auth.uid())));

-- ── cases ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete cases" ON public.cases;
CREATE POLICY "Admins can delete cases" ON public.cases FOR DELETE USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can insert cases" ON public.cases;
CREATE POLICY "Admins can insert cases" ON public.cases FOR INSERT WITH CHECK (is_admin((SELECT auth.uid())));

-- ── cat_ai_category_tags ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_ai_category_tags_rw_authenticated" ON public.cat_ai_category_tags;
CREATE POLICY "cat_ai_category_tags_rw_authenticated" ON public.cat_ai_category_tags FOR ALL USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── cat_ai_guidelines ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_ai_guidelines_rw_authenticated" ON public.cat_ai_guidelines;
CREATE POLICY "cat_ai_guidelines_rw_authenticated" ON public.cat_ai_guidelines FOR ALL USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── cat_ai_issue_groups ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_ai_issue_groups_rw_authenticated" ON public.cat_ai_issue_groups;
CREATE POLICY "cat_ai_issue_groups_rw_authenticated" ON public.cat_ai_issue_groups FOR ALL USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── cat_ai_project_settings ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_ai_project_settings_rw_authenticated" ON public.cat_ai_project_settings;
CREATE POLICY "cat_ai_project_settings_rw_authenticated" ON public.cat_ai_project_settings FOR ALL USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── cat_ai_settings ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_ai_settings_rw_authenticated" ON public.cat_ai_settings;
CREATE POLICY "cat_ai_settings_rw_authenticated" ON public.cat_ai_settings FOR ALL USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── cat_ai_style_examples ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_ai_style_examples_rw_authenticated" ON public.cat_ai_style_examples;
CREATE POLICY "cat_ai_style_examples_rw_authenticated" ON public.cat_ai_style_examples FOR ALL USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── cat_assignments ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pm_can_manage_cat_assignments" ON public.cat_assignments;
CREATE POLICY "pm_can_manage_cat_assignments" ON public.cat_assignments FOR ALL USING (is_admin((SELECT auth.uid()))) WITH CHECK (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "translator_read_own_cat_assignments" ON public.cat_assignments;
CREATE POLICY "translator_read_own_cat_assignments" ON public.cat_assignments FOR SELECT USING (translator_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "translator_update_own_status" ON public.cat_assignments;
CREATE POLICY "translator_update_own_status" ON public.cat_assignments FOR UPDATE USING (translator_user_id = (SELECT auth.uid())) WITH CHECK (translator_user_id = (SELECT auth.uid()));

-- ── cat_file_assignments ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_file_assignments_manage_admin" ON public.cat_file_assignments;
CREATE POLICY "cat_file_assignments_manage_admin" ON public.cat_file_assignments FOR ALL USING (is_admin((SELECT auth.uid()))) WITH CHECK (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "cat_file_assignments_read_own" ON public.cat_file_assignments;
CREATE POLICY "cat_file_assignments_read_own" ON public.cat_file_assignments FOR SELECT USING (assignee_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "cat_file_assignments_self_insert" ON public.cat_file_assignments;
CREATE POLICY "cat_file_assignments_self_insert" ON public.cat_file_assignments FOR INSERT WITH CHECK (assignee_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "cat_file_assignments_update_own_status" ON public.cat_file_assignments;
CREATE POLICY "cat_file_assignments_update_own_status" ON public.cat_file_assignments FOR UPDATE USING (assignee_user_id = (SELECT auth.uid())) WITH CHECK (assignee_user_id = (SELECT auth.uid()));

-- ── cat_file_attachments ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_file_attachments_rw_authenticated" ON public.cat_file_attachments;
CREATE POLICY "cat_file_attachments_rw_authenticated" ON public.cat_file_attachments FOR ALL USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── cat_file_work_memos ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_file_work_memos_rw_authenticated" ON public.cat_file_work_memos;
CREATE POLICY "cat_file_work_memos_rw_authenticated" ON public.cat_file_work_memos FOR ALL USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── cat_files ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_files_rw_authenticated" ON public.cat_files;
CREATE POLICY "cat_files_rw_authenticated" ON public.cat_files FOR ALL USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── cat_guidelines ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_guidelines_delete_pm" ON public.cat_guidelines;
CREATE POLICY "cat_guidelines_delete_pm" ON public.cat_guidelines FOR DELETE USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "cat_guidelines_insert_all" ON public.cat_guidelines;
CREATE POLICY "cat_guidelines_insert_all" ON public.cat_guidelines FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "cat_guidelines_read_all" ON public.cat_guidelines;
CREATE POLICY "cat_guidelines_read_all" ON public.cat_guidelines FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "cat_guidelines_update_pm" ON public.cat_guidelines;
CREATE POLICY "cat_guidelines_update_pm" ON public.cat_guidelines FOR UPDATE USING (is_admin((SELECT auth.uid()))) WITH CHECK (is_admin((SELECT auth.uid())));

-- ── cat_module_logs ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_module_logs_rw_authenticated" ON public.cat_module_logs;
CREATE POLICY "cat_module_logs_rw_authenticated" ON public.cat_module_logs FOR ALL USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── cat_note_replies ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_note_replies_delete_pm" ON public.cat_note_replies;
CREATE POLICY "cat_note_replies_delete_pm" ON public.cat_note_replies FOR DELETE USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "cat_note_replies_insert_all" ON public.cat_note_replies;
CREATE POLICY "cat_note_replies_insert_all" ON public.cat_note_replies FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "cat_note_replies_read_all" ON public.cat_note_replies;
CREATE POLICY "cat_note_replies_read_all" ON public.cat_note_replies FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "cat_note_replies_update_all" ON public.cat_note_replies;
CREATE POLICY "cat_note_replies_update_all" ON public.cat_note_replies FOR UPDATE USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── cat_private_notes ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_private_notes_owner" ON public.cat_private_notes;
CREATE POLICY "cat_private_notes_owner" ON public.cat_private_notes FOR ALL USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- ── cat_project_attachments ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_project_attachments_rw_authenticated" ON public.cat_project_attachments;
CREATE POLICY "cat_project_attachments_rw_authenticated" ON public.cat_project_attachments FOR ALL USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── cat_projects ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_projects_rw_authenticated" ON public.cat_projects;
CREATE POLICY "cat_projects_rw_authenticated" ON public.cat_projects FOR ALL USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── cat_segments ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_segments_rw_authenticated" ON public.cat_segments;
CREATE POLICY "cat_segments_rw_authenticated" ON public.cat_segments FOR ALL USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── cat_tbs ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_tbs_rw_authenticated" ON public.cat_tbs;
CREATE POLICY "cat_tbs_rw_authenticated" ON public.cat_tbs FOR ALL USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── cat_tm_segments ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_tm_segments_rw_authenticated" ON public.cat_tm_segments;
CREATE POLICY "cat_tm_segments_rw_authenticated" ON public.cat_tm_segments FOR ALL USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── cat_tms ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_tms_rw_authenticated" ON public.cat_tms;
CREATE POLICY "cat_tms_rw_authenticated" ON public.cat_tms FOR ALL USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── cat_workspace_notes ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_workspace_notes_rw_authenticated" ON public.cat_workspace_notes;
CREATE POLICY "cat_workspace_notes_rw_authenticated" ON public.cat_workspace_notes FOR ALL USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ── client_invoice_fees ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete client_invoice_fees" ON public.client_invoice_fees;
CREATE POLICY "Admins can delete client_invoice_fees" ON public.client_invoice_fees FOR DELETE USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can insert client_invoice_fees" ON public.client_invoice_fees;
CREATE POLICY "Admins can insert client_invoice_fees" ON public.client_invoice_fees FOR INSERT WITH CHECK (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can select client_invoice_fees" ON public.client_invoice_fees;
CREATE POLICY "Admins can select client_invoice_fees" ON public.client_invoice_fees FOR SELECT USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can update client_invoice_fees" ON public.client_invoice_fees;
CREATE POLICY "Admins can update client_invoice_fees" ON public.client_invoice_fees FOR UPDATE USING (is_admin((SELECT auth.uid())));

-- ── client_invoices ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete client_invoices" ON public.client_invoices;
CREATE POLICY "Admins can delete client_invoices" ON public.client_invoices FOR DELETE USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can insert client_invoices" ON public.client_invoices;
CREATE POLICY "Admins can insert client_invoices" ON public.client_invoices FOR INSERT WITH CHECK (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can select client_invoices" ON public.client_invoices;
CREATE POLICY "Admins can select client_invoices" ON public.client_invoices FOR SELECT USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can update client_invoices" ON public.client_invoices;
CREATE POLICY "Admins can update client_invoices" ON public.client_invoices FOR UPDATE USING (is_admin((SELECT auth.uid())));

-- ── fees ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete fees" ON public.fees;
CREATE POLICY "Admins can delete fees" ON public.fees FOR DELETE USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can insert fees" ON public.fees;
CREATE POLICY "Admins can insert fees" ON public.fees FOR INSERT WITH CHECK (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can update fees" ON public.fees;
CREATE POLICY "Admins can update fees" ON public.fees FOR UPDATE USING (is_admin((SELECT auth.uid())));

-- ── icon_library ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete icon library" ON public.icon_library;
CREATE POLICY "Admins can delete icon library" ON public.icon_library FOR DELETE USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can insert icon library" ON public.icon_library;
CREATE POLICY "Admins can insert icon library" ON public.icon_library FOR INSERT WITH CHECK (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can update icon library" ON public.icon_library;
CREATE POLICY "Admins can update icon library" ON public.icon_library FOR UPDATE USING (is_admin((SELECT auth.uid())));

-- ── invitations ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete invitations" ON public.invitations;
CREATE POLICY "Admins can delete invitations" ON public.invitations FOR DELETE USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can insert invitations" ON public.invitations;
CREATE POLICY "Admins can insert invitations" ON public.invitations FOR INSERT WITH CHECK (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can update invitations" ON public.invitations;
CREATE POLICY "Admins can update invitations" ON public.invitations FOR UPDATE USING (is_admin((SELECT auth.uid())));

-- ── invoice_fees ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete invoice_fees" ON public.invoice_fees;
CREATE POLICY "Admins can delete invoice_fees" ON public.invoice_fees FOR DELETE USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can insert invoice_fees" ON public.invoice_fees;
CREATE POLICY "Admins can insert invoice_fees" ON public.invoice_fees FOR INSERT WITH CHECK (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can update invoice_fees" ON public.invoice_fees;
CREATE POLICY "Admins can update invoice_fees" ON public.invoice_fees FOR UPDATE USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Translators can delete own invoice_fees" ON public.invoice_fees;
CREATE POLICY "Translators can delete own invoice_fees" ON public.invoice_fees FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM invoices
    WHERE invoices.id = invoice_fees.invoice_id
      AND invoices.translator = (SELECT profiles.display_name FROM profiles WHERE profiles.id = (SELECT auth.uid()))
  )
);

DROP POLICY IF EXISTS "Translators can insert own invoice_fees" ON public.invoice_fees;
CREATE POLICY "Translators can insert own invoice_fees" ON public.invoice_fees FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM invoices
    WHERE invoices.id = invoice_fees.invoice_id
      AND invoices.translator = (SELECT profiles.display_name FROM profiles WHERE profiles.id = (SELECT auth.uid()))
  )
);

-- ── invoices ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete invoices" ON public.invoices;
CREATE POLICY "Admins can delete invoices" ON public.invoices FOR DELETE USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can insert invoices" ON public.invoices;
CREATE POLICY "Admins can insert invoices" ON public.invoices FOR INSERT WITH CHECK (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can update invoices" ON public.invoices;
CREATE POLICY "Admins can update invoices" ON public.invoices FOR UPDATE USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Translators can insert own invoices" ON public.invoices;
CREATE POLICY "Translators can insert own invoices" ON public.invoices FOR INSERT WITH CHECK (
  translator = (SELECT profiles.display_name FROM profiles WHERE profiles.id = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Translators can update own invoices" ON public.invoices;
CREATE POLICY "Translators can update own invoices" ON public.invoices FOR UPDATE USING (
  translator = (SELECT profiles.display_name FROM profiles WHERE profiles.id = (SELECT auth.uid()))
);

-- ── member_translator_settings ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete translator settings" ON public.member_translator_settings;
CREATE POLICY "Admins can delete translator settings" ON public.member_translator_settings FOR DELETE USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can insert translator settings" ON public.member_translator_settings;
CREATE POLICY "Admins can insert translator settings" ON public.member_translator_settings FOR INSERT WITH CHECK (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can update translator settings" ON public.member_translator_settings;
CREATE POLICY "Admins can update translator settings" ON public.member_translator_settings FOR UPDATE USING (is_admin((SELECT auth.uid())));

-- ── ops_incidents ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete ops incidents" ON public.ops_incidents;
CREATE POLICY "Admins can delete ops incidents" ON public.ops_incidents FOR DELETE USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can insert ops incidents" ON public.ops_incidents;
CREATE POLICY "Admins can insert ops incidents" ON public.ops_incidents FOR INSERT WITH CHECK (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can update ops incidents" ON public.ops_incidents;
CREATE POLICY "Admins can update ops incidents" ON public.ops_incidents FOR UPDATE USING (is_admin((SELECT auth.uid())));

-- ── permission_settings ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Executives can insert permissions" ON public.permission_settings;
CREATE POLICY "Executives can insert permissions" ON public.permission_settings FOR INSERT WITH CHECK (has_role((SELECT auth.uid()), 'executive'::app_role));

DROP POLICY IF EXISTS "Executives can update permissions" ON public.permission_settings;
CREATE POLICY "Executives can update permissions" ON public.permission_settings FOR UPDATE USING (has_role((SELECT auth.uid()), 'executive'::app_role)) WITH CHECK (has_role((SELECT auth.uid()), 'executive'::app_role));

-- ── profiles ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));

-- ── user_roles ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT WITH CHECK (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE USING (is_admin((SELECT auth.uid())));

-- ── user_slack_meta ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "user_slack_meta_delete_own" ON public.user_slack_meta;
CREATE POLICY "user_slack_meta_delete_own" ON public.user_slack_meta FOR DELETE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_slack_meta_select_own" ON public.user_slack_meta;
CREATE POLICY "user_slack_meta_select_own" ON public.user_slack_meta FOR SELECT USING ((SELECT auth.uid()) = user_id);
