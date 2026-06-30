-- QA 結果表顯示位置：個人偏好（跨檔案、跨專案、跨裝置）

ALTER TABLE public.cat_user_ui_prefs
  ADD COLUMN IF NOT EXISTS qa_report_surface text NOT NULL DEFAULT 'bottom'
  CHECK (qa_report_surface IN ('bottom', 'right', 'both'));

COMMENT ON COLUMN public.cat_user_ui_prefs.qa_report_surface IS
  'CAT QA 結果表顯示：bottom=僅下方寬面板, right=僅右側, both=兩邊同時';
