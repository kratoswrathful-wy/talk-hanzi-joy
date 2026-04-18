-- 區分使用者手動鎖定與匯入／系統鎖定（與離線 Dexie 欄位對齊）
alter table public.cat_segments
  add column if not exists is_locked_user boolean not null default false;

alter table public.cat_segments
  add column if not exists is_locked_system boolean not null default false;

-- 歷史 is_locked 無法區分來源，一律視為系統／匯入鎖
update public.cat_segments
set is_locked_system = true
where coalesce(is_locked, false) = true;

update public.cat_segments
set is_locked = (coalesce(is_locked_user, false) or coalesce(is_locked_system, false));
