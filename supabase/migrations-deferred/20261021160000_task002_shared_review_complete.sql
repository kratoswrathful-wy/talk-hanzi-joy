-- 已延期：隔離曾以此檔覆寫 public.complete_case_review_row（無維護包裝、40001）。
-- 正式發布不得執行本檔。後繼是 supabase/migrations/20261024103000_task002_review_complete_keep_wrapper.sql。
-- TASK-002（21:00）：成員審稿完成以共用列為準。
-- 舊函式只改 leftover review_rows，且要求案件已是任務完成／已交件，
-- 審稿人在共用列、案件仍已派出時會被擋。僅隔離驗證；正式庫須另審後 db push。
-- idempotent。

create or replace function public.complete_case_review_row(
  p_case_id uuid, p_review_row_id text, p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_env text := public.current_env();
  v_case public.cases%rowtype;
  v_collab jsonb;
  v_review_hit jsonb;
  v_rows jsonb;
  v_review jsonb;
  v_status text;
  v_revision bigint;
  v_target_id text;
  v_file text;
  v_range text;
  v_is_admin boolean := false;
  v_has_review_match boolean := false;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  v_is_admin := public.is_admin(v_actor);

  select * into v_case
  from public.cases c
  where c.id = p_case_id and c.env = v_env
  for update;
  if not found or v_case.status not in ('dispatched', 'task_completed', 'delivered', 'feedback') then
    raise exception using errcode = 'P0002', message = 'case_unavailable';
  end if;
  if v_case.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'case_revision_conflict';
  end if;

  select r.value into v_collab
  from jsonb_array_elements(coalesce(v_case.collab_rows, '[]'::jsonb)) r
  where r.value->>'id' = p_review_row_id
  limit 1;

  if v_collab is null then
    select r.value into v_review_hit
    from jsonb_array_elements(
      case when jsonb_typeof(v_case.review_rows) = 'array' then v_case.review_rows else '[]'::jsonb end
    ) r
    where r.value->>'id' = p_review_row_id
    limit 1;

    if v_review_hit is not null then
      select r.value into v_collab
      from jsonb_array_elements(coalesce(v_case.collab_rows, '[]'::jsonb)) r
      where r.value->>'id' = v_review_hit->>'id'
         or (
           r.value->>'linkedCatFileId' is not distinct from v_review_hit->>'linkedCatFileId'
           and coalesce(r.value->>'lineRange', '') = coalesce(v_review_hit->>'lineRange', '')
           and coalesce(r.value->>'linkedCatViewId', '') = coalesce(v_review_hit->>'linkedCatViewId', '')
         )
      limit 1;
    end if;
  end if;

  if v_collab is null then
    raise exception using errcode = '42501', message = 'review_row_not_assigned_to_actor';
  end if;

  if not v_is_admin
     and v_collab->>'reviewerUserId' is distinct from v_actor::text then
    raise exception using errcode = '42501', message = 'review_row_not_assigned_to_actor';
  end if;

  if nullif(trim(coalesce(v_collab->>'reviewerUserId', '')), '') is null
     and nullif(trim(coalesce(v_collab->>'reviewer', '')), '') is null then
    raise exception using errcode = '42501', message = 'review_row_not_assigned_to_actor';
  end if;

  v_target_id := v_collab->>'id';
  v_file := nullif(v_collab->>'linkedCatFileId', '');
  v_range := coalesce(v_collab->>'lineRange', '');

  select jsonb_agg(
    case
      when r.value->>'id' = v_target_id then
        r.value || jsonb_build_object(
          'reviewTaskCompleted', true,
          'taskCompleted', true,
          'reviewAssigned', true
        )
      else r.value
    end
    order by r.ordinality
  )
  into v_rows
  from jsonb_array_elements(coalesce(v_case.collab_rows, '[]'::jsonb))
    with ordinality r(value, ordinality);

  select jsonb_agg(
    case
      when r.value->>'id' = v_target_id
        or r.value->>'id' = p_review_row_id
        or (
          v_file is not null
          and r.value->>'linkedCatFileId' is not distinct from v_file
          and coalesce(r.value->>'lineRange', '') = v_range
        )
      then r.value || jsonb_build_object(
        'taskCompleted', true,
        'reviewer', v_collab->>'reviewer',
        'reviewerUserId', v_collab->>'reviewerUserId'
      )
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

  select exists (
    select 1
    from jsonb_array_elements(v_review) r
    where r.value->>'id' = v_target_id
       or r.value->>'id' = p_review_row_id
       or (
         v_file is not null
         and r.value->>'linkedCatFileId' is not distinct from v_file
         and coalesce(r.value->>'lineRange', '') = v_range
       )
  ) into v_has_review_match;

  if not v_has_review_match then
    v_review := v_review || jsonb_build_array(
      jsonb_build_object(
        'id', v_target_id,
        'segment', v_collab->>'segment',
        'reviewer', v_collab->>'reviewer',
        'reviewerUserId', v_collab->>'reviewerUserId',
        'reviewDeadline', v_collab->>'reviewDeadline',
        'taskCompleted', true,
        'linkedCatFileId', v_collab->>'linkedCatFileId',
        'linkedCatViewId', v_collab->>'linkedCatViewId',
        'lineRange', v_collab->>'lineRange',
        'scopeLabel', v_collab->>'scopeLabel',
        'accepted', true
      )
    );
  end if;

  v_status := v_case.status;
  if v_status = 'dispatched'
     and not exists (
       select 1
       from jsonb_array_elements(v_rows) r
       where (
         nullif(trim(coalesce(r.value->>'translator', '')), '') is not null
         or nullif(trim(coalesce(r.value->>'translatorUserId', '')), '') is not null
         or nullif(trim(coalesce(r.value->>'reviewer', '')), '') is not null
         or nullif(trim(coalesce(r.value->>'reviewerUserId', '')), '') is not null
         or coalesce((r.value->>'accepted')::boolean, false)
         or coalesce((r.value->>'taskCompleted')::boolean, false)
         or coalesce((r.value->>'reviewTaskCompleted')::boolean, false)
         or coalesce((r.value->>'delivered')::boolean, false)
       )
       and not coalesce((r.value->>'taskCompleted')::boolean, false)
     )
  then
    v_status := 'task_completed';
  end if;

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
  set work_status = 'completed', updated_by = v_actor, updated_at = now()
  where case_id = p_case_id
    and user_id = v_actor
    and role = 'reviewer'
    and access_revoked_at is null;

  perform private.record_case_mutation(
    p_case_id, v_env, v_actor, 'complete_case_review_row',
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

comment on function public.complete_case_review_row(uuid, text, bigint) is
  'TASK-002：審稿完成寫共用列；成員以 collab.reviewerUserId 為準，已派出即可勾';

revoke all on function public.complete_case_review_row(uuid, text, bigint) from public, anon;
grant execute on function public.complete_case_review_row(uuid, text, bigint) to authenticated, service_role;
