-- TASK-002（2026-10-23）：譯者改譯文時，已交件案件也要退回對應共用列。
-- 舊函式只接受已派出／任務完成，且不清除 delivered，隔離驗收 F 會改得了 CAT、案件頁卻不退。
-- 僅隔離驗證；正式庫須另審後 db push。idempotent。

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
  'TASK-002：譯者改譯文退回自己那一列的翻譯／審稿完成與交件；已交件案件也可退回已派出';

revoke all on function public.reopen_own_cat_complete_on_edit(uuid, text, bigint) from public, anon;
grant execute on function public.reopen_own_cat_complete_on_edit(uuid, text, bigint) to authenticated, service_role;
