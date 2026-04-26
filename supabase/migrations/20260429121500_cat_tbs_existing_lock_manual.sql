-- 現存 cat_tbs：補欄位（若前一支 migration 尚未套用）並一律鎖定為「離線手動維護」
-- 僅資料庫 schema／資料，不影響應用程式原始碼邏輯。

alter table public.cat_tbs
  add column if not exists source_type text not null default 'manual',
  add column if not exists source_type_locked boolean not null default false,
  add column if not exists google_sheet_url text not null default '',
  add column if not exists online_import_config jsonb not null default '{}'::jsonb;

update public.cat_tbs
set
  source_type = 'manual',
  source_type_locked = true,
  last_modified = now();

comment on column public.cat_tbs.source_type_locked is 'true：離線／線上性質已鎖定（現存列預設為 true）';
