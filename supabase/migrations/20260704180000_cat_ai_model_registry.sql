-- CAT AI 模型 registry Phase 1：四張表 + RLS + seed 預設模型
-- 團隊模式之後經外層 TMS React rpc 讀取；本機模式不讀此 registry（Phase 4）。

-- ── 1. ai_model_providers ─────────────────────────────────────────────────────

create table if not exists public.ai_model_providers (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null unique,
  display_name text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 2. ai_provider_models ─────────────────────────────────────────────────────

create table if not exists public.ai_provider_models (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null,
  model_id text not null,
  owned_by text,
  api_object text,
  provider_created_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_currently_available boolean not null default true,
  raw jsonb not null default '{}'::jsonb,
  unique (provider_key, model_id)
);

create index if not exists ai_provider_models_provider_key_idx
  on public.ai_provider_models (provider_key);

create index if not exists ai_provider_models_available_idx
  on public.ai_provider_models (provider_key, is_currently_available);

-- ── 3. cat_ai_model_options ───────────────────────────────────────────────────

create table if not exists public.cat_ai_model_options (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null default 'openai',
  model_id text not null,
  enabled boolean not null default false,
  is_default boolean not null default false,
  display_name_zh text not null,
  display_name_en text,
  usage_hint_zh text,
  usage_hint_en text,
  short_label_zh text,
  short_label_en text,
  use_case text not null default 'general',
  tier text not null default 'standard',
  sort_order integer not null default 100,
  supports_responses_api boolean not null default true,
  supports_chat_completions boolean not null default false,
  max_output_tokens integer,
  temperature numeric,
  reasoning_effort text,
  fallback_model_option_id uuid references public.cat_ai_model_options (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_key, model_id)
);

create index if not exists cat_ai_model_options_enabled_sort_idx
  on public.cat_ai_model_options (enabled, sort_order);

create unique index if not exists cat_ai_model_options_single_default_idx
  on public.cat_ai_model_options ((true))
  where is_default = true;

-- ── 4. ai_model_sync_runs ─────────────────────────────────────────────────────

create table if not exists public.ai_model_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null,
  status text not null,
  discovered_count integer not null default 0,
  new_count integer not null default 0,
  missing_count integer not null default 0,
  error_message text,
  raw jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists ai_model_sync_runs_provider_started_idx
  on public.ai_model_sync_runs (provider_key, started_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.ai_model_providers enable row level security;
alter table public.ai_provider_models enable row level security;
alter table public.cat_ai_model_options enable row level security;
alter table public.ai_model_sync_runs enable row level security;

-- ai_model_providers：已登入者可讀 enabled 供應商；executive 可管理
drop policy if exists "ai_model_providers_select_enabled" on public.ai_model_providers;
create policy "ai_model_providers_select_enabled" on public.ai_model_providers
  for select to authenticated
  using (enabled = true);

drop policy if exists "ai_model_providers_manage_executive" on public.ai_model_providers;
create policy "ai_model_providers_manage_executive" on public.ai_model_providers
  for all to authenticated
  using (public.has_role((select auth.uid()), 'executive'::public.app_role))
  with check (public.has_role((select auth.uid()), 'executive'::public.app_role));

-- ai_provider_models：已登入者可讀（供外層 rpc join 可用性）；寫入僅 service role（無 authenticated 寫入 policy）
drop policy if exists "ai_provider_models_select_authenticated" on public.ai_provider_models;
create policy "ai_provider_models_select_authenticated" on public.ai_provider_models
  for select to authenticated
  using (true);

-- cat_ai_model_options：已登入者可讀 enabled；executive 可讀寫全部（含待審核草稿）
drop policy if exists "cat_ai_model_options_select_enabled" on public.cat_ai_model_options;
create policy "cat_ai_model_options_select_enabled" on public.cat_ai_model_options
  for select to authenticated
  using (enabled = true);

drop policy if exists "cat_ai_model_options_select_executive" on public.cat_ai_model_options;
create policy "cat_ai_model_options_select_executive" on public.cat_ai_model_options
  for select to authenticated
  using (public.has_role((select auth.uid()), 'executive'::public.app_role));

drop policy if exists "cat_ai_model_options_manage_executive" on public.cat_ai_model_options;
create policy "cat_ai_model_options_manage_executive" on public.cat_ai_model_options
  for insert to authenticated
  with check (public.has_role((select auth.uid()), 'executive'::public.app_role));

drop policy if exists "cat_ai_model_options_update_executive" on public.cat_ai_model_options;
create policy "cat_ai_model_options_update_executive" on public.cat_ai_model_options
  for update to authenticated
  using (public.has_role((select auth.uid()), 'executive'::public.app_role))
  with check (public.has_role((select auth.uid()), 'executive'::public.app_role));

drop policy if exists "cat_ai_model_options_delete_executive" on public.cat_ai_model_options;
create policy "cat_ai_model_options_delete_executive" on public.cat_ai_model_options
  for delete to authenticated
  using (public.has_role((select auth.uid()), 'executive'::public.app_role));

-- ai_model_sync_runs：executive 可讀同步紀錄；寫入僅 service role
drop policy if exists "ai_model_sync_runs_select_executive" on public.ai_model_sync_runs;
create policy "ai_model_sync_runs_select_executive" on public.ai_model_sync_runs
  for select to authenticated
  using (public.has_role((select auth.uid()), 'executive'::public.app_role));

-- ── Seed：OpenAI 供應商 + 預設模型 gpt-4.1-mini ─────────────────────────────
-- 與 cat_ai_settings.model 預設一致；Phase 2 同步前至少有一顆可用預設。
-- seed 前應確認 production OPENAI_API_KEY 可呼叫此模型（與 cat-openai proxy 一致）。

insert into public.ai_model_providers (provider_key, display_name, enabled)
values ('openai', 'OpenAI', true)
on conflict (provider_key) do update
  set display_name = excluded.display_name,
      enabled = excluded.enabled,
      updated_at = now();

insert into public.ai_provider_models (
  provider_key,
  model_id,
  owned_by,
  api_object,
  is_currently_available,
  raw
)
values (
  'openai',
  'gpt-4.1-mini',
  'openai',
  'model',
  true,
  '{}'::jsonb
)
on conflict (provider_key, model_id) do update
  set is_currently_available = true,
      last_seen_at = now();

insert into public.cat_ai_model_options (
  provider_key,
  model_id,
  enabled,
  is_default,
  display_name_zh,
  display_name_en,
  usage_hint_zh,
  short_label_zh,
  use_case,
  tier,
  sort_order,
  supports_responses_api,
  supports_chat_completions
)
values (
  'openai',
  'gpt-4.1-mini',
  true,
  false,
  'GPT-4.1 mini',
  'GPT-4.1 mini',
  '快速省錢，適合大量預翻、一般句段初稿與低成本批次處理。',
  '快速省錢',
  'pretranslate',
  'fast',
  10,
  true,
  true
)
on conflict (provider_key, model_id) do update
  set display_name_zh = excluded.display_name_zh,
      display_name_en = excluded.display_name_en,
      usage_hint_zh = excluded.usage_hint_zh,
      short_label_zh = excluded.short_label_zh,
      use_case = excluded.use_case,
      tier = excluded.tier,
      sort_order = excluded.sort_order,
      supports_chat_completions = excluded.supports_chat_completions,
      enabled = true,
      updated_at = now();

update public.cat_ai_model_options
set is_default = true,
    updated_at = now()
where provider_key = 'openai'
  and model_id = 'gpt-4.1-mini'
  and not exists (
    select 1 from public.cat_ai_model_options o
    where o.is_default = true
      and o.id <> public.cat_ai_model_options.id
  );
