-- W5-2：修正兩條在 20260502140000_rls_initplan_fix.sql 之後才新增、仍裸呼 auth.uid() 的 policy。
-- 裸呼 auth.uid() 會逐列重算；改為 (SELECT auth.uid()) 可讓 Postgres 每個 statement 只算一次
-- （initplan 快取）。純效能改善，權限判斷結果不變。
-- 對應 Supabase advisors performance: auth_rls_initplan。

-- cat_translator_question_form_prefs（角色為 authenticated，須保留 TO authenticated）
DROP POLICY IF EXISTS "cat_translator_qf_prefs_own_all" ON public.cat_translator_question_form_prefs;
CREATE POLICY "cat_translator_qf_prefs_own_all" ON public.cat_translator_question_form_prefs
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- cat_user_segment_markers
DROP POLICY IF EXISTS "cat_user_segment_markers_owner" ON public.cat_user_segment_markers;
CREATE POLICY "cat_user_segment_markers_owner" ON public.cat_user_segment_markers
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
