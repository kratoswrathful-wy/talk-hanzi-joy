-- 留言刪除必須改 private.update_case_social_fields_impl。
-- 前一檔若只 REPLACE public 入口，維護包裝會把 wrapper 裝回去、舊 impl 仍禁止譯者刪除。
-- 本檔只進隔離候選；不准自行套用正式庫。

create or replace function private.update_case_social_fields_impl(
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
    v_comments := public.merge_comment_jsonb(
      v_comments,
      case when jsonb_typeof(p_changes->'comments')='array' then p_changes->'comments' else '[]'::jsonb end,
      v_actor,
      v_admin,
      now()
    );
  end if;

  if v_case.revision <> p_expected_revision then
    raise exception using errcode='P0001', message='case_revision_conflict';
  end if;

  update public.cases c set
    comments=case when p_changes?'comments' then v_comments else c.comments end,
    client_question_form=case when p_changes?'clientQuestionForm'
      then (p_changes->>'clientQuestionForm')::boolean else c.client_question_form end,
    updated_at=now()
  where c.id=p_case_id and c.env=v_env and c.revision=p_expected_revision
  returning c.revision into v_revision;
  if not found then raise exception using errcode='P0001', message='case_revision_conflict'; end if;
  perform private.record_case_mutation(
    p_case_id,v_env,v_actor,'update_case_social_fields',
    array(select jsonb_object_keys(p_changes)),p_expected_revision,v_revision
  );
  return jsonb_build_object('caseId',p_case_id,'revision',v_revision);
end;
$$;

revoke all on function private.update_case_social_fields_impl(uuid,bigint,jsonb)
  from public,anon;
comment on function private.update_case_social_fields_impl(uuid,bigint,jsonb) is
  '一般留言可追加或刪自己的；提問勾選僅本案譯者或 PM 以上。由 public wrapper 呼叫。';
