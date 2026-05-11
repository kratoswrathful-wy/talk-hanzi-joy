-- 專案 AI 指示與檔案特殊指示分欄
-- 既有 special_instructions 內容視為專案 AI 指示：移入 project_ai_instructions 後將 special_instructions 清空。
-- 各檔 applicable_special_instruction_ids 清空（舊 id 語意已變，PM 需於「檔案特殊指示」重新指定套用檔）。

alter table public.cat_ai_project_settings
  add column if not exists project_ai_instructions jsonb not null default '[]'::jsonb;

update public.cat_ai_project_settings
set
  project_ai_instructions = coalesce(special_instructions, '[]'::jsonb),
  special_instructions = '[]'::jsonb
where coalesce(jsonb_array_length(project_ai_instructions), 0) = 0
  and coalesce(jsonb_array_length(special_instructions), 0) > 0;

update public.cat_files
set applicable_special_instruction_ids = '[]'::jsonb;

comment on column public.cat_ai_project_settings.special_instructions is '檔案特殊指示（JSON 陣列）；id 僅與 cat_files.applicable_special_instruction_ids 對應。';
comment on column public.cat_ai_project_settings.project_ai_instructions is '專案 AI 指示（JSON 陣列）；僅於 AI 批次設定編輯，不依檔案套用。';
