-- 專案準則：全專案檔案共用之文字條目（與 special_instructions 分開存放）
alter table public.cat_ai_project_settings
  add column if not exists project_guidelines jsonb not null default '[]'::jsonb;
