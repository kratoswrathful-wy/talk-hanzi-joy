-- 標籤僅自管理清單「隱藏」時保留列（list_hidden），供復原；一併從參考移除時仍刪列並掃描準則／學習範例。
alter table public.cat_ai_category_tags
  add column if not exists list_hidden boolean not null default false;
