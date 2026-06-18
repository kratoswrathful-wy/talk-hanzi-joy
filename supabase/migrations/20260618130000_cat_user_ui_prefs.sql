-- Task 1（B-7d 儀表板偏好）：使用者介面偏好持久化
-- 儲存每位使用者的儀表板偏好（「隱藏已完成」預設勾選）

CREATE TABLE IF NOT EXISTS public.cat_user_ui_prefs (
  user_id            uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hide_completed_dashboard boolean NOT NULL DEFAULT true,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

ALTER TABLE public.cat_user_ui_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cat_user_ui_prefs_own" ON public.cat_user_ui_prefs;
CREATE POLICY "cat_user_ui_prefs_own"
  ON public.cat_user_ui_prefs
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.cat_user_ui_prefs TO authenticated;
