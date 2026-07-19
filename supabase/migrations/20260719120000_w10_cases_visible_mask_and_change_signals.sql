-- 工項 D（2026-07-19）：案件欄位遮罩 cases_visible＋基表 SELECT 僅 admin＋realtime 改信號表
--
-- 定稿矩陣：列級全員可見；譯者不可見七欄（client／contact／keyword／client_po_number／
--   dispatch_route／client_case_link／internal_comments）；edit_logs SQL 過濾；敏感欄寫入擋非 admin。
-- 比照 fees C-11／C-06：security_invoker=false、禁止 PostgREST 直讀基表繞過。
-- idempotent；auth.uid() 一律 (select auth.uid()) 包裹。

-- ── 1) 基表 SELECT：僅 PM／執行長 ──
drop policy if exists "Anyone authenticated can read cases" on public.cases;
drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases
  for select
  using (
    is_admin((select auth.uid()))
    and env = current_env()
  );

comment on policy cases_select on public.cases is
  '工項 D：非 admin 不得 SELECT cases 基表；譯者讀取走 cases_visible。';

-- ── 2) cases_visible：列級全員（本 env）＋七欄／edit_logs 遮罩 ──
drop view if exists public.cases_visible;

create view public.cases_visible
with (security_invoker = false)
as
select
  c.id,
  c.title,
  c.status,
  case when is_admin((select auth.uid())) then c.client else '' end as client,
  case when is_admin((select auth.uid())) then c.contact else '' end as contact,
  case when is_admin((select auth.uid())) then c.keyword else '' end as keyword,
  case when is_admin((select auth.uid())) then c.client_po_number else '' end as client_po_number,
  case
    when is_admin((select auth.uid())) then c.client_case_link
    else jsonb_build_object('url', '', 'label', '')
  end as client_case_link,
  case when is_admin((select auth.uid())) then c.dispatch_route else null end as dispatch_route,
  c.category,
  c.work_type,
  c.work_groups,
  c.process_note,
  c.billing_unit,
  c.unit_count,
  c.inquiry_note,
  c.translator,
  c.translation_deadline,
  c.reviewer,
  c.review_deadline,
  c.execution_tool,
  c.tool_field_values,
  c.cat_tool_enabled,
  c.tools,
  c.question_tools,
  c.delivery_method,
  c.delivery_method_files,
  c.client_receipt,
  c.client_receipt_files,
  c.custom_guidelines_url,
  c.client_guidelines,
  c.common_info,
  c.common_links,
  c.internal_note_form,
  c.client_question_form,
  c.working_files,
  c.other_login_info,
  c.login_account,
  c.login_password,
  c.online_tool_project,
  c.online_tool_filename,
  c.source_files,
  c.series_reference_materials,
  c.case_reference_materials,
  c.reference_materials,
  c.question_form,
  c.translator_final,
  c.internal_review_final,
  c.track_changes,
  c.fee_entry,
  c.internal_records,
  c.comments,
  case
    when is_admin((select auth.uid())) then c.internal_comments
    else '[]'::jsonb
  end as internal_comments,
  c.body_content,
  c.multi_collab,
  c.collab_count,
  c.collab_rows,
  c.review_rows,
  c.decline_records,
  c.icon_url,
  c.created_by,
  c.created_at,
  c.inquiry_slack_records,
  c.updated_at,
  case
    when is_admin((select auth.uid())) then c.edit_logs
    else coalesce((
      select jsonb_agg(e)
      from jsonb_array_elements(c.edit_logs) e
      where coalesce(e ->> 'fieldKey', e ->> 'field', '') !~*
            '(客戶|client|聯絡人|contact|關鍵字|keyword|客戶\s*PO|clientPo|client_po|派案|dispatch|案件單連結|clientCaseLink|client_case_link|內部備註|internalComments|internal_comments)'
    ), '[]'::jsonb)
  end as edit_logs,
  c.change_log_enabled_at,
  c.task_status,
  c.env
from public.cases c
where c.env = current_env();

revoke all on public.cases_visible from public, anon;
grant select on public.cases_visible to authenticated;
grant select on public.cases_visible to service_role;

comment on view public.cases_visible is
  '工項 D：cases 遮罩 view（security_invoker=false）。列級本 env 全員可見；非 admin 遮罩七敏感欄＋edit_logs。基表 SELECT 僅 admin。';

-- ── 3) 敏感欄寫入擋（非 admin 不可改七欄）──
create or replace function public.cases_block_sensitive_column_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if is_admin((select auth.uid())) then
    return new;
  end if;
  if new.client is distinct from old.client
     or new.contact is distinct from old.contact
     or new.keyword is distinct from old.keyword
     or new.client_po_number is distinct from old.client_po_number
     or new.client_case_link is distinct from old.client_case_link
     or new.dispatch_route is distinct from old.dispatch_route
     or new.internal_comments is distinct from old.internal_comments
  then
    raise exception 'permission denied: translator cannot update manager-only case fields';
  end if;
  return new;
end;
$$;

drop trigger if exists cases_block_sensitive_update_trg on public.cases;
create trigger cases_block_sensitive_update_trg
  before update on public.cases
  for each row
  execute function public.cases_block_sensitive_column_update();

-- ── 4) case_change_signals（無敏感欄；列級全員可見本 env）──
create table if not exists public.case_change_signals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  env text not null,
  op text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  created_at timestamptz not null default now()
);

create index if not exists case_change_signals_env_created_idx
  on public.case_change_signals (env, created_at desc);

create index if not exists case_change_signals_case_id_idx
  on public.case_change_signals (case_id);

alter table public.case_change_signals enable row level security;

drop policy if exists case_change_signals_select on public.case_change_signals;
create policy case_change_signals_select on public.case_change_signals
  for select
  using (env = current_env());

revoke insert, update, delete on public.case_change_signals from authenticated, anon;
grant select on public.case_change_signals to authenticated;
grant select on public.case_change_signals to service_role;

create or replace function public.cases_emit_change_signal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case_id uuid;
  v_env text;
  v_op text;
begin
  if tg_op = 'DELETE' then
    v_case_id := old.id;
    v_env := old.env;
    v_op := 'DELETE';
  else
    v_case_id := new.id;
    v_env := new.env;
    v_op := tg_op;
  end if;

  insert into public.case_change_signals (case_id, env, op)
  values (v_case_id, v_env, v_op);

  delete from public.case_change_signals
  where created_at < now() - interval '7 days';

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists cases_change_signal_trg on public.cases;
create trigger cases_change_signal_trg
  after insert or update or delete on public.cases
  for each row
  execute function public.cases_emit_change_signal();

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cases'
  ) then
    alter publication supabase_realtime drop table public.cases;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'case_change_signals'
  ) then
    alter publication supabase_realtime add table public.case_change_signals;
  end if;
end $$;

comment on table public.case_change_signals is
  '工項 D：cases 變更信號（無敏感欄）。前端訂閱後重查 cases_visible，禁止訂閱 cases 原表。';
