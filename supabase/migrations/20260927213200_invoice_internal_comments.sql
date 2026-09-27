-- 稿費請款內部備註：獨立表，不寫入 invoices.comments／note。
-- 譯者可讀自己的請款列，故不可把內部內容加在同一列讓 SELECT * 帶出。
-- 僅 is_admin（PM／執行長）可讀寫；一般留言規則不變。

create table if not exists public.invoice_internal_comments (
  invoice_id uuid primary key references public.invoices(id) on delete cascade,
  env text not null,
  comments jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create index if not exists invoice_internal_comments_env_idx
  on public.invoice_internal_comments(env);

alter table public.invoice_internal_comments enable row level security;

drop policy if exists invoice_internal_comments_select on public.invoice_internal_comments;
create policy invoice_internal_comments_select
  on public.invoice_internal_comments
  for select
  using (
    is_admin((select auth.uid()))
    and env = public.current_env()
  );

drop policy if exists invoice_internal_comments_insert on public.invoice_internal_comments;
create policy invoice_internal_comments_insert
  on public.invoice_internal_comments
  for insert
  with check (
    is_admin((select auth.uid()))
    and env = public.current_env()
  );

drop policy if exists invoice_internal_comments_update on public.invoice_internal_comments;
create policy invoice_internal_comments_update
  on public.invoice_internal_comments
  for update
  using (
    is_admin((select auth.uid()))
    and env = public.current_env()
  )
  with check (
    is_admin((select auth.uid()))
    and env = public.current_env()
  );

drop policy if exists invoice_internal_comments_delete on public.invoice_internal_comments;
create policy invoice_internal_comments_delete
  on public.invoice_internal_comments
  for delete
  using (
    is_admin((select auth.uid()))
    and env = public.current_env()
  );

revoke all on table public.invoice_internal_comments from public, anon;
grant select, insert, update, delete on table public.invoice_internal_comments to authenticated;
grant all on table public.invoice_internal_comments to service_role;

comment on table public.invoice_internal_comments is
  '稿費請款內部備註（PM+）；與 invoices.comments 一般留言分開。';
