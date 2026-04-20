-- 為 cat_segments 加入 XLIFF tag 資料欄位
-- source_tags / target_tags：JSONB 陣列，對應 xliff-tag-pipeline 產出的 tag 物件
-- 供 CAT tool team 模式儲存並讀回 tag pill（mqxliff literal / sdlxliff / 一般 XLIFF）

alter table public.cat_segments
  add column if not exists source_tags jsonb not null default '[]'::jsonb;

alter table public.cat_segments
  add column if not exists target_tags jsonb not null default '[]'::jsonb;
