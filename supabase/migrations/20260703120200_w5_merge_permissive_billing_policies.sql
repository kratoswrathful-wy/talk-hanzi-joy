-- W5-3：合併 invoice_fees / invoices 上「同一命令」的兩條 permissive policy。
-- Postgres 對同命令的多條 permissive policy 本就以 OR 結合，因此「Admins…」OR「Translators…」
-- 合併為單條、條件以 OR 串接，判斷結果完全等價（行為不變），僅減少每次查詢的 policy 評估數量，
-- 消除 advisors performance: multiple_permissive_policies 警告。
--
-- 註：cat_annotation_options / cat_assignments / cat_file_assignments / cat_view_assignments
-- 屬「ALL policy 與特定命令 policy 重疊」，無法單純 OR 合併（需拆分 ALL 語意，屬安全語意變更），
-- 不在本次範圍，另行評估。詳見 docs/ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md。

-- ── invoice_fees：DELETE ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete invoice_fees" ON public.invoice_fees;
DROP POLICY IF EXISTS "Translators can delete own invoice_fees" ON public.invoice_fees;
DROP POLICY IF EXISTS "invoice_fees_delete" ON public.invoice_fees;
CREATE POLICY "invoice_fees_delete" ON public.invoice_fees FOR DELETE USING (
  (is_admin((SELECT auth.uid())) AND env = current_env())
  OR
  (env = current_env() AND EXISTS (
    SELECT 1 FROM invoices
    WHERE invoices.id = invoice_fees.invoice_id
      AND invoices.translator = (SELECT profiles.display_name FROM profiles WHERE profiles.id = (SELECT auth.uid()))
  ))
);

-- ── invoice_fees：INSERT ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can insert invoice_fees" ON public.invoice_fees;
DROP POLICY IF EXISTS "Translators can insert own invoice_fees" ON public.invoice_fees;
DROP POLICY IF EXISTS "invoice_fees_insert" ON public.invoice_fees;
CREATE POLICY "invoice_fees_insert" ON public.invoice_fees FOR INSERT WITH CHECK (
  (is_admin((SELECT auth.uid())) AND env = current_env())
  OR
  (env = current_env() AND EXISTS (
    SELECT 1 FROM invoices
    WHERE invoices.id = invoice_fees.invoice_id
      AND invoices.translator = (SELECT profiles.display_name FROM profiles WHERE profiles.id = (SELECT auth.uid()))
  ))
);

-- ── invoices：INSERT ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Translators can insert own invoices" ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert" ON public.invoices;
CREATE POLICY "invoices_insert" ON public.invoices FOR INSERT WITH CHECK (
  (is_admin((SELECT auth.uid())) AND env = current_env())
  OR
  (env = current_env() AND translator = (SELECT profiles.display_name FROM profiles WHERE profiles.id = (SELECT auth.uid())))
);

-- ── invoices：UPDATE ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Translators can update own invoices" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update" ON public.invoices;
CREATE POLICY "invoices_update" ON public.invoices FOR UPDATE USING (
  (is_admin((SELECT auth.uid())) AND env = current_env())
  OR
  (env = current_env() AND translator = (SELECT profiles.display_name FROM profiles WHERE profiles.id = (SELECT auth.uid())))
);
