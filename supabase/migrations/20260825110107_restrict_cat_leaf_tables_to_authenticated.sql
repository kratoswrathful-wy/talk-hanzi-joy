-- CAT 句段葉子表僅供已登入使用者存取。
-- 先在權限層拒絕 anon，避免 RLS 對大型資料表掃描後才回空集合／逾時。
REVOKE ALL PRIVILEGES ON TABLE public.cat_segments FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.cat_tm_segments FROM anon;

-- 明確保留 CAT 前端現行 CRUD 權限，避免依賴專案建立資料表時的預設 grant。
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cat_segments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cat_tm_segments TO authenticated;

DROP POLICY IF EXISTS "cat_segments_rw_authenticated" ON public.cat_segments;
CREATE POLICY "cat_segments_rw_authenticated"
ON public.cat_segments
FOR ALL
TO authenticated
USING ((SELECT auth.uid()) IS NOT NULL)
WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "cat_tm_segments_rw_authenticated" ON public.cat_tm_segments;
CREATE POLICY "cat_tm_segments_rw_authenticated"
ON public.cat_tm_segments
FOR ALL
TO authenticated
USING ((SELECT auth.uid()) IS NOT NULL)
WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
