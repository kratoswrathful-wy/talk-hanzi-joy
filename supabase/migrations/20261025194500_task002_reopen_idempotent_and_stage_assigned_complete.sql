-- TASK-002（2026-10-25）：譯者改譯文重開已成功時不再重寫案件；CAT 任務完成允許 assigned→completed。
-- 僅隔離驗證；正式庫須另審後 db push。idempotent。

create or replace function private.p0b_assert_status_transition(
  p_kind text,
  p_from text,
  p_to text,
  p_is_admin boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_from text := nullif(trim(coalesce(p_from, '')), '');
  v_to text := nullif(trim(coalesce(p_to, '')), '');
  v_legal boolean := false;
  v_ok boolean := false;
begin
  if v_to is null then
    raise exception using errcode = '22023', message = 'invalid_status';
  end if;

  if p_kind in ('file_asg', 'view_asg') then
    v_legal := v_to in ('assigned', 'in_progress', 'completed', 'cancelled');
  elsif p_kind = 'stage_wf' then
    v_legal := v_to in ('assigned', 'in_progress', 'completed');
  elsif p_kind = 'file_wf' then
    v_legal := v_to in ('pending', 'active', 'completed');
  else
    raise exception using errcode = '22023', message = 'invalid_status_kind';
  end if;

  if not v_legal then
    raise exception using errcode = '22023', message = 'invalid_status';
  end if;

  if v_from is not distinct from v_to then
    return;
  end if;

  if coalesce(p_is_admin, false) then
    return;
  end if;

  if p_kind in ('file_asg', 'view_asg', 'stage_wf') then
    v_ok := (v_from = 'assigned' and v_to = 'in_progress')
         or (v_from = 'in_progress' and v_to = 'completed')
         or (p_kind = 'stage_wf' and v_from = 'assigned' and v_to = 'completed')
         or (p_kind = 'stage_wf' and v_from = 'completed' and v_to = 'in_progress');
  elsif p_kind = 'file_wf' then
    v_ok := false;
  end if;

  if not v_ok then
    raise exception using errcode = '22023', message = 'invalid_status_transition';
  end if;
end;
$$;

comment on function private.p0b_assert_status_transition(text, text, text, boolean) is
  'P0-B 狀態轉換：成員正向 assigned→in_progress→completed；stage_wf 另允許 assigned→completed（任務完成）與 completed→in_progress（改譯文取消完成）。file_asg／view_asg 仍不可跳過 in_progress';

create or replace function public.reopen_own_cat_complete_on_edit(
  p_case_id uuid,
  p_collab_row_id text,
  p_expected_revision bigint
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_env text := public.current_env();
  v_case public.cases%rowtype;
  v_collab jsonb;
  v_rows jsonb;
  v_review jsonb;
  v_status text;
  v_revision bigint;
  v_target_id text;
  v_file text;
  v_range text;
  v_reviewer uuid;
  v_flag_true text[] := array['true', 't', '1'];
  v_review_still_complete boolean := false;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if p_case_id is null or nullif(trim(coalesce(p_collab_row_id, '')), '') is null then
    raise exception using errcode = '22023', message = 'invalid_payload';
  end if;

  select * into v_case from public.cases c
  where c.id = p_case_id and c.env = v_env
  for update;
  if not found or v_case.status not in ('dispatched', 'task_completed', 'delivered') then
    raise exception using errcode = 'P0002', message = 'case_unavailable';
  end if;
  if v_case.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'case_revision_conflict';
  end if;

  select r.value into v_collab
  from jsonb_array_elements(coalesce(v_case.collab_rows, '[]'::jsonb)) r
  where r.value->>'id' = p_collab_row_id
  limit 1;

  if v_collab is null then
    select r.value into v_collab
    from jsonb_array_elements(coalesce(v_case.collab_rows, '[]'::jsonb)) r
    where r.value->>'translatorUserId' = v_actor::text
      and exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(v_case.review_rows) = 'array' then v_case.review_rows else '[]'::jsonb end
        ) rv
        where rv.value->>'id' = p_collab_row_id
          and rv.value->>'linkedCatFileId' is not distinct from r.value->>'linkedCatFileId'
          and coalesce(rv.value->>'lineRange', '') = coalesce(r.value->>'lineRange', '')
      )
    limit 1;
  end if;

  if v_collab is null or v_collab->>'translatorUserId' is distinct from v_actor::text then
    raise exception using errcode = '42501', message = 'collab_row_not_assigned_to_actor';
  end if;

  v_target_id := v_collab->>'id';
  v_file := nullif(v_collab->>'linkedCatFileId', '');
  v_range := coalesce(v_collab->>'lineRange', '');
  begin
    v_reviewer := nullif(v_collab->>'reviewerUserId', '')::uuid;
  exception when invalid_text_representation then
    v_reviewer := null;
  end;

  select exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(v_case.review_rows) = 'array' then v_case.review_rows else '[]'::jsonb end
    ) r
    where (
        r.value->>'id' = v_target_id
        or (
          v_file is not null
          and r.value->>'linkedCatFileId' is not distinct from v_file
          and coalesce(r.value->>'lineRange', '') = v_range
        )
      )
      and coalesce(r.value->>'taskCompleted', 'false') = any (v_flag_true)
  )
  into v_review_still_complete;

  if v_case.status not in ('task_completed', 'delivered')
     and coalesce(v_collab->>'taskCompleted', 'false') <> all (v_flag_true)
     and coalesce(v_collab->>'reviewTaskCompleted', 'false') <> all (v_flag_true)
     and coalesce(v_collab->>'delivered', 'false') <> all (v_flag_true)
     and not v_review_still_complete
  then
    return jsonb_build_object(
      'caseId', p_case_id,
      'revision', v_case.revision,
      'status', v_case.status,
      'rowId', v_target_id,
      'noop', true
    );
  end if;

  select jsonb_agg(
    case
      when r.value->>'id' = v_target_id
        then r.value || jsonb_build_object(
          'taskCompleted', false,
          'reviewTaskCompleted', false,
          'delivered', false
        )
      else r.value
    end
    order by r.ordinality
  )
  into v_rows
  from jsonb_array_elements(coalesce(v_case.collab_rows, '[]'::jsonb)) with ordinality r(value, ordinality);

  select jsonb_agg(
    case
      when r.value->>'id' = v_target_id
        then r.value || jsonb_build_object('taskCompleted', false)
      when v_file is not null
        and r.value->>'linkedCatFileId' is not distinct from v_file
        and coalesce(r.value->>'lineRange', '') = v_range
        then r.value || jsonb_build_object('taskCompleted', false)
      else r.value
    end
    order by r.ordinality
  )
  into v_review
  from jsonb_array_elements(
    case when jsonb_typeof(v_case.review_rows) = 'array' then v_case.review_rows else '[]'::jsonb end
  ) with ordinality r(value, ordinality);

  if v_review is null then
    v_review := '[]'::jsonb;
  end if;

  v_status := case
    when v_case.status in ('task_completed', 'delivered') then 'dispatched'
    else v_case.status
  end;

  update public.cases c
  set collab_rows = v_rows,
      review_rows = v_review,
      status = v_status,
      updated_at = now()
  where c.id = p_case_id and c.env = v_env and c.revision = p_expected_revision
  returning c.revision into v_revision;
  if not found then
    raise exception using errcode = '40001', message = 'case_revision_conflict';
  end if;

  update public.case_participants
  set work_status = 'active', updated_by = v_actor, updated_at = now()
  where case_id = p_case_id
    and user_id = v_actor
    and role = 'translator'
    and access_revoked_at is null
    and work_status = 'completed';

  if v_reviewer is not null then
    update public.case_participants
    set work_status = 'active', updated_by = v_actor, updated_at = now()
    where case_id = p_case_id
      and user_id = v_reviewer
      and role = 'reviewer'
      and access_revoked_at is null
      and work_status = 'completed';
  end if;

  perform private.record_case_mutation(
    p_case_id, v_env, v_actor, 'reopen_own_cat_complete_on_edit',
    array['collab_rows', 'review_rows', 'status'], p_expected_revision, v_revision
  );

  return jsonb_build_object(
    'caseId', p_case_id,
    'revision', v_revision,
    'status', v_status,
    'rowId', v_target_id
  );
end;
$$;

comment on function public.reopen_own_cat_complete_on_edit(uuid, text, bigint) is
  'TASK-002：譯者改譯文退回自己那一列的翻譯／審稿完成與交件；已退回且案件非整案完成／已交件時直接返回，不重寫';

revoke all on function public.reopen_own_cat_complete_on_edit(uuid, text, bigint) from public, anon;
grant execute on function public.reopen_own_cat_complete_on_edit(uuid, text, bigint) to authenticated, service_role;
