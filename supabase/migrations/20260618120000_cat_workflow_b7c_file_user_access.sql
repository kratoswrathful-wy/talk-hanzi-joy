-- B-7c：每人每檔最後開啟時間（儀表板「最近使用」與「我的受派檔案」排序）

CREATE TABLE IF NOT EXISTS public.cat_file_user_access (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES public.cat_files(id) ON DELETE CASCADE,
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, file_id)
);

CREATE INDEX IF NOT EXISTS cat_file_user_access_user_last_idx
  ON public.cat_file_user_access (user_id, last_opened_at DESC);

COMMENT ON TABLE public.cat_file_user_access IS
  'B-7c：使用者最後開啟 CAT 檔案時間；驅動儀表板「最近使用」與受派檔案「最後使用時間」。';

ALTER TABLE public.cat_file_user_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cat_file_user_access_own_rw" ON public.cat_file_user_access;
CREATE POLICY "cat_file_user_access_own_rw" ON public.cat_file_user_access
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cat_file_user_access TO authenticated;
