-- 線上 TB（Google 試算表 CSV）：來源型別、鎖定、網址、欄位映射設定
alter table public.cat_tbs
  add column if not exists source_type text not null default 'manual',
  add column if not exists source_type_locked boolean not null default false,
  add column if not exists google_sheet_url text not null default '',
  add column if not exists online_import_config jsonb not null default '{}'::jsonb;

comment on column public.cat_tbs.source_type is 'manual | online';
comment on column public.cat_tbs.source_type_locked is '性質鎖定（與既有術語列規則併用）';
comment on column public.cat_tbs.google_sheet_url is '使用者貼上的 Google 試算表連結（擷取／更新）';
comment on column public.cat_tbs.online_import_config is '線上匯入欄位映射等 JSON，供「更新」預填';
