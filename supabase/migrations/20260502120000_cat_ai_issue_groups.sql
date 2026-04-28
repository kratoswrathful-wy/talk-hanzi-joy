-- 議題群組：與互斥群組分立；scope 區分 translation / style / project（專案綁定 project_id）
create table if not exists public.cat_ai_issue_groups (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('translation', 'style', 'project')),
  project_id uuid references public.cat_projects(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint cat_ai_issue_groups_scope_project_ck check (
    (scope in ('translation', 'style') and project_id is null)
    or (scope = 'project' and project_id is not null)
  )
);

create unique index if not exists cat_ai_issue_groups_translation_style_name_uq
  on public.cat_ai_issue_groups (scope, name)
  where scope in ('translation', 'style');

create unique index if not exists cat_ai_issue_groups_project_name_uq
  on public.cat_ai_issue_groups (project_id, name)
  where scope = 'project';

alter table public.cat_ai_guidelines
  add column if not exists issue_group_id uuid references public.cat_ai_issue_groups(id) on delete set null;

create index if not exists cat_ai_guidelines_issue_group_id_idx on public.cat_ai_guidelines(issue_group_id);

alter table public.cat_ai_issue_groups enable row level security;

drop policy if exists "cat_ai_issue_groups_rw_authenticated" on public.cat_ai_issue_groups;
create policy "cat_ai_issue_groups_rw_authenticated" on public.cat_ai_issue_groups
for all using (auth.uid() is not null)
with check (auth.uid() is not null);
