-- 中繼資料結構化與顯示對應（工項二）
-- 計畫：docs/CAT_META_EXTRA_INFO_AND_WF_STATUS_PLAN_2026-07.md
-- 注意：此 migration 待驗收方審過 schema 後再 db push（比照工項一）

ALTER TABLE public.cat_segments
  ADD COLUMN IF NOT EXISTS meta_items jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.cat_files
  ADD COLUMN IF NOT EXISTS meta_display_config jsonb;

ALTER TABLE public.cat_projects
  ADD COLUMN IF NOT EXISTS meta_display_templates jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.cat_segments.meta_items IS
  'XLIFF 等匯入的結構化中繼資料 [{sourceType,name,value}]；顯示層對應用。不影響 xliffTuId／匯出。';

COMMENT ON COLUMN public.cat_files.meta_display_config IS
  '檔案層 Key／額外資訊顯示對應 {keyItem, extraItems[], hiddenItems[]}；null=維持舊 idValue／extraValue 行為。';

COMMENT ON COLUMN public.cat_projects.meta_display_templates IS
  '專案層欄位對應範本陣列 [{name, sourceFormat, config}]。';
