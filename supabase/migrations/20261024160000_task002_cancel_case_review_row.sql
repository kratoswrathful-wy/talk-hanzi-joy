-- TASK-002（15:52）：成員／列上審稿人取消尚未交件的審稿完成。
-- 公開入口保留 Gate 2 維護檢查；內部才改共用列。版本衝突 P0001。
-- 取消保留翻譯完成，不改人員／交期／承接／範圍；已交件列拒絕。
-- 一般角色不得 execute impl。idempotent。

create or replace function private.cancel_case_review_row_impl(
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
  v_revision bigint;
  v_target_id text;
  v_file uuid;
  v_reviewer uuid;
  v_is_admin boolean := false;
  v_is_pm boolean := false;
  v_delivered boolean := false;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  v_is_admin := public.is_admin(v_actor);
  v_is_pm := exists (
    select 1
    from public.user_roles ur
    where ur.user_id = v_actor
      and ur.role in ('pm', 'executive')
  );

  select * into v_case
  from public.cases c
  where c.id = p_case_id and c.env = v_env
  for update;
  if not found or v_case.status not in ('dispatched', 'task_completed', 'delivered', 'feedback') then
    raise exception using errcode = 'P0002', message = 'case_unavailable';
  end if;
  if v_case.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'case_revision_conflict';
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
     and not v_is_pm
     and v_collab->>'reviewerUserId' is distinct from v_actor::text then
    raise exception using errcode = '42501', message = 'review_row_not_assigned_to_actor';
  end if;

  v_delivered := coalesce((v_collab->>'delivered')::boolean, false);
  if v_delivered then
    raise exception using errcode = '42501', message = 'review_row_delivered_locked';
  end if;

  v_target_id := v_collab->>'id';

  select jsonb_agg(
    case
      when r.value->>'id' = v_target_id then
        r.value || jsonb_build_object(
          'reviewTaskCompleted', false
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

  update public.cases c
  set collab_rows = v_rows,
      review_rows = v_review,
      updated_at = now()
  where c.id = p_case_id and c.env = v_env and c.revision = p_expected_revision
  returning c.revision into v_revision;
  if not found then
    raise exception using errcode = 'P0001', message = 'case_revision_conflict';
  end if;

  update public.case_participants
  set work_status = 'active', updated_by = v_actor, updated_at = now()
  where case_id = p_case_id
    and user_id = v_actor
    and role = 'reviewer'
    and access_revoked_at is null
    and work_status = 'completed';

  begin
    v_file := nullif(v_collab->>'linkedCatFileId', '')::uuid;
    v_reviewer := nullif(v_collab->>'reviewerUserId', '')::uuid;
  exception when invalid_text_representation then
    v_file := null;
    v_reviewer := null;
  end;

  if v_file is not null and v_reviewer is not null then
    perform public.cat_upsert_review_stage_assignment(
      v_file,
      v_reviewer,
      v_target_id,
      null,
      nullif(v_collab->>'scopeLabel', ''),
      null,
      null,
      'in_progress',
      true
    );
  end if;

  perform private.record_case_mutation(
    p_case_id, v_env, v_actor, 'cancel_case_review_row',
    array['collab_rows', 'review_rows'], p_expected_revision, v_revision
  );

  return jsonb_build_object(
    'caseId', p_case_id,
    'revision', v_revision,
    'status', v_case.status,
    'rowId', v_target_id
  );
end;
$$;

revoke all on function private.cancel_case_review_row_impl(uuid, text, bigint)
  from public, anon, authenticated, service_role;

create or replace function public.cancel_case_review_row(
  p_case_id uuid, p_review_row_id text, p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
begin
  perform private.assert_maintenance_write_allowed();
  return private.cancel_case_review_row_impl(p_case_id, p_review_row_id, p_expected_revision);
end;
$$;

comment on function public.cancel_case_review_row(uuid, text, bigint) is
  'TASK-002：公開入口只做維護檢查後轉 private；取消尚未交件的審稿完成，保留翻譯完成';

comment on function private.cancel_case_review_row_impl(uuid, text, bigint) is
  'TASK-002：取消審稿完成寫共用列；已交件拒絕；版本衝突 P0001；不授予 authenticated／service_role';

revoke all on function public.cancel_case_review_row(uuid, text, bigint) from public, anon;
grant execute on function public.cancel_case_review_row(uuid, text, bigint) to authenticated, service_role;
