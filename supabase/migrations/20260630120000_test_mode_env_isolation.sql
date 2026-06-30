-- 測試模式（環境隔離）基礎 migration
-- 設計文件：docs/CAT_LMS_TEST_MODE_IMPL_PLAN_2026-06.md
--
-- 內容：
--   1. profiles.is_test 旗標（標記假帳號；假帳號永遠屬於 env=test）
--   2. public.current_env()：依登入者 is_test 回傳 'test'/'production'（供 RLS 使用）
--   3. cat_files.env 欄位 + 索引 + 從母專案 backfill
--   4. CAT env 複合索引
--   5. 既有測試帳號（@test.local）標記為 is_test
--   6. 對「已有 env 欄」的表 + cat_files 的 RLS 併入 env = current_env() 把關
--
-- 安全說明：
--   - current_env() 預設回 'production'（未登入、無 profile、is_test 非 true 皆然），
--     對既有正式使用者行為等同今日（前端本來就 .eq("env","production")），不會鎖死正式資料。
--   - cases UPDATE 維持「已登入皆可改」但加上同 env 限制，避免破壞譯者協作列更新；
--     是否進一步限縮為 PM/相關人留待後續（見設計文件待決）。

-- ── 1. profiles.is_test ────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_test IS '測試帳號（假人）旗標；true 代表此帳號在系統中一律屬於測試環境（env=test）。';

-- ── 2. current_env() ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_env()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN (SELECT p.is_test FROM public.profiles p WHERE p.id = auth.uid()) IS TRUE
      THEN 'test'
    ELSE 'production'
  END;
$$;

COMMENT ON FUNCTION public.current_env() IS '回傳目前登入者所屬環境：測試帳號為 test，其餘為 production。供 RLS 強制環境隔離。';

GRANT EXECUTE ON FUNCTION public.current_env() TO authenticated, anon, service_role;

-- ── 3. cat_files.env ───────────────────────────────────────────────────────────
ALTER TABLE public.cat_files
  ADD COLUMN IF NOT EXISTS env text NOT NULL DEFAULT 'production';

-- 從母專案回填既有檔案的 env
UPDATE public.cat_files f
  SET env = p.env
  FROM public.cat_projects p
  WHERE f.project_id = p.id
    AND f.env IS DISTINCT FROM p.env;

-- ── 4. CAT env 索引 ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cat_projects_env_created ON public.cat_projects (env, created_at);
CREATE INDEX IF NOT EXISTS idx_cat_tms_env_created ON public.cat_tms (env, created_at);
CREATE INDEX IF NOT EXISTS idx_cat_tbs_env_created ON public.cat_tbs (env, created_at);
CREATE INDEX IF NOT EXISTS idx_cat_files_env_project ON public.cat_files (env, project_id);

-- ── 5. 既有測試帳號標記 ─────────────────────────────────────────────────────────
UPDATE public.profiles
  SET is_test = true
  WHERE email LIKE '%@test.local'
    AND is_test = false;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. RLS：對已有 env 欄的表 + cat_files 併入 env = public.current_env()
-- ════════════════════════════════════════════════════════════════════════════

-- ── cases ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone authenticated can read cases" ON public.cases;
CREATE POLICY "Anyone authenticated can read cases" ON public.cases
  FOR SELECT TO authenticated
  USING (env = public.current_env());

DROP POLICY IF EXISTS "Anyone authenticated can update cases" ON public.cases;
CREATE POLICY "Anyone authenticated can update cases" ON public.cases
  FOR UPDATE TO authenticated
  USING (env = public.current_env())
  WITH CHECK (env = public.current_env());

DROP POLICY IF EXISTS "Admins can insert cases" ON public.cases;
CREATE POLICY "Admins can insert cases" ON public.cases
  FOR INSERT
  WITH CHECK (is_admin((SELECT auth.uid())) AND env = public.current_env());

DROP POLICY IF EXISTS "Admins can delete cases" ON public.cases;
CREATE POLICY "Admins can delete cases" ON public.cases
  FOR DELETE
  USING (is_admin((SELECT auth.uid())) AND env = public.current_env());

-- ── fees ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read fees" ON public.fees;
CREATE POLICY "Authenticated users can read fees" ON public.fees
  FOR SELECT TO authenticated
  USING (env = public.current_env());

DROP POLICY IF EXISTS "Admins can insert fees" ON public.fees;
CREATE POLICY "Admins can insert fees" ON public.fees
  FOR INSERT
  WITH CHECK (is_admin((SELECT auth.uid())) AND env = public.current_env());

DROP POLICY IF EXISTS "Admins can update fees" ON public.fees;
CREATE POLICY "Admins can update fees" ON public.fees
  FOR UPDATE
  USING (is_admin((SELECT auth.uid())) AND env = public.current_env());

DROP POLICY IF EXISTS "Admins can delete fees" ON public.fees;
CREATE POLICY "Admins can delete fees" ON public.fees
  FOR DELETE
  USING (is_admin((SELECT auth.uid())) AND env = public.current_env());

-- ── invoices ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read invoices" ON public.invoices;
CREATE POLICY "Authenticated users can read invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (env = public.current_env());

DROP POLICY IF EXISTS "Admins can insert invoices" ON public.invoices;
CREATE POLICY "Admins can insert invoices" ON public.invoices
  FOR INSERT
  WITH CHECK (is_admin((SELECT auth.uid())) AND env = public.current_env());

DROP POLICY IF EXISTS "Admins can update invoices" ON public.invoices;
CREATE POLICY "Admins can update invoices" ON public.invoices
  FOR UPDATE
  USING (is_admin((SELECT auth.uid())) AND env = public.current_env());

DROP POLICY IF EXISTS "Admins can delete invoices" ON public.invoices;
CREATE POLICY "Admins can delete invoices" ON public.invoices
  FOR DELETE
  USING (is_admin((SELECT auth.uid())) AND env = public.current_env());

DROP POLICY IF EXISTS "Translators can insert own invoices" ON public.invoices;
CREATE POLICY "Translators can insert own invoices" ON public.invoices
  FOR INSERT
  WITH CHECK (
    env = public.current_env()
    AND translator = (SELECT profiles.display_name FROM profiles WHERE profiles.id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Translators can update own invoices" ON public.invoices;
CREATE POLICY "Translators can update own invoices" ON public.invoices
  FOR UPDATE
  USING (
    env = public.current_env()
    AND translator = (SELECT profiles.display_name FROM profiles WHERE profiles.id = (SELECT auth.uid()))
  );

-- ── invoice_fees ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read invoice_fees" ON public.invoice_fees;
CREATE POLICY "Authenticated users can read invoice_fees" ON public.invoice_fees
  FOR SELECT TO authenticated
  USING (env = public.current_env());

DROP POLICY IF EXISTS "Admins can insert invoice_fees" ON public.invoice_fees;
CREATE POLICY "Admins can insert invoice_fees" ON public.invoice_fees
  FOR INSERT
  WITH CHECK (is_admin((SELECT auth.uid())) AND env = public.current_env());

DROP POLICY IF EXISTS "Admins can update invoice_fees" ON public.invoice_fees;
CREATE POLICY "Admins can update invoice_fees" ON public.invoice_fees
  FOR UPDATE
  USING (is_admin((SELECT auth.uid())) AND env = public.current_env());

DROP POLICY IF EXISTS "Admins can delete invoice_fees" ON public.invoice_fees;
CREATE POLICY "Admins can delete invoice_fees" ON public.invoice_fees
  FOR DELETE
  USING (is_admin((SELECT auth.uid())) AND env = public.current_env());

DROP POLICY IF EXISTS "Translators can insert own invoice_fees" ON public.invoice_fees;
CREATE POLICY "Translators can insert own invoice_fees" ON public.invoice_fees
  FOR INSERT
  WITH CHECK (
    env = public.current_env()
    AND EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_fees.invoice_id
        AND invoices.translator = (SELECT profiles.display_name FROM profiles WHERE profiles.id = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Translators can delete own invoice_fees" ON public.invoice_fees;
CREATE POLICY "Translators can delete own invoice_fees" ON public.invoice_fees
  FOR DELETE
  USING (
    env = public.current_env()
    AND EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_fees.invoice_id
        AND invoices.translator = (SELECT profiles.display_name FROM profiles WHERE profiles.id = (SELECT auth.uid()))
    )
  );

-- ── client_invoices ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can select client_invoices" ON public.client_invoices;
CREATE POLICY "Admins can select client_invoices" ON public.client_invoices
  FOR SELECT
  USING (is_admin((SELECT auth.uid())) AND env = public.current_env());

DROP POLICY IF EXISTS "Admins can insert client_invoices" ON public.client_invoices;
CREATE POLICY "Admins can insert client_invoices" ON public.client_invoices
  FOR INSERT
  WITH CHECK (is_admin((SELECT auth.uid())) AND env = public.current_env());

DROP POLICY IF EXISTS "Admins can update client_invoices" ON public.client_invoices;
CREATE POLICY "Admins can update client_invoices" ON public.client_invoices
  FOR UPDATE
  USING (is_admin((SELECT auth.uid())) AND env = public.current_env());

DROP POLICY IF EXISTS "Admins can delete client_invoices" ON public.client_invoices;
CREATE POLICY "Admins can delete client_invoices" ON public.client_invoices
  FOR DELETE
  USING (is_admin((SELECT auth.uid())) AND env = public.current_env());

-- ── client_invoice_fees ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can select client_invoice_fees" ON public.client_invoice_fees;
CREATE POLICY "Admins can select client_invoice_fees" ON public.client_invoice_fees
  FOR SELECT
  USING (is_admin((SELECT auth.uid())) AND env = public.current_env());

DROP POLICY IF EXISTS "Admins can insert client_invoice_fees" ON public.client_invoice_fees;
CREATE POLICY "Admins can insert client_invoice_fees" ON public.client_invoice_fees
  FOR INSERT
  WITH CHECK (is_admin((SELECT auth.uid())) AND env = public.current_env());

DROP POLICY IF EXISTS "Admins can update client_invoice_fees" ON public.client_invoice_fees;
CREATE POLICY "Admins can update client_invoice_fees" ON public.client_invoice_fees
  FOR UPDATE
  USING (is_admin((SELECT auth.uid())) AND env = public.current_env());

DROP POLICY IF EXISTS "Admins can delete client_invoice_fees" ON public.client_invoice_fees;
CREATE POLICY "Admins can delete client_invoice_fees" ON public.client_invoice_fees
  FOR DELETE
  USING (is_admin((SELECT auth.uid())) AND env = public.current_env());

-- ── internal_notes ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view internal notes" ON public.internal_notes;
CREATE POLICY "Authenticated users can view internal notes" ON public.internal_notes
  FOR SELECT TO authenticated
  USING (env = public.current_env());

DROP POLICY IF EXISTS "Authenticated users can insert internal notes" ON public.internal_notes;
CREATE POLICY "Authenticated users can insert internal notes" ON public.internal_notes
  FOR INSERT TO authenticated
  WITH CHECK (env = public.current_env());

DROP POLICY IF EXISTS "Authenticated users can update internal notes" ON public.internal_notes;
CREATE POLICY "Authenticated users can update internal notes" ON public.internal_notes
  FOR UPDATE TO authenticated
  USING (env = public.current_env())
  WITH CHECK (env = public.current_env());

DROP POLICY IF EXISTS "Authenticated users can delete internal notes" ON public.internal_notes;
CREATE POLICY "Authenticated users can delete internal notes" ON public.internal_notes
  FOR DELETE TO authenticated
  USING (env = public.current_env());

-- ── icon_library ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone authenticated can read icon library" ON public.icon_library;
CREATE POLICY "Anyone authenticated can read icon library" ON public.icon_library
  FOR SELECT TO authenticated
  USING (env = public.current_env());

DROP POLICY IF EXISTS "Admins can insert icon library" ON public.icon_library;
CREATE POLICY "Admins can insert icon library" ON public.icon_library
  FOR INSERT
  WITH CHECK (is_admin((SELECT auth.uid())) AND env = public.current_env());

DROP POLICY IF EXISTS "Admins can update icon library" ON public.icon_library;
CREATE POLICY "Admins can update icon library" ON public.icon_library
  FOR UPDATE
  USING (is_admin((SELECT auth.uid())) AND env = public.current_env());

DROP POLICY IF EXISTS "Admins can delete icon library" ON public.icon_library;
CREATE POLICY "Admins can delete icon library" ON public.icon_library
  FOR DELETE
  USING (is_admin((SELECT auth.uid())) AND env = public.current_env());

-- ── permission_settings ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone authenticated can read permissions" ON public.permission_settings;
CREATE POLICY "Anyone authenticated can read permissions" ON public.permission_settings
  FOR SELECT TO authenticated
  USING (env = public.current_env());

DROP POLICY IF EXISTS "Executives can insert permissions" ON public.permission_settings;
CREATE POLICY "Executives can insert permissions" ON public.permission_settings
  FOR INSERT
  WITH CHECK (has_role((SELECT auth.uid()), 'executive'::app_role) AND env = public.current_env());

DROP POLICY IF EXISTS "Executives can update permissions" ON public.permission_settings;
CREATE POLICY "Executives can update permissions" ON public.permission_settings
  FOR UPDATE
  USING (has_role((SELECT auth.uid()), 'executive'::app_role) AND env = public.current_env())
  WITH CHECK (has_role((SELECT auth.uid()), 'executive'::app_role) AND env = public.current_env());

-- ── cat_projects ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_projects_rw_authenticated" ON public.cat_projects;
CREATE POLICY "cat_projects_rw_authenticated" ON public.cat_projects
  FOR ALL
  USING ((SELECT auth.uid()) IS NOT NULL AND env = public.current_env())
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND env = public.current_env());

-- ── cat_tms ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_tms_rw_authenticated" ON public.cat_tms;
CREATE POLICY "cat_tms_rw_authenticated" ON public.cat_tms
  FOR ALL
  USING ((SELECT auth.uid()) IS NOT NULL AND env = public.current_env())
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND env = public.current_env());

-- ── cat_tbs ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_tbs_rw_authenticated" ON public.cat_tbs;
CREATE POLICY "cat_tbs_rw_authenticated" ON public.cat_tbs
  FOR ALL
  USING ((SELECT auth.uid()) IS NOT NULL AND env = public.current_env())
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND env = public.current_env());

-- ── cat_files（新 env 欄）─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cat_files_rw_authenticated" ON public.cat_files;
CREATE POLICY "cat_files_rw_authenticated" ON public.cat_files
  FOR ALL
  USING ((SELECT auth.uid()) IS NOT NULL AND env = public.current_env())
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND env = public.current_env());
