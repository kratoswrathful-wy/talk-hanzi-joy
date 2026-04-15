create table if not exists public.cat_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled Project',
  source_langs text[] not null default '{}',
  target_langs text[] not null default '{}',
  read_tms text[] not null default '{}',
  write_tms text[] not null default '{}',
  change_log jsonb not null default '[]'::jsonb,
  owner_user_id uuid references public.profiles(id),
  assignment_id uuid references public.cat_assignments(id) on delete set null,
  env text not null default 'production',
  created_at timestamptz not null default now(),
  last_modified timestamptz not null default now()
);

create table if not exists public.cat_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cat_projects(id) on delete cascade,
  name text not null,
  original_file_base64 text,
  source_lang text not null default '',
  target_lang text not null default '',
  original_source_lang text not null default '',
  original_target_lang text not null default '',
  workspace_note_draft text not null default '',
  created_at timestamptz not null default now(),
  last_modified timestamptz not null default now()
);

create table if not exists public.cat_segments (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.cat_files(id) on delete cascade,
  sheet_name text not null default 'Sheet1',
  row_idx integer not null default 0,
  col_src text,
  col_tgt text,
  id_value text,
  extra_value text,
  source_text text not null default '',
  target_text text not null default '',
  is_locked boolean not null default false,
  status text not null default '',
  editor_note text not null default '',
  match_value double precision,
  created_at timestamptz not null default now(),
  last_modified timestamptz not null default now()
);

create table if not exists public.cat_tms (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled TM',
  source_langs text[] not null default '{}',
  target_langs text[] not null default '{}',
  change_log jsonb not null default '[]'::jsonb,
  owner_user_id uuid references public.profiles(id),
  env text not null default 'production',
  created_at timestamptz not null default now(),
  last_modified timestamptz not null default now()
);

create table if not exists public.cat_tm_segments (
  id uuid primary key default gen_random_uuid(),
  tm_id uuid not null references public.cat_tms(id) on delete cascade,
  source_text text not null default '',
  target_text text not null default '',
  key text not null default '',
  prev_segment text not null default '',
  next_segment text not null default '',
  written_file text not null default '',
  written_project text not null default '',
  created_by text not null default 'Unknown User',
  change_log jsonb not null default '[]'::jsonb,
  source_lang text not null default '',
  target_lang text not null default '',
  created_at timestamptz not null default now(),
  last_modified timestamptz not null default now()
);

create table if not exists public.cat_tbs (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled TB',
  terms jsonb not null default '[]'::jsonb,
  next_term_number integer not null default 1,
  change_log jsonb not null default '[]'::jsonb,
  source_langs text[] not null default '{}',
  target_langs text[] not null default '{}',
  owner_user_id uuid references public.profiles(id),
  env text not null default 'production',
  created_at timestamptz not null default now(),
  last_modified timestamptz not null default now()
);

create table if not exists public.cat_workspace_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cat_projects(id) on delete cascade,
  file_id uuid references public.cat_files(id) on delete cascade,
  display_title text not null default 'Untitled',
  content text not null default '',
  created_by text not null default 'Unknown User',
  saved_at timestamptz not null default now()
);

create table if not exists public.cat_module_logs (
  id bigserial primary key,
  module text not null,
  payload jsonb,
  at timestamptz not null default now()
);

create index if not exists cat_projects_owner_idx on public.cat_projects(owner_user_id);
create index if not exists cat_projects_assignment_idx on public.cat_projects(assignment_id);
create index if not exists cat_files_project_idx on public.cat_files(project_id);
create index if not exists cat_segments_file_idx on public.cat_segments(file_id);
create index if not exists cat_tm_segments_tm_idx on public.cat_tm_segments(tm_id);
create index if not exists cat_workspace_notes_project_idx on public.cat_workspace_notes(project_id);
create index if not exists cat_module_logs_module_idx on public.cat_module_logs(module);

alter table public.cat_projects enable row level security;
alter table public.cat_files enable row level security;
alter table public.cat_segments enable row level security;
alter table public.cat_tms enable row level security;
alter table public.cat_tm_segments enable row level security;
alter table public.cat_tbs enable row level security;
alter table public.cat_workspace_notes enable row level security;
alter table public.cat_module_logs enable row level security;

create policy "cat_projects_rw_authenticated" on public.cat_projects
for all using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy "cat_files_rw_authenticated" on public.cat_files
for all using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy "cat_segments_rw_authenticated" on public.cat_segments
for all using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy "cat_tms_rw_authenticated" on public.cat_tms
for all using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy "cat_tm_segments_rw_authenticated" on public.cat_tm_segments
for all using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy "cat_tbs_rw_authenticated" on public.cat_tbs
for all using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy "cat_workspace_notes_rw_authenticated" on public.cat_workspace_notes
for all using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy "cat_module_logs_rw_authenticated" on public.cat_module_logs
for all using (auth.uid() is not null)
with check (auth.uid() is not null);

