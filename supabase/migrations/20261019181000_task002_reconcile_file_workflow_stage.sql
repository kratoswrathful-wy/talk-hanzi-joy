-- TASK-002（17:39）：合法受派者完成／重開自己的範圍後，依該步全部有效分段重算整檔翻譯／審稿狀態。
-- 呼叫端不傳目標狀態；系統依資料庫現況衍生。不是授予譯者主管身分。
-- 僅隔離驗證；正式庫須另審後 db push。idempotent。

create or replace function public.cat_reconcile_file_workflow_stage_from_assignments(
  p_stage_id uuid,
  p_allow_downgrade boolean default false
)
returns public.cat_file_workflow_stages
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_env text := public.current_env();
  v_row public.cat_file_workflow_stages%rowtype;
  v_is_admin boolean;
  v_next text := null;
  v_n integer := 0;
  v_completed integer := 0;
  v_started integer := 0;
  v_not_assigned integer := 0;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if p_stage_id is null then
    raise exception using errcode = '22023', message = 'invalid_status_payload';
  end if;

  select s.* into v_row
  from public.cat_file_workflow_stages s
  join public.cat_files f on f.id = s.file_id
  where s.id = p_stage_id
    and f.env = v_env
  for update of s;

  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  v_is_admin := public.is_admin(v_uid);
  if not v_is_admin and not exists (
    select 1
    from public.cat_stage_assignments sa
    where sa.file_id = v_row.file_id
      and sa.assignee_user_id = v_uid
  ) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if v_row.stage_kind = 'prep' then
    return v_row;
  end if;

  perform 1
  from public.cat_stage_assignments sa
  where sa.file_workflow_stage_id = p_stage_id
  for update of sa;

  select
    count(*)::integer,
    count(*) filter (where sa.workflow_status = 'completed')::integer,
    count(*) filter (where sa.workflow_status in ('in_progress', 'completed'))::integer,
    count(*) filter (where sa.workflow_status is distinct from 'assigned')::integer
  into v_n, v_completed, v_started, v_not_assigned
  from public.cat_stage_assignments sa
  where sa.file_workflow_stage_id = p_stage_id;

  if v_n = 0 then
    return v_row;
  end if;

  if v_completed = v_n then
    v_next := 'completed';
  elsif v_started > 0 then
    v_next := 'active';
  elsif v_row.status = 'completed' then
    v_next := 'active';
  elsif v_row.status = 'pending' and v_not_assigned > 0 then
    v_next := 'active';
  end if;

  if v_next is null or v_next = v_row.status then
    return v_row;
  end if;

  if v_row.stage_kind = 'translate'
     and v_row.status = 'completed'
     and v_next is distinct from 'completed'
     and not coalesce(p_allow_downgrade, false) then
    return v_row;
  end if;

  -- 衍生狀態同步：呼叫端不能指定目標；此處以 is_admin 通過轉換檢查，不代表譯者可任意寫整步。
  perform private.p0b_assert_status_transition(
    'file_wf', v_row.status, v_next, true
  );

  update public.cat_file_workflow_stages
  set status = v_next,
      updated_at = now()
  where id = p_stage_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.cat_reconcile_file_workflow_stage_from_assignments(uuid, boolean)
  from public, anon;
grant execute on function public.cat_reconcile_file_workflow_stage_from_assignments(uuid, boolean)
  to authenticated, service_role;

comment on function public.cat_reconcile_file_workflow_stage_from_assignments(uuid, boolean) is
  'TASK-002：依該步全部有效分段重算整檔翻譯／審稿狀態。受派者或主管可呼叫；不接受前端自報完成。';
