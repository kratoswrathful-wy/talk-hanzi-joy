create table if not exists public.cat_ai_guidelines (
  id bigserial primary key,
  content text not null default '',
  category text not null default '通用',
  mutex_group text,
  sort_order integer not null default 0,
  scope text not null default 'translation',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table if not exists public.cat_ai_category_tags (
  id bigserial primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.cat_ai_settings (
  id integer primary key,
  api_key text not null default '',
  api_base_url text not null default '',
  model text not null default 'gpt-4.1-mini',
  batch_size integer not null default 20,
  prefer_openai_proxy boolean not null default true,
  prompts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.cat_ai_project_settings (
  project_id uuid primary key references public.cat_projects(id) on delete cascade,
  selected_guideline_ids bigint[] not null default '{}',
  selected_style_guideline_ids bigint[] not null default '{}',
  special_instructions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.cat_ai_style_examples (
  id bigserial primary key,
  source_lang text not null default '',
  target_lang text not null default '',
  categories jsonb not null default '[]'::jsonb,
  mod_tags jsonb not null default '[]'::jsonb,
  source_text text not null default '',
  ai_draft text not null default '',
  user_final text not null default '',
  edit_notes jsonb not null default '[]'::jsonb,
  context_prev text not null default '',
  context_next text not null default '',
  seg_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index if not exists cat_ai_guidelines_scope_idx on public.cat_ai_guidelines(scope);
create index if not exists cat_ai_guidelines_mutex_idx on public.cat_ai_guidelines(mutex_group);
create index if not exists cat_ai_style_examples_seg_idx on public.cat_ai_style_examples(seg_id);

alter table public.cat_ai_guidelines enable row level security;
alter table public.cat_ai_category_tags enable row level security;
alter table public.cat_ai_settings enable row level security;
alter table public.cat_ai_project_settings enable row level security;
alter table public.cat_ai_style_examples enable row level security;

drop policy if exists "cat_ai_guidelines_rw_authenticated" on public.cat_ai_guidelines;
create policy "cat_ai_guidelines_rw_authenticated" on public.cat_ai_guidelines
for all using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "cat_ai_category_tags_rw_authenticated" on public.cat_ai_category_tags;
create policy "cat_ai_category_tags_rw_authenticated" on public.cat_ai_category_tags
for all using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "cat_ai_settings_rw_authenticated" on public.cat_ai_settings;
create policy "cat_ai_settings_rw_authenticated" on public.cat_ai_settings
for all using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "cat_ai_project_settings_rw_authenticated" on public.cat_ai_project_settings;
create policy "cat_ai_project_settings_rw_authenticated" on public.cat_ai_project_settings
for all using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "cat_ai_style_examples_rw_authenticated" on public.cat_ai_style_examples;
create policy "cat_ai_style_examples_rw_authenticated" on public.cat_ai_style_examples
for all using (auth.uid() is not null)
with check (auth.uid() is not null);

insert into public.cat_ai_category_tags(name)
values ('通用')
on conflict (name) do nothing;

