-- 每人每專案 AI 批次翻譯設定（跨分頁／裝置）
create table if not exists public.cat_ai_user_batch_prefs (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null,
  env text not null default 'production',
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id, env)
);

comment on table public.cat_ai_user_batch_prefs is
  'CAT AI 批次 Modal：每位使用者在每專案的上次設定（prefs jsonb）';

alter table public.cat_ai_user_batch_prefs enable row level security;

drop policy if exists "cat_ai_user_batch_prefs_own_rw" on public.cat_ai_user_batch_prefs;
create policy "cat_ai_user_batch_prefs_own_rw" on public.cat_ai_user_batch_prefs
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 專案級 batch_ref_options（首次預設；user prefs 優先）
alter table public.cat_ai_project_settings
  add column if not exists batch_ref_options jsonb not null default '{}'::jsonb;

comment on column public.cat_ai_project_settings.batch_ref_options is
  '專案級 AI 批次參照來源預設勾選（user×project prefs 覆寫）';
