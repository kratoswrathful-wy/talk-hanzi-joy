-- 線上 TB 分頁：一個術語庫可掛多個 Google 試算表來源
alter table public.cat_tbs
  add column if not exists online_tabs jsonb not null default '[]'::jsonb;

comment on column public.cat_tbs.online_tabs is '線上來源分頁陣列，每筆含 id/name/url/config/lastFetched/lastError';
