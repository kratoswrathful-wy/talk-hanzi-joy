-- Phase 2.3k：個人句段色點（本機 Dexie 對應雲端表）
create table if not exists public.cat_user_segment_markers (
  user_id uuid not null references public.profiles(id) on delete cascade,
  file_id uuid not null references public.cat_files(id) on delete cascade,
  segment_id uuid not null references public.cat_segments(id) on delete cascade,
  colors text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, file_id, segment_id)
);

create index if not exists cat_user_segment_markers_file_user_idx
  on public.cat_user_segment_markers(user_id, file_id);

alter table public.cat_user_segment_markers enable row level security;

drop policy if exists "cat_user_segment_markers_owner" on public.cat_user_segment_markers;
create policy "cat_user_segment_markers_owner" on public.cat_user_segment_markers
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.cat_user_segment_markers is '個人句段色點書籤（紅黃藍紫，可多色）';
