-- 譯者個人／專案：提問表單欄位覆寫（剪貼簿對應、自訂欄、合併選項等；JSON）

CREATE TABLE IF NOT EXISTS public.cat_translator_question_form_prefs (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.cat_projects (id) ON DELETE CASCADE,
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

COMMENT ON TABLE public.cat_translator_question_form_prefs IS 'Per-user translator overrides for CAT question-form column mapping per project (clipboard paste).';

ALTER TABLE public.cat_translator_question_form_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cat_translator_qf_prefs_own_all" ON public.cat_translator_question_form_prefs;

CREATE POLICY "cat_translator_qf_prefs_own_all" ON public.cat_translator_question_form_prefs
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cat_translator_question_form_prefs TO authenticated;
