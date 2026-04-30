-- CAT 專案：客戶提問表單 Google Sheets 欄位對應（管理者預設）
ALTER TABLE public.cat_projects
  ADD COLUMN IF NOT EXISTS client_question_form_columns jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.cat_projects.client_question_form_columns IS 'Maps CAT segment fields to sheet columns for clipboard paste (admin defaults).';
