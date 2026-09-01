-- Scheme A：對齊正式庫 schema_migrations.statements（原 placeholder 為 SELECT 1）。
-- 允許譯者自行 INSERT 本人 cat_file_assignments（承接本案流程）。
-- 較完整註解版見 20260430074500；本版與正式庫 20260429234626 語意一致。

DROP POLICY IF EXISTS "cat_file_assignments_self_insert" ON public.cat_file_assignments;
CREATE POLICY "cat_file_assignments_self_insert"
  ON public.cat_file_assignments
  FOR INSERT
  WITH CHECK (assignee_user_id = auth.uid());
