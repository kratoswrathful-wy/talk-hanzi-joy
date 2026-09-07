-- P0-A3：成員只能經語意明確的動作 RPC 改案件流程。
-- RPC 先驗證身分／授權，再檢查 expected revision；公開承接以 row lock 防併發雙贏。

create or replace function private.case_actor_display_name(p_user_id uuid)
returns text language sql stable security definer set search_path = pg_catalog
as $$
  select coalesce(nullif(trim(p.display_name), ''), nullif(split_part(p.email, '@', 1), ''))
  from public.profiles p where p.id = p_user_id;
$$;
revoke all on function private.case_actor_display_name(uuid) from public, anon, authenticated;

create or replace function public.accept_public_inquiry_case(
  p_case_id uuid, p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_env text := public.current_env();
  v_case public.cases%rowtype;
  v_name text;
  v_revision bigint;
begin
  if v_actor is null then raise exception using errcode='42501', message='not_authorized'; end if;
  select * into v_case from public.cases c
  where c.id=p_case_id and c.env=v_env for update;
  if not found or v_case.status <> 'inquiry' or v_case.multi_collab then
    raise exception using errcode='P0002', message='case_unavailable';
  end if;
  if v_case.revision <> p_expected_revision then
    raise exception using errcode='40001', message='case_revision_conflict';
  end if;
  v_name := private.case_actor_display_name(v_actor);
  if v_name is null then raise exception using errcode='42501', message='profile_display_name_required'; end if;
  update public.cases c set
    status='dispatched',
    translator=case
      when jsonb_typeof(c.translator)='array' and c.translator @> jsonb_build_array(v_name) then c.translator
      when jsonb_typeof(c.translator)='array' then c.translator || jsonb_build_array(v_name)
      else jsonb_build_array(v_name) end,
    updated_at=now()
  where c.id=p_case_id and c.env=v_env and c.revision=p_expected_revision
  returning c.revision into v_revision;
  if not found then raise exception using errcode='40001', message='case_revision_conflict'; end if;
  insert into public.case_participants(
    case_id,user_id,role,work_status,source,created_by,updated_by
  ) values (
    p_case_id,v_actor,'translator','active','public_inquiry_accept',v_actor,v_actor
  )
  on conflict(case_id,user_id,role) do update set
    work_status='active', source='public_inquiry_accept',
    access_revoked_at=null, access_revoked_by=null,
    updated_by=v_actor, updated_at=now();
  perform private.record_case_mutation(
    p_case_id,v_env,v_actor,'accept_public_inquiry_case',
    array['status','translator'],p_expected_revision,v_revision
  );
  return jsonb_build_object('caseId',p_case_id,'revision',v_revision,'status','dispatched');
end;
$$;

create or replace function public.decline_public_inquiry_case(
  p_case_id uuid, p_expected_revision bigint, p_decline jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_env text := public.current_env();
  v_case public.cases%rowtype;
  v_name text;
  v_record jsonb;
  v_revision bigint;
begin
  if v_actor is null then raise exception using errcode='42501', message='not_authorized'; end if;
  if jsonb_typeof(coalesce(p_decline,'{}'::jsonb)) <> 'object'
    or exists(select 1 from jsonb_object_keys(coalesce(p_decline,'{}'::jsonb)) k
      where k not in ('proposedDeadline','availableCount','message')) then
    raise exception using errcode='22023', message='invalid_decline_payload';
  end if;
  select * into v_case from public.cases c
  where c.id=p_case_id and c.env=v_env for update;
  if not found or v_case.status <> 'inquiry' then
    raise exception using errcode='P0002', message='case_unavailable';
  end if;
  if v_case.revision <> p_expected_revision then
    raise exception using errcode='40001', message='case_revision_conflict';
  end if;
  v_name := private.case_actor_display_name(v_actor);
  if v_name is null then raise exception using errcode='42501', message='profile_display_name_required'; end if;
  v_record := jsonb_strip_nulls(jsonb_build_object(
    'id',gen_random_uuid(),'translator',v_name,'userId',v_actor,
    'proposedDeadline',nullif(p_decline->>'proposedDeadline',''),
    'availableCount',case when p_decline?'availableCount' then p_decline->'availableCount' end,
    'message',nullif(left(p_decline->>'message',2000),''),
    'createdAt',now()
  ));
  update public.cases c set
    decline_records=case when jsonb_typeof(c.decline_records)='array'
      then c.decline_records || jsonb_build_array(v_record)
      else jsonb_build_array(v_record) end,
    updated_at=now()
  where c.id=p_case_id and c.env=v_env and c.revision=p_expected_revision
  returning c.revision into v_revision;
  if not found then raise exception using errcode='40001', message='case_revision_conflict'; end if;
  perform private.record_case_mutation(
    p_case_id,v_env,v_actor,'decline_public_inquiry_case',
    array['decline_records'],p_expected_revision,v_revision
  );
  return jsonb_build_object('caseId',p_case_id,'revision',v_revision,'status',v_case.status);
end;
$$;

create or replace function public.accept_inquiry_collab_row(
  p_case_id uuid, p_collab_row_id text, p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_env text := public.current_env();
  v_case public.cases%rowtype;
  v_row jsonb;
  v_rows jsonb;
  v_name text;
  v_status text;
  v_revision bigint;
begin
  if v_actor is null then raise exception using errcode='42501', message='not_authorized'; end if;
  select * into v_case from public.cases c
  where c.id=p_case_id and c.env=v_env for update;
  if not found or v_case.status <> 'inquiry' or not v_case.multi_collab then
    raise exception using errcode='P0002', message='case_unavailable';
  end if;
  select r.value into v_row
  from jsonb_array_elements(case when jsonb_typeof(v_case.collab_rows)='array'
    then v_case.collab_rows else '[]'::jsonb end) r
  where r.value->>'id'=p_collab_row_id;
  if not found or coalesce((v_row->>'accepted')::boolean,false) then
    raise exception using errcode='P0002', message='collab_row_unavailable';
  end if;
  if nullif(v_row->>'translatorUserId','') is not null
    and v_row->>'translatorUserId' <> v_actor::text then
    raise exception using errcode='42501', message='collab_row_not_assigned_to_actor';
  end if;
  if v_case.revision <> p_expected_revision then
    raise exception using errcode='40001', message='case_revision_conflict';
  end if;
  v_name := private.case_actor_display_name(v_actor);
  if v_name is null then raise exception using errcode='42501', message='profile_display_name_required'; end if;
  select jsonb_agg(
    case when r.value->>'id'=p_collab_row_id then r.value || jsonb_build_object(
      'accepted',true,'translator',v_name,'translatorUserId',v_actor
    ) else r.value end order by r.ordinality
  ) into v_rows
  from jsonb_array_elements(v_case.collab_rows) with ordinality r(value,ordinality);
  v_status := case when not exists(
    select 1 from jsonb_array_elements(v_rows) r
    where not coalesce((r.value->>'accepted')::boolean,false)
  ) then 'dispatched' else 'inquiry' end;
  update public.cases c set
    collab_rows=v_rows,
    translator=(select coalesce(jsonb_agg(name order by name),'[]'::jsonb)
      from (select distinct nullif(r.value->>'translator','') name
        from jsonb_array_elements(v_rows) r) names where name is not null),
    status=v_status, updated_at=now()
  where c.id=p_case_id and c.env=v_env and c.revision=p_expected_revision
  returning c.revision into v_revision;
  if not found then raise exception using errcode='40001', message='case_revision_conflict'; end if;
  insert into public.case_participants(
    case_id,user_id,role,work_status,source,created_by,updated_by
  ) values(p_case_id,v_actor,'translator','active','collab_accept',v_actor,v_actor)
  on conflict(case_id,user_id,role) do update set
    work_status='active',source='collab_accept',access_revoked_at=null,
    access_revoked_by=null,updated_by=v_actor,updated_at=now();
  perform private.record_case_mutation(
    p_case_id,v_env,v_actor,'accept_inquiry_collab_row',
    array['collab_rows','translator','status'],p_expected_revision,v_revision
  );
  return jsonb_build_object(
    'caseId',p_case_id,'revision',v_revision,'status',v_status,'rowId',p_collab_row_id
  );
end;
$$;

create or replace function public.complete_case_collab_row(
  p_case_id uuid, p_collab_row_id text, p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid(); v_env text := public.current_env();
  v_case public.cases%rowtype; v_rows jsonb; v_status text; v_revision bigint;
begin
  if v_actor is null then raise exception using errcode='42501', message='not_authorized'; end if;
  select * into v_case from public.cases c where c.id=p_case_id and c.env=v_env for update;
  if not found or v_case.status not in ('dispatched','task_completed') then
    raise exception using errcode='P0002', message='case_unavailable';
  end if;
  if not exists(select 1 from jsonb_array_elements(v_case.collab_rows) r
    where r.value->>'id'=p_collab_row_id
      and r.value->>'translatorUserId'=v_actor::text
      and not coalesce((r.value->>'taskCompleted')::boolean,false)) then
    raise exception using errcode='42501', message='collab_row_not_assigned_to_actor';
  end if;
  if v_case.revision <> p_expected_revision then
    raise exception using errcode='40001', message='case_revision_conflict';
  end if;
  select jsonb_agg(case when r.value->>'id'=p_collab_row_id
    then r.value || jsonb_build_object('taskCompleted',true)
    else r.value end order by r.ordinality)
  into v_rows from jsonb_array_elements(v_case.collab_rows) with ordinality r(value,ordinality);
  v_status := case when not exists(select 1 from jsonb_array_elements(v_rows) r
    where not coalesce((r.value->>'taskCompleted')::boolean,false))
    then 'task_completed' else v_case.status end;
  update public.cases c set collab_rows=v_rows,status=v_status,updated_at=now()
  where c.id=p_case_id and c.env=v_env and c.revision=p_expected_revision
  returning c.revision into v_revision;
  if not found then raise exception using errcode='40001', message='case_revision_conflict'; end if;
  update public.case_participants set work_status='completed',updated_by=v_actor,updated_at=now()
  where case_id=p_case_id and user_id=v_actor and role='translator' and access_revoked_at is null;
  perform private.record_case_mutation(
    p_case_id,v_env,v_actor,'complete_case_collab_row',
    array['collab_rows','status'],p_expected_revision,v_revision
  );
  return jsonb_build_object(
    'caseId',p_case_id,'revision',v_revision,'status',v_status,'rowId',p_collab_row_id
  );
end;
$$;

create or replace function public.complete_case_translation(
  p_case_id uuid, p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid(); v_env text := public.current_env();
  v_case public.cases%rowtype; v_revision bigint;
begin
  if v_actor is null then raise exception using errcode='42501', message='not_authorized'; end if;
  select * into v_case from public.cases c where c.id=p_case_id and c.env=v_env for update;
  if not found or v_case.status <> 'dispatched' or v_case.multi_collab
    or not exists(select 1 from public.case_participants p
      where p.case_id=p_case_id and p.user_id=v_actor and p.role='translator'
        and p.access_revoked_at is null and p.work_status='active') then
    raise exception using errcode='P0002', message='case_unavailable';
  end if;
  if v_case.revision <> p_expected_revision then
    raise exception using errcode='40001', message='case_revision_conflict';
  end if;
  update public.cases c set status='task_completed',updated_at=now()
  where c.id=p_case_id and c.env=v_env and c.revision=p_expected_revision
  returning c.revision into v_revision;
  if not found then raise exception using errcode='40001', message='case_revision_conflict'; end if;
  update public.case_participants set work_status='completed',updated_by=v_actor,updated_at=now()
  where case_id=p_case_id and user_id=v_actor and role='translator' and access_revoked_at is null;
  perform private.record_case_mutation(
    p_case_id,v_env,v_actor,'complete_case_translation',
    array['status'],p_expected_revision,v_revision
  );
  return jsonb_build_object('caseId',p_case_id,'revision',v_revision,'status','task_completed');
end;
$$;

create or replace function public.complete_case_review_row(
  p_case_id uuid, p_review_row_id text, p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid(); v_env text := public.current_env();
  v_case public.cases%rowtype; v_rows jsonb; v_revision bigint;
begin
  if v_actor is null then raise exception using errcode='42501', message='not_authorized'; end if;
  select * into v_case from public.cases c where c.id=p_case_id and c.env=v_env for update;
  if not found or v_case.status not in ('task_completed','delivered','feedback') then
    raise exception using errcode='P0002', message='case_unavailable';
  end if;
  if not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(v_case.review_rows)='array'
    then v_case.review_rows else '[]'::jsonb end) r
    where r.value->>'id'=p_review_row_id and r.value->>'reviewerUserId'=v_actor::text
      and not coalesce((r.value->>'taskCompleted')::boolean,false)) then
    raise exception using errcode='42501', message='review_row_not_assigned_to_actor';
  end if;
  if v_case.revision <> p_expected_revision then
    raise exception using errcode='40001', message='case_revision_conflict';
  end if;
  select jsonb_agg(case when r.value->>'id'=p_review_row_id
    then r.value || jsonb_build_object('taskCompleted',true)
    else r.value end order by r.ordinality)
  into v_rows from jsonb_array_elements(v_case.review_rows) with ordinality r(value,ordinality);
  update public.cases c set review_rows=v_rows,updated_at=now()
  where c.id=p_case_id and c.env=v_env and c.revision=p_expected_revision
  returning c.revision into v_revision;
  if not found then raise exception using errcode='40001', message='case_revision_conflict'; end if;
  update public.case_participants set work_status='completed',updated_by=v_actor,updated_at=now()
  where case_id=p_case_id and user_id=v_actor and role='reviewer' and access_revoked_at is null;
  perform private.record_case_mutation(
    p_case_id,v_env,v_actor,'complete_case_review_row',
    array['review_rows'],p_expected_revision,v_revision
  );
  return jsonb_build_object(
    'caseId',p_case_id,'revision',v_revision,'status',v_case.status,'rowId',p_review_row_id
  );
end;
$$;

create or replace function public.revoke_case_participant_access(
  p_case_id uuid, p_user_id uuid, p_role text, p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid(); v_env text := public.current_env();
  v_case public.cases%rowtype; v_revision bigint;
begin
  if v_actor is null or not public.is_admin(v_actor) then
    raise exception using errcode='42501', message='not_authorized';
  end if;
  if p_role not in ('translator','reviewer') then
    raise exception using errcode='22023', message='invalid_participant_role';
  end if;
  select * into v_case from public.cases c where c.id=p_case_id and c.env=v_env for update;
  if not found then raise exception using errcode='P0002', message='case_unavailable'; end if;
  if not exists(select 1 from public.case_participants p
    where p.case_id=p_case_id and p.user_id=p_user_id and p.role=p_role
      and p.access_revoked_at is null) then
    raise exception using errcode='P0002', message='participant_unavailable';
  end if;
  if v_case.revision <> p_expected_revision then
    raise exception using errcode='40001', message='case_revision_conflict';
  end if;
  update public.case_participants set
    access_revoked_at=now(),access_revoked_by=v_actor,updated_by=v_actor,updated_at=now()
  where case_id=p_case_id and user_id=p_user_id and role=p_role and access_revoked_at is null;
  update public.cases c set updated_at=now()
  where c.id=p_case_id and c.env=v_env and c.revision=p_expected_revision
  returning c.revision into v_revision;
  if not found then raise exception using errcode='40001', message='case_revision_conflict'; end if;
  perform private.record_case_mutation(
    p_case_id,v_env,v_actor,'revoke_case_participant_access',
    array['participant_access'],p_expected_revision,v_revision
  );
  return jsonb_build_object(
    'caseId',p_case_id,'revision',v_revision,'revokedUserId',p_user_id,'role',p_role
  );
end;
$$;

revoke all on function public.accept_public_inquiry_case(uuid,bigint) from public,anon;
revoke all on function public.decline_public_inquiry_case(uuid,bigint,jsonb) from public,anon;
revoke all on function public.accept_inquiry_collab_row(uuid,text,bigint) from public,anon;
revoke all on function public.complete_case_collab_row(uuid,text,bigint) from public,anon;
revoke all on function public.complete_case_translation(uuid,bigint) from public,anon;
revoke all on function public.complete_case_review_row(uuid,text,bigint) from public,anon;
revoke all on function public.revoke_case_participant_access(uuid,uuid,text,bigint) from public,anon;
grant execute on function public.accept_public_inquiry_case(uuid,bigint) to authenticated,service_role;
grant execute on function public.decline_public_inquiry_case(uuid,bigint,jsonb) to authenticated,service_role;
grant execute on function public.accept_inquiry_collab_row(uuid,text,bigint) to authenticated,service_role;
grant execute on function public.complete_case_collab_row(uuid,text,bigint) to authenticated,service_role;
grant execute on function public.complete_case_translation(uuid,bigint) to authenticated,service_role;
grant execute on function public.complete_case_review_row(uuid,text,bigint) to authenticated,service_role;
grant execute on function public.revoke_case_participant_access(uuid,uuid,text,bigint) to authenticated,service_role;