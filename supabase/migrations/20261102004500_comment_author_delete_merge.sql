-- 留言／回覆刪除：以 authorUserId 或 PM 以上合併，禁止改作者再刪別人。
-- 本檔只進隔離候選；不准自行套用正式庫。

create or replace function public.merge_comment_jsonb(
  p_current jsonb,
  p_incoming jsonb,
  p_actor uuid,
  p_is_pm_plus boolean,
  p_now timestamptz
) returns jsonb
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_current jsonb := case
    when jsonb_typeof(coalesce(p_current, '[]'::jsonb)) = 'array' then coalesce(p_current, '[]'::jsonb)
    else '[]'::jsonb
  end;
  v_incoming jsonb := case
    when jsonb_typeof(coalesce(p_incoming, '[]'::jsonb)) = 'array' then coalesce(p_incoming, '[]'::jsonb)
    else '[]'::jsonb
  end;
  v_working jsonb := v_current;
  v_cur jsonb;
  v_next jsonb;
  v_id text;
  v_owner text;
  v_has_live_child boolean;
  v_tombstone jsonb;
begin
  if p_actor is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  for v_cur in select value from jsonb_array_elements(v_working) value
  loop
    v_id := v_cur->>'id';
    if coalesce(v_id, '') = '' then
      continue;
    end if;
    if coalesce(v_cur->>'deleted', '') in ('true', 't') then
      continue;
    end if;

    select value into v_next
    from jsonb_array_elements(v_incoming) value
    where value->>'id' = v_id
    limit 1;

    if v_next is not null and coalesce(v_next->>'deleted', '') not in ('true', 't') then
      continue;
    end if;

    v_owner := nullif(v_cur->>'authorUserId', '');
    if not p_is_pm_plus and (v_owner is null or v_owner <> p_actor::text) then
      raise exception using errcode = '42501', message = 'comment_not_deletable';
    end if;

    select exists(
      select 1
      from jsonb_array_elements(v_working) ch
      where ch->>'replyTo' = v_id
        and coalesce(ch->>'deleted', '') not in ('true', 't')
        and coalesce(ch->>'id', '') <> v_id
        and exists (
          select 1
          from jsonb_array_elements(v_incoming) inc
          where inc->>'id' = ch->>'id'
            and coalesce(inc->>'deleted', '') not in ('true', 't')
        )
    ) into v_has_live_child;

    if v_has_live_child then
      v_tombstone := (v_cur - 'imageUrls' - 'fileUrls')
        || jsonb_build_object(
          'deleted', true,
          'deletedAt', p_now,
          'deletedByUserId', p_actor::text,
          'content', '留言已刪除'
        );
      if v_cur ? 'text' then
        v_tombstone := v_tombstone || jsonb_build_object('text', '留言已刪除');
      end if;
      v_working := (
        select coalesce(jsonb_agg(
          case when value->>'id' = v_id then v_tombstone else value end
        ), '[]'::jsonb)
        from jsonb_array_elements(v_working) value
      );
    else
      v_working := (
        select coalesce(jsonb_agg(value), '[]'::jsonb)
        from jsonb_array_elements(v_working) value
        where value->>'id' <> v_id
      );
    end if;
  end loop;

  for v_next in select value from jsonb_array_elements(v_incoming) value
  loop
    v_id := v_next->>'id';
    if coalesce(v_id, '') = '' then
      continue;
    end if;
    if coalesce(v_next->>'deleted', '') in ('true', 't') then
      continue;
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_current) c where c->>'id' = v_id
    ) then
      continue;
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_working) c where c->>'id' = v_id
    ) then
      continue;
    end if;
    v_working := v_working || jsonb_build_array(
      (v_next - 'deleted' - 'deletedAt' - 'deletedByUserId')
      || jsonb_build_object('authorUserId', p_actor::text)
    );
  end loop;

  return v_working;
end;
$$;

create or replace function public.tg_merge_json_comments()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_pm boolean;
  v_col text := tg_argv[0];
  v_old jsonb;
  v_new jsonb;
  v_merged jsonb;
begin
  if v_actor is null then
    return new;
  end if;
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  v_pm := public.is_admin(v_actor);
  if v_col = 'comments' then
    v_old := to_jsonb(old) -> 'comments';
    v_new := to_jsonb(new) -> 'comments';
  elsif v_col = 'internal_comments' then
    v_old := to_jsonb(old) -> 'internal_comments';
    v_new := to_jsonb(new) -> 'internal_comments';
  elsif v_col = 'notes' then
    v_old := to_jsonb(old) -> 'notes';
    v_new := to_jsonb(new) -> 'notes';
  else
    return new;
  end if;
  if v_new is not distinct from v_old then
    return new;
  end if;
  v_merged := public.merge_comment_jsonb(v_old, v_new, v_actor, v_pm, now());
  if v_col = 'comments' then
    new.comments := v_merged;
  elsif v_col = 'internal_comments' then
    new.internal_comments := v_merged;
  elsif v_col = 'notes' then
    new.notes := v_merged;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cases_merge_comments on public.cases;
create trigger trg_cases_merge_comments
  before update of comments on public.cases
  for each row execute function public.tg_merge_json_comments('comments');

drop trigger if exists trg_cases_merge_internal_comments on public.cases;
create trigger trg_cases_merge_internal_comments
  before update of internal_comments on public.cases
  for each row execute function public.tg_merge_json_comments('internal_comments');

drop trigger if exists trg_fees_merge_notes on public.fees;
create trigger trg_fees_merge_notes
  before update of notes on public.fees
  for each row execute function public.tg_merge_json_comments('notes');

drop trigger if exists trg_invoices_merge_comments on public.invoices;
create trigger trg_invoices_merge_comments
  before update of comments on public.invoices
  for each row execute function public.tg_merge_json_comments('comments');

drop trigger if exists trg_client_invoices_merge_comments on public.client_invoices;
create trigger trg_client_invoices_merge_comments
  before update of comments on public.client_invoices
  for each row execute function public.tg_merge_json_comments('comments');

drop trigger if exists trg_internal_notes_merge_comments on public.internal_notes;
create trigger trg_internal_notes_merge_comments
  before update of comments on public.internal_notes
  for each row execute function public.tg_merge_json_comments('comments');

do $trg$
begin
  if to_regclass('public.invoice_internal_comments') is not null then
    drop trigger if exists trg_invoice_internal_comments_merge on public.invoice_internal_comments;
    create trigger trg_invoice_internal_comments_merge
      before update of comments on public.invoice_internal_comments
      for each row execute function public.tg_merge_json_comments('comments');
  end if;
end
$trg$;

-- 此函式已被維護包裝改名為 private.*_impl；只改 public 入口會立刻被 wrapper 蓋回舊實作。
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

revoke all on function public.update_case_social_fields(uuid,bigint,jsonb)
  from public,anon;
grant execute on function public.update_case_social_fields(uuid,bigint,jsonb)
  to authenticated,service_role;

comment on function public.update_case_social_fields(uuid,bigint,jsonb) is
  '一般留言可追加或刪自己的；提問勾選僅本案譯者或 PM 以上。公開入口須先走維護守門。';

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
