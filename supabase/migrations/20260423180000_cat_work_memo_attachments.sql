-- 檔案作業備忘、專案／檔案參考附件（與本機 Dexie v16 對應，供團隊版 CAT cloud RPC）

create table if not exists public.cat_file_work_memos (
  file_id uuid primary key references public.cat_files(id) on delete cascade,
  text text not null default '',
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.cat_project_attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cat_projects(id) on delete cascade,
  name text not null default 'attachment',
  mime_type text not null default 'application/octet-stream',
  body_base64 text not null default '',
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.cat_file_attachments (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.cat_files(id) on delete cascade,
  name text not null default 'attachment',
  mime_type text not null default 'application/octet-stream',
  body_base64 text not null default '',
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists cat_project_attachments_project_idx
  on public.cat_project_attachments(project_id);
create index if not exists cat_file_attachments_file_idx
  on public.cat_file_attachments(file_id);

alter table public.cat_file_work_memos enable row level security;
alter table public.cat_project_attachments enable row level security;
alter table public.cat_file_attachments enable row level security;

create policy "cat_file_work_memos_rw_authenticated" on public.cat_file_work_memos
  for all using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "cat_project_attachments_rw_authenticated" on public.cat_project_attachments
  for all using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "cat_file_attachments_rw_authenticated" on public.cat_file_attachments
  for all using (auth.uid() is not null)
  with check (auth.uid() is not null);
