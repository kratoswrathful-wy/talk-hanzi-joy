-- 1C：案件一般留言全員可追加；提問勾選全員可見，僅本案譯者或 admin 可改。
-- 一般成員不能整包覆寫刪掉別人的留言。
-- comments／clientQuestionForm 不進 permitted_fields 登錄，只走本函式。
-- 本檔只進本機候選；不准自行套用正式庫。

create or replace function public.update_case_social_fields(
  p_case_id uuid, p_expected_revision bigint, p_changes jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_env text := public.current_env();
  v_case public.cases%rowtype;
  v_admin boolean;
  v_revision bigint;
  v_comments jsonb;
  v_incoming jsonb;
  v_item jsonb;
  v_current_ids text[];
  v_incoming_ids text[];
begin
  if v_actor is null then raise exception using errcode='42501', message='not_authorized'; end if;
  if jsonb_typeof(coalesce(p_changes,'{}'::jsonb)) <> 'object' or p_changes='{}'::jsonb then
    raise exception using errcode='22023', message='changes_must_be_nonempty_object';
  end if;
  if exists(
    select 1 from jsonb_object_keys(p_changes) k
    where k not in ('comments','clientQuestionForm')
  ) then
    raise exception using errcode='22023', message='invalid_social_payload';
  end if;

  select * into v_case from public.cases c
  where c.id=p_case_id and c.env=v_env for update;
  if not found then raise exception using errcode='P0002', message='case_unavailable'; end if;

  v_admin := public.is_admin(v_actor);

  if p_changes?'clientQuestionForm' then
    if not v_admin and not exists(
      select 1 from public.case_participants p
      where p.case_id=p_case_id and p.user_id=v_actor
        and p.role='translator' and p.access_revoked_at is null
        and p.work_status <> 'cancelled'
    ) then
      raise exception using errcode='42501', message='field_not_permitted';
    end if;
    if jsonb_typeof(p_changes->'clientQuestionForm') <> 'boolean' then
      raise exception using errcode='22023', message='invalid_field_value_type';
    end if;
  end if;

  v_comments := coalesce(v_case.comments,'[]'::jsonb);
  if p_changes?'comments' then
    v_incoming := case when jsonb_typeof(p_changes->'comments')='array' then p_changes->'comments' else '[]'::jsonb end;
    select coalesce(array_agg(value->>'id'), '{}') into v_current_ids
    from jsonb_array_elements(case when jsonb_typeof(v_comments)='array' then v_comments else '[]'::jsonb end) value
    where coalesce(value->>'id','') <> '';
    select coalesce(array_agg(value->>'id'), '{}') into v_incoming_ids
    from jsonb_array_elements(v_incoming) value
    where coalesce(value->>'id','') <> '';
    if not v_admin then
      if exists(
        select 1 from unnest(v_current_ids) id
        where id is not null and not (id = any(v_incoming_ids))
      ) then
        raise exception using errcode='42501', message='comment_not_deletable';
      end if;
      for v_item in select value from jsonb_array_elements(v_incoming) value
      loop
        if coalesce(v_item->>'id','') <> ''
          and not (v_item->>'id' = any(v_current_ids))
        then
          v_comments := coalesce(v_comments,'[]'::jsonb) || jsonb_build_array(v_item);
        end if;
      end loop;
    else
      v_comments := v_incoming;
    end if;
  end if;

  if v_case.revision <> p_expected_revision then
    raise exception using errcode='40001', message='case_revision_conflict';
  end if;

  update public.cases c set
    comments=case when p_changes?'comments' then v_comments else c.comments end,
    client_question_form=case when p_changes?'clientQuestionForm'
      then (p_changes->>'clientQuestionForm')::boolean else c.client_question_form end,
    updated_at=now()
  where c.id=p_case_id and c.env=v_env and c.revision=p_expected_revision
  returning c.revision into v_revision;
  if not found then raise exception using errcode='40001', message='case_revision_conflict'; end if;
  perform private.record_case_mutation(
    p_case_id,v_env,v_actor,'update_case_social_fields',
    array(select jsonb_object_keys(p_changes)),p_expected_revision,v_revision
  );
  return jsonb_build_object('caseId',p_case_id,'revision',v_revision);
end;
$$;

revoke all on function public.update_case_social_fields(uuid,bigint,jsonb)
  from public,anon;
grant execute on function public.update_case_social_fields(uuid,bigint,jsonb)
  to authenticated,service_role;

comment on function public.update_case_social_fields(uuid,bigint,jsonb) is
  '1C：一般留言可追加；提問勾選僅本案譯者或 admin。公開入口須先走維護守門。';

do $wrap$
begin
  if to_regprocedure('private.install_maintenance_write_wrapper(text, text)') is null then
    raise exception using errcode='P0001',
      message='maintenance_wrapper_missing: install_maintenance_write_wrapper required before update_case_social_fields';
  end if;
  perform private.install_maintenance_write_wrapper(
    'update_case_social_fields', 'uuid, bigint, jsonb'
  );
end
$wrap$;
