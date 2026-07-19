-- W10 工項 C 修補（2026-07-19 裁定）：
--   C-01：fees_visible 放行 internal_note／internal_note_url（語意＝相關案件，§9.2 白名單）
--   C-06：停用 fees 原表 realtime publication；改以 fee_change_signals（僅 id／env／assignee／op）
--         通知客戶端，再重查 fees_visible，避免 WS payload 帶出未遮罩營收欄位。
--
-- idempotent；auth.uid() 一律 (select auth.uid()) 包裹。

-- ── C-01：重建 fees_visible（相關案件對譯者可見；營收禁區維持遮罩）──
drop view if exists public.fees_visible;

create view public.fees_visible
with (security_invoker = on)
as
select
  f.id,
  f.title,
  f.assignee,
  f.status,
  f.internal_note,
  f.internal_note_url,
  f.task_items,
  case
    when is_admin((select auth.uid())) then f.client_info
    else jsonb_build_object(
      'clientTaskItems', '[]'::jsonb,
      'sameCase', false,
      'isFirstFee', false,
      'notFirstFee', false,
      'client', '',
      'contact', '',
      'clientCaseId', '',
      'eciKeywords', '',
      'clientPoNumber', '',
      'clientCaseLink', jsonb_build_object('url', '', 'label', ''),
      'dispatchRoute', '',
      'reconciled', false,
      'rateConfirmed', false,
      'invoiced', false
    )
  end as client_info,
  f.notes,
  case
    when is_admin((select auth.uid())) then f.edit_logs
    else coalesce((
      select jsonb_agg(e)
      from jsonb_array_elements(f.edit_logs) e
      where coalesce(e ->> 'fieldKey', e ->> 'field', '') ~
              '(標題|title|譯者|assignee|狀態|status|任務類型|taskType|計費單位|billingUnit|單位數|unitCount|單價|unitPrice|新增任務|刪除任務|備註|note|相關案件|relatedCase|internalNote|小計|總額)'
        and coalesce(e ->> 'fieldKey', e ->> 'field', '') !~
              '(客戶|client|聯絡人|contact|報價|營收|revenue|利潤|profit|關鍵字|keyword|ECI|eci|PO|對帳|reconcil|請款完成|invoiced|派案|dispatch|同一案件|費用群組|案號|caseId|案件單連結|內部備註|internalComments|費率|rateConfirmed)'
    ), '[]'::jsonb)
  end as edit_logs,
  f.edit_log_phases,
  f.created_by,
  f.created_at,
  f.updated_at,
  f.finalized_by,
  f.finalized_at,
  f.env
from public.fees f;

grant select on public.fees_visible to authenticated;

comment on view public.fees_visible is
  'W10：fees 欄位遮罩 view（security_invoker）。internal_note／url＝相關案件（白名單，全員可見其列級可見之列）。非管理員遮蔽 client_info 營收客戶區塊（含 rateConfirmed）、edit_logs 只留白名單。寫入仍走 fees 原表。';

-- ── C-06：變更信號表（僅非敏感欄；客戶端訂閱此表而非 fees）──
create table if not exists public.fee_change_signals (
  id uuid primary key default gen_random_uuid(),
  fee_id uuid not null,
  env text not null,
  assignee text not null default '',
  op text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  assignee_visible boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists fee_change_signals_env_created_idx
  on public.fee_change_signals (env, created_at desc);

create index if not exists fee_change_signals_fee_id_idx
  on public.fee_change_signals (fee_id);

alter table public.fee_change_signals enable row level security;

drop policy if exists fee_change_signals_select on public.fee_change_signals;
create policy fee_change_signals_select on public.fee_change_signals
  for select
  using (
    env = current_env()
    and (
      is_admin((select auth.uid()))
      or (
        assignee_visible
        and assignee = (
          select p.display_name
          from public.profiles p
          where p.id = (select auth.uid())
        )
      )
    )
  );

-- 僅 trigger（security definer）寫入；authenticated 無 insert/update/delete
revoke insert, update, delete on public.fee_change_signals from authenticated, anon;
grant select on public.fee_change_signals to authenticated;

create or replace function public.fees_emit_change_signal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee_id uuid;
  v_env text;
  v_assignee text;
  v_op text;
  v_visible boolean;
begin
  if tg_op = 'DELETE' then
    v_fee_id := old.id;
    v_env := old.env;
    v_assignee := coalesce(old.assignee, '');
    v_op := 'DELETE';
    v_visible := coalesce(old.status, '') <> 'draft';
  else
    v_fee_id := new.id;
    v_env := new.env;
    v_assignee := coalesce(new.assignee, '');
    v_op := tg_op;
    v_visible := coalesce(new.status, '') <> 'draft';
  end if;

  insert into public.fee_change_signals (fee_id, env, assignee, op, assignee_visible)
  values (v_fee_id, v_env, v_assignee, v_op, v_visible);

  -- 輕量清理：保留近 7 日信號，避免表無限成長
  delete from public.fee_change_signals
  where created_at < now() - interval '7 days';

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists fees_change_signal_trg on public.fees;
create trigger fees_change_signal_trg
  after insert or update or delete on public.fees
  for each row
  execute function public.fees_emit_change_signal();

-- Realtime：改訂閱信號表；自 publication 移除 fees（若曾加入）
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'fees'
  ) then
    alter publication supabase_realtime drop table public.fees;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'fee_change_signals'
  ) then
    alter publication supabase_realtime add table public.fee_change_signals;
  end if;
end $$;

comment on table public.fee_change_signals is
  'W10 C-06：fees 變更信號（無營收／client_info）。前端訂閱此表後重查 fees_visible，禁止訂閱 fees 原表。';
