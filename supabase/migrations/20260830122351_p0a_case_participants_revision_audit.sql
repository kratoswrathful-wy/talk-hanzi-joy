-- P0-A1：案件 revision、可信 participant、稽核與 unresolved 容器。
-- 僅 additive；不回填 participant、不收緊正式資料既有入口。

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.cases
  add column if not exists revision bigint not null default 0;

create or replace function private.cases_bump_revision()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;

revoke all on function private.cases_bump_revision()
  from public, anon, authenticated;

drop trigger if exists cases_bump_revision_trg on public.cases;
create trigger cases_bump_revision_trg
  before update on public.cases
  for each row
  execute function private.cases_bump_revision();

create table if not exists public.case_participants (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('translator', 'reviewer')),
  work_status text not null default 'active'
    check (work_status in ('active', 'completed', 'cancelled')),
  source text not null
    check (source in ('public_inquiry_accept', 'collab_accept', 'pm_assign')),
  access_revoked_at timestamptz,
  access_revoked_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (case_id, user_id, role)
);

create index if not exists case_participants_case_user_idx
  on public.case_participants(case_id, user_id);
create index if not exists case_participants_user_case_idx
  on public.case_participants(user_id, case_id);
create index if not exists case_participants_active_access_idx
  on public.case_participants(case_id, user_id)
  where access_revoked_at is null;

alter table public.case_participants enable row level security;
drop policy if exists case_participants_select_own_or_admin
  on public.case_participants;
create policy case_participants_select_own_or_admin
  on public.case_participants
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  );

revoke all on public.case_participants from public, anon;
revoke insert, update, delete on public.case_participants from authenticated;
grant select on public.case_participants to authenticated;
grant all on public.case_participants to service_role;

create table if not exists public.case_participant_backfill_unresolved (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases(id) on delete cascade,
  env text not null,
  candidate_user_id uuid references public.profiles(id),
  candidate_role text check (candidate_role in ('translator', 'reviewer')),
  source_kind text not null,
  source_record_id text,
  reason text not null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (
    case_id,
    candidate_user_id,
    candidate_role,
    source_kind,
    source_record_id,
    reason
  )
);

create index if not exists case_participant_unresolved_env_case_idx
  on public.case_participant_backfill_unresolved(env, case_id);

alter table public.case_participant_backfill_unresolved enable row level security;
drop policy if exists case_participant_unresolved_admin_select
  on public.case_participant_backfill_unresolved;
create policy case_participant_unresolved_admin_select
  on public.case_participant_backfill_unresolved
  for select
  to authenticated
  using (
    public.is_admin((select auth.uid()))
    and env = public.current_env()
  );

revoke all on public.case_participant_backfill_unresolved from public, anon;
revoke insert, update, delete on public.case_participant_backfill_unresolved from authenticated;
grant select on public.case_participant_backfill_unresolved to authenticated;
grant all on public.case_participant_backfill_unresolved to service_role;

create table if not exists public.case_mutation_audit (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  env text not null,
  actor_user_id uuid not null,
  action text not null,
  changed_fields text[] not null default '{}',
  previous_revision bigint not null,
  new_revision bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists case_mutation_audit_case_created_idx
  on public.case_mutation_audit(case_id, created_at desc);
create index if not exists case_mutation_audit_actor_created_idx
  on public.case_mutation_audit(actor_user_id, created_at desc);

alter table public.case_mutation_audit enable row level security;
drop policy if exists case_mutation_audit_admin_select
  on public.case_mutation_audit;
create policy case_mutation_audit_admin_select
  on public.case_mutation_audit
  for select
  to authenticated
  using (
    public.is_admin((select auth.uid()))
    and env = public.current_env()
  );

revoke all on public.case_mutation_audit from public, anon;
revoke insert, update, delete on public.case_mutation_audit from authenticated;
grant select on public.case_mutation_audit to authenticated;
grant all on public.case_mutation_audit to service_role;

create or replace function private.record_case_mutation(
  p_case_id uuid,
  p_env text,
  p_actor_user_id uuid,
  p_action text,
  p_changed_fields text[],
  p_previous_revision bigint,
  p_new_revision bigint
)
returns void
language sql
security definer
set search_path = pg_catalog
as $$
  insert into public.case_mutation_audit (
    case_id, env, actor_user_id, action, changed_fields,
    previous_revision, new_revision
  )
  values (
    p_case_id, p_env, p_actor_user_id, p_action,
    coalesce(p_changed_fields, '{}'::text[]),
    p_previous_revision, p_new_revision
  );
$$;

revoke all on function private.record_case_mutation(
  uuid, text, uuid, text, text[], bigint, bigint
) from public, anon, authenticated;

comment on column public.cases.revision is
  'P0-A optimistic concurrency 版本；所有 UPDATE 由 trigger 單一遞增。';
comment on table public.case_participants is
  '以 UUID 表示之可信案件參與；工作狀態與敏感資料撤權分離。';
comment on table public.case_participant_backfill_unresolved is
  '無法證明 UUID 來源的舊指派，只列報告、不猜測授權。';
comment on table public.case_mutation_audit is
  '只記 actor/action/欄位名/revision，不保存欄位值或憑證。';