-- ============================================================
-- CAT 筆記與共用資訊重設計
-- 新增：cat_private_notes、cat_guidelines、cat_note_replies
-- ============================================================

-- 1. 私人筆記（每人每專案，各自獨立）
create table if not exists public.cat_private_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cat_projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cat_private_notes_project_user_idx
  on public.cat_private_notes(project_id, user_id);

-- 2. 共用資訊條目（翻譯準則 & 共用筆記，每專案共用）
create table if not exists public.cat_guidelines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cat_projects(id) on delete cascade,
  type text not null default 'shared_note',  -- 'pm_guideline' | 'shared_note'
  content text not null default '',          -- 最新版 Quill HTML
  versions jsonb not null default '[]'::jsonb, -- [{content, created_by_name, created_at}]
  created_by_id uuid references public.profiles(id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sort_order int not null default 0
);

create index if not exists cat_guidelines_project_idx
  on public.cat_guidelines(project_id, type);

-- 3. 討論串回覆
create table if not exists public.cat_note_replies (
  id uuid primary key default gen_random_uuid(),
  guideline_id uuid not null references public.cat_guidelines(id) on delete cascade,
  parent_reply_id uuid references public.cat_note_replies(id) on delete cascade,
  depth int not null default 0,             -- 0/1/2，最多三層
  content text not null default '',
  created_by_id uuid references public.profiles(id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  is_resolved boolean not null default false,
  resolved_by_name text,
  resolved_at timestamptz
);

create index if not exists cat_note_replies_guideline_idx
  on public.cat_note_replies(guideline_id);
create index if not exists cat_note_replies_parent_idx
  on public.cat_note_replies(parent_reply_id);

-- 4. RLS
alter table public.cat_private_notes enable row level security;
alter table public.cat_guidelines enable row level security;
alter table public.cat_note_replies enable row level security;

-- 私人筆記：只有本人可讀寫刪
drop policy if exists "cat_private_notes_owner" on public.cat_private_notes;
create policy "cat_private_notes_owner" on public.cat_private_notes
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 共用資訊：所有人可讀及新增；PM 以上可更新及刪除
drop policy if exists "cat_guidelines_read_all" on public.cat_guidelines;
create policy "cat_guidelines_read_all" on public.cat_guidelines
  for select
  using (auth.uid() is not null);

drop policy if exists "cat_guidelines_insert_all" on public.cat_guidelines;
create policy "cat_guidelines_insert_all" on public.cat_guidelines
  for insert
  with check (auth.uid() is not null);

drop policy if exists "cat_guidelines_update_pm" on public.cat_guidelines;
create policy "cat_guidelines_update_pm" on public.cat_guidelines
  for update
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

drop policy if exists "cat_guidelines_delete_pm" on public.cat_guidelines;
create policy "cat_guidelines_delete_pm" on public.cat_guidelines
  for delete
  using (is_admin(auth.uid()));

-- 回覆：所有人可讀及新增；PM 以上可刪除
drop policy if exists "cat_note_replies_read_all" on public.cat_note_replies;
create policy "cat_note_replies_read_all" on public.cat_note_replies
  for select
  using (auth.uid() is not null);

drop policy if exists "cat_note_replies_insert_all" on public.cat_note_replies;
create policy "cat_note_replies_insert_all" on public.cat_note_replies
  for insert
  with check (auth.uid() is not null);

-- 更新（結案/重開）：所有人可操作 is_resolved；其餘欄位由應用層控管
drop policy if exists "cat_note_replies_update_all" on public.cat_note_replies;
create policy "cat_note_replies_update_all" on public.cat_note_replies
  for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "cat_note_replies_delete_pm" on public.cat_note_replies;
create policy "cat_note_replies_delete_pm" on public.cat_note_replies
  for delete
  using (is_admin(auth.uid()));

-- 5. Storage bucket：cat-notes-images（公開讀取，登入可寫入）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cat-notes-images',
  'cat-notes-images',
  true,
  5242880,  -- 5 MB
  array['image/jpeg','image/png','image/gif','image/webp','image/svg+xml']
)
on conflict (id) do nothing;

drop policy if exists "cat_notes_images_read_public" on storage.objects;
create policy "cat_notes_images_read_public" on storage.objects
  for select
  using (bucket_id = 'cat-notes-images');

drop policy if exists "cat_notes_images_upload_auth" on storage.objects;
create policy "cat_notes_images_upload_auth" on storage.objects
  for insert
  with check (bucket_id = 'cat-notes-images' and auth.uid() is not null);

drop policy if exists "cat_notes_images_delete_pm" on storage.objects;
create policy "cat_notes_images_delete_pm" on storage.objects
  for delete
  using (bucket_id = 'cat-notes-images' and auth.uid() is not null);
