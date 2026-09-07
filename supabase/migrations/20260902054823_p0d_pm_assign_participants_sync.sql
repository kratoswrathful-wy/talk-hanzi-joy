-- P0-D：PM／Executive 指派與 case_participants 同步；apply_case_update 剝除指派鍵；
-- admin_create_case 原子建 participant；permission_settings 每 env 唯一。idempotent。

-- ── 1) permission_settings：test 重複列清理（僅 config 完全相同）＋ env 唯一 ──
create or replace function private.p0_dedupe_permission_settings_env(p_env text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_count int;
  v_distinct_configs int;
begin
  select count(*) into v_count from public.permission_settings where env = p_env;
  if v_count <= 1 then
    return;
  end if;
  select count(distinct config::text) into v_distinct_configs
  from public.permission_settings where env = p_env;
  if v_distinct_configs > 1 then
    raise exception using errcode = '22023', message = 'permission_settings_test_config_conflict';
  end if;
  delete from public.permission_settings ps
  where ps.env = p_env
    and ps.id <> (
      select p2.id
      from public.permission_settings p2
      where p2.env = p_env
      order by p2.id::text asc
      limit 1
    );
end;
$$;

revoke all on function private.p0_dedupe_permission_settings_env(text)
  from public, anon, authenticated;

comment on function private.p0_dedupe_permission_settings_env(text) is
  'P0-D：permission_settings 同 env 多筆且 config 相同時，保留 id::text 最小者；config 不同則 fail closed。';

select private.p0_dedupe_permission_settings_env('test');

create unique index if not exists permission_settings_env_unique
  on public.permission_settings (env);

comment on index public.permission_settings_env_unique is
  'P0-D：每 env 恰好一筆 permission_settings；RPC fail-closed 依賴此約束。';

create or replace function private.p0_permission_settings_canonical_id(p_env text)
returns uuid
language sql
stable
set search_path = pg_catalog
as $$
  select ps.id
  from public.permission_settings ps
  where ps.env = p_env
  order by ps.id::text asc
  limit 1;
$$;

revoke all on function private.p0_permission_settings_canonical_id(text)
  from public, anon, authenticated;

comment on function private.p0_permission_settings_canonical_id(text) is
  'P0-D：permission_settings 同 env 多筆且 config 相同時，保留 id::text 最小者。';

-- ── 2) participant 同步 helper ────────────────────────────────────────────────
create or replace function private.p0_is_valid_uuid(p_text text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_text is not null
    and p_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
$$;

revoke all on function private.p0_is_valid_uuid(text)
  from public, anon, authenticated;

create or replace function private.p0_collect_desired_participants(
  p_multi_collab boolean,
  p_translator jsonb,
  p_translator_user_id uuid,
  p_collab_rows jsonb,
  p_review_rows jsonb,
  p_reviewer text default '',
  p_reviewer_user_id uuid default null
)
returns table(user_id uuid, participant_role text)
language plpgsql
stable
set search_path = pg_catalog
as $$
begin
  if coalesce(p_multi_collab, false) then
    if jsonb_typeof(coalesce(p_collab_rows, '[]'::jsonb)) = 'array' then
      return query
      select distinct (r.value->>'translatorUserId')::uuid, 'translator'::text
      from jsonb_array_elements(coalesce(p_collab_rows, '[]'::jsonb)) r(value)
      where private.p0_is_valid_uuid(r.value->>'translatorUserId');
    end if;
  elsif jsonb_typeof(coalesce(p_translator, '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(p_translator, '[]'::jsonb)) > 0
    and p_translator_user_id is not null
  then
    return query select p_translator_user_id, 'translator';
  end if;

  if jsonb_typeof(coalesce(p_review_rows, '[]'::jsonb)) = 'array'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(p_review_rows, '[]'::jsonb)) r(value)
      where private.p0_is_valid_uuid(r.value->>'reviewerUserId')
    )
  then
    return query
    select distinct (r.value->>'reviewerUserId')::uuid, 'reviewer'::text
    from jsonb_array_elements(coalesce(p_review_rows, '[]'::jsonb)) r(value)
    where private.p0_is_valid_uuid(r.value->>'reviewerUserId');
  elsif nullif(trim(coalesce(p_reviewer, '')), '') is not null
    and p_reviewer_user_id is not null
  then
    return query select p_reviewer_user_id, 'reviewer';
  end if;
end;
$$;

revoke all on function private.p0_collect_desired_participants(boolean, jsonb, uuid, jsonb, jsonb, text, uuid)
  from public, anon, authenticated;

create or replace function private.p0_assignment_profile_name(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_name text;
begin
  perform private.p0b_require_profile(p_user_id);
  v_name := private.case_actor_display_name(p_user_id);
  if v_name is null then
    raise exception using errcode = '22023', message = 'invalid_assignee_profile';
  end if;
  return v_name;
end;
$$;

revoke all on function private.p0_assignment_profile_name(uuid)
  from public, anon, authenticated;

create or replace function private.p0_normalize_collab_rows(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_row jsonb;
  v_uid uuid;
  v_name text;
  v_out jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    return '[]'::jsonb;
  end if;
  for v_row in
    select r.value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r(value)
  loop
    if private.p0_is_valid_uuid(v_row->>'translatorUserId') then
      v_uid := (v_row->>'translatorUserId')::uuid;
      if nullif(trim(v_row->>'translator'), '') is null then
        raise exception using errcode = '22023', message = 'hidden_translator_participant';
      end if;
      v_name := private.p0_assignment_profile_name(v_uid);
      v_row := v_row || jsonb_build_object('translator', v_name, 'translatorUserId', v_uid);
    elsif nullif(trim(v_row->>'translator'), '') is not null then
      raise exception using errcode = '22023', message = 'missing_translator_user_id';
    end if;
    v_out := v_out || jsonb_build_array(v_row);
  end loop;
  return v_out;
end;
$$;

revoke all on function private.p0_normalize_collab_rows(jsonb)
  from public, anon, authenticated;

create or replace function private.p0_normalize_review_rows(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_row jsonb;
  v_uid uuid;
  v_name text;
  v_out jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    return '[]'::jsonb;
  end if;
  for v_row in
    select r.value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r(value)
  loop
    if private.p0_is_valid_uuid(v_row->>'reviewerUserId') then
      v_uid := (v_row->>'reviewerUserId')::uuid;
      if nullif(trim(v_row->>'reviewer'), '') is null then
        raise exception using errcode = '22023', message = 'hidden_reviewer_participant';
      end if;
      v_name := private.p0_assignment_profile_name(v_uid);
      v_row := v_row || jsonb_build_object('reviewer', v_name, 'reviewerUserId', v_uid);
    elsif nullif(trim(v_row->>'reviewer'), '') is not null then
      raise exception using errcode = '22023', message = 'missing_reviewer_user_id';
    end if;
    v_out := v_out || jsonb_build_array(v_row);
  end loop;
  return v_out;
end;
$$;

revoke all on function private.p0_normalize_review_rows(jsonb)
  from public, anon, authenticated;

create or replace function private.p0_resolve_assignment_user_ids(
  p_case_id uuid,
  p_patch jsonb,
  p_multi_collab boolean,
  p_translator jsonb,
  p_reviewer text,
  p_review_rows jsonb,
  out o_translator_user_id uuid,
  out o_reviewer_user_id uuid,
  out o_translator jsonb,
  out o_reviewer text
)
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  v_changing_translator boolean := p_patch ? 'translator' or p_patch ? 'translator_user_id';
  v_changing_reviewer boolean := p_patch ? 'reviewer' or p_patch ? 'reviewer_user_id'
    or p_patch ? 'review_rows';
begin
  o_translator := coalesce(p_translator, '[]'::jsonb);
  o_reviewer := coalesce(p_reviewer, '');

  if coalesce(p_multi_collab, false) then
    o_translator_user_id := null;
  elsif v_changing_translator then
    if p_patch ? 'translator_user_id'
      and private.p0_is_valid_uuid(p_patch->>'translator_user_id')
    then
      o_translator_user_id := (p_patch->>'translator_user_id')::uuid;
      o_translator := jsonb_build_array(
        private.p0_assignment_profile_name(o_translator_user_id)
      );
    elsif jsonb_typeof(o_translator) = 'array' and jsonb_array_length(o_translator) > 0 then
      raise exception using errcode = '22023', message = 'missing_translator_user_id';
    else
      o_translator_user_id := null;
      o_translator := '[]'::jsonb;
    end if;
  else
    select cp.user_id into o_translator_user_id
    from public.case_participants cp
    where cp.case_id = p_case_id
      and cp.role = 'translator'
      and cp.access_revoked_at is null
    order by cp.updated_at desc
    limit 1;
  end if;

  if jsonb_typeof(coalesce(p_review_rows, '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(p_review_rows, '[]'::jsonb)) > 0
  then
    o_reviewer_user_id := null;
    o_reviewer := '';
  elsif v_changing_reviewer then
    if p_patch ? 'reviewer_user_id'
      and private.p0_is_valid_uuid(p_patch->>'reviewer_user_id')
    then
      o_reviewer_user_id := (p_patch->>'reviewer_user_id')::uuid;
      o_reviewer := private.p0_assignment_profile_name(o_reviewer_user_id);
    elsif nullif(trim(o_reviewer), '') is not null then
      raise exception using errcode = '22023', message = 'missing_reviewer_user_id';
    else
      o_reviewer_user_id := null;
      o_reviewer := '';
    end if;
  else
    select cp.user_id into o_reviewer_user_id
    from public.case_participants cp
    where cp.case_id = p_case_id
      and cp.role = 'reviewer'
      and cp.access_revoked_at is null
    order by cp.updated_at desc
    limit 1;
  end if;
end;
$$;

revoke all on function private.p0_resolve_assignment_user_ids(uuid, jsonb, boolean, jsonb, text, jsonb)
  from public, anon, authenticated;

create or replace function private.p0_assert_pm_assign_patch_keys(p_patch jsonb)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_key text;
  v_allowed text[] := array[
    'translator', 'translation_deadline', 'reviewer', 'review_deadline',
    'collab_rows', 'review_rows', 'multi_collab', 'collab_count', 'status',
    'translator_user_id', 'reviewer_user_id'
  ];
begin
  if p_patch is null or p_patch = '{}'::jsonb then
    return 'empty_patch';
  end if;
  select k into v_key
  from jsonb_object_keys(p_patch) t(k)
  where k <> all(v_allowed)
  limit 1;
  if v_key is not null then
    return 'unknown_patch_key';
  end if;
  return null;
end;
$$;

revoke all on function private.p0_assert_pm_assign_patch_keys(jsonb)
  from public, anon, authenticated;

create or replace function private.p0_sync_case_participants_from_desired(
  p_case_id uuid,
  p_actor uuid,
  p_old_desired jsonb,
  p_new_desired jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_key text;
  v_uid uuid;
  v_role text;
begin
  for v_key in
    select ok from jsonb_object_keys(coalesce(p_old_desired, '{}'::jsonb)) ok
    except
    select nk from jsonb_object_keys(coalesce(p_new_desired, '{}'::jsonb)) nk
  loop
    v_uid := split_part(v_key, ':', 1)::uuid;
    v_role := split_part(v_key, ':', 2);
    update public.case_participants cp set
      access_revoked_at = now(),
      access_revoked_by = p_actor,
      updated_by = p_actor,
      updated_at = now()
    where cp.case_id = p_case_id
      and cp.user_id = v_uid
      and cp.role = v_role
      and cp.access_revoked_at is null;
  end loop;

  for v_key in
    select nk from jsonb_object_keys(coalesce(p_new_desired, '{}'::jsonb)) nk
  loop
    v_uid := split_part(v_key, ':', 1)::uuid;
    v_role := split_part(v_key, ':', 2);
    if v_role not in ('translator', 'reviewer') then
      raise exception using errcode = '22023', message = 'invalid_participant_role';
    end if;
    perform private.p0b_require_profile(v_uid);
    insert into public.case_participants(
      case_id, user_id, role, work_status, source, created_by, updated_by
    ) values (
      p_case_id, v_uid, v_role, 'active', 'pm_assign', p_actor, p_actor
    )
    on conflict (case_id, user_id, role) do update set
      work_status = 'active',
      source = 'pm_assign',
      access_revoked_at = null,
      access_revoked_by = null,
      updated_by = p_actor,
      updated_at = now();
  end loop;
end;
$$;

revoke all on function private.p0_sync_case_participants_from_desired(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;

create or replace function private.p0_desired_participants_map(
  p_multi_collab boolean,
  p_translator jsonb,
  p_translator_user_id uuid,
  p_collab_rows jsonb,
  p_review_rows jsonb,
  p_reviewer text default '',
  p_reviewer_user_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  v_map jsonb := '{}'::jsonb;
  v_rec record;
begin
  for v_rec in
    select d.user_id, d.participant_role
    from private.p0_collect_desired_participants(
      p_multi_collab, p_translator, p_translator_user_id, p_collab_rows, p_review_rows,
      p_reviewer, p_reviewer_user_id
    ) d
  loop
    v_map := v_map || jsonb_build_object(
      v_rec.user_id::text || ':' || v_rec.participant_role, true
    );
  end loop;
  return v_map;
end;
$$;

revoke all on function private.p0_desired_participants_map(boolean, jsonb, uuid, jsonb, jsonb, text, uuid)
  from public, anon, authenticated;

-- ── 3) PM 指派 RPC ─────────────────────────────────────────────────────────────
create or replace function public.pm_update_case_assignments(
  p_case_id uuid,
  p_expected_revision bigint,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_env text := public.current_env();
  v_row public.cases%rowtype;
  v_patch_clean jsonb;
  v_err text;
  v_multi_collab boolean;
  v_translator jsonb;
  v_collab_rows jsonb;
  v_review_rows jsonb;
  v_translator_user_id uuid;
  v_reviewer text;
  v_reviewer_user_id uuid;
  v_old_translator_user_id uuid;
  v_old_reviewer_user_id uuid;
  v_old_map jsonb;
  v_new_map jsonb;
  v_revision bigint;
  v_changed_fields text[];
begin
  if v_uid is null or not public.is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_revision');
  end if;

  v_err := private.p0_assert_pm_assign_patch_keys(p_patch);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  v_patch_clean := p_patch;

  select * into v_row
  from public.cases c
  where c.id = p_case_id and c.env = v_env
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;
  if v_row.revision is distinct from p_expected_revision then
    return jsonb_build_object('ok', false, 'error', 'stale_revision');
  end if;

  v_multi_collab := coalesce(
    case when v_patch_clean ? 'multi_collab' then (v_patch_clean->>'multi_collab')::boolean end,
    v_row.multi_collab,
    false
  );
  v_translator := coalesce(v_patch_clean->'translator', v_row.translator, '[]'::jsonb);
  v_collab_rows := coalesce(v_patch_clean->'collab_rows', v_row.collab_rows, '[]'::jsonb);
  v_review_rows := coalesce(v_patch_clean->'review_rows', v_row.review_rows, '[]'::jsonb);
  v_reviewer := coalesce(
    case when v_patch_clean ? 'reviewer' then v_patch_clean->>'reviewer' end,
    v_row.reviewer,
    ''
  );

  if v_patch_clean ? 'reviewer_user_id'
    and not private.p0_is_valid_uuid(v_patch_clean->>'reviewer_user_id')
  then
    return jsonb_build_object('ok', false, 'error', 'invalid_reviewer_user_id');
  end if;
  if v_patch_clean ? 'translator_user_id'
    and not private.p0_is_valid_uuid(v_patch_clean->>'translator_user_id')
  then
    return jsonb_build_object('ok', false, 'error', 'invalid_translator_user_id');
  end if;

  if v_patch_clean ? 'collab_rows' then
    v_collab_rows := private.p0_normalize_collab_rows(v_collab_rows);
  end if;
  if v_patch_clean ? 'review_rows' then
    v_review_rows := private.p0_normalize_review_rows(v_review_rows);
  end if;

  select r.o_translator_user_id, r.o_reviewer_user_id, r.o_translator, r.o_reviewer
    into v_translator_user_id, v_reviewer_user_id, v_translator, v_reviewer
  from private.p0_resolve_assignment_user_ids(
    p_case_id, v_patch_clean, v_multi_collab, v_translator, v_reviewer, v_review_rows
  ) as r;

  select cp.user_id into v_old_translator_user_id
  from public.case_participants cp
  where cp.case_id = p_case_id
    and cp.role = 'translator'
    and cp.access_revoked_at is null
  order by cp.updated_at desc
  limit 1;
  select cp.user_id into v_old_reviewer_user_id
  from public.case_participants cp
  where cp.case_id = p_case_id
    and cp.role = 'reviewer'
    and cp.access_revoked_at is null
  order by cp.updated_at desc
  limit 1;
  v_old_map := private.p0_desired_participants_map(
    v_row.multi_collab, v_row.translator, v_old_translator_user_id,
    v_row.collab_rows, v_row.review_rows, v_row.reviewer, v_old_reviewer_user_id
  );
  v_new_map := private.p0_desired_participants_map(
    v_multi_collab, v_translator, v_translator_user_id, v_collab_rows, v_review_rows,
    v_reviewer, v_reviewer_user_id
  );

  update public.cases c set
    translator = case
      when v_patch_clean ? 'translator' or v_patch_clean ? 'translator_user_id' then v_translator
      else c.translator end,
    translation_deadline = case
      when v_patch_clean ? 'translation_deadline'
        and jsonb_typeof(v_patch_clean->'translation_deadline') = 'string'
      then (v_patch_clean->>'translation_deadline')::timestamptz
      when v_patch_clean ? 'translation_deadline' and v_patch_clean->'translation_deadline' = 'null'::jsonb
      then null
      else c.translation_deadline end,
    reviewer = case
      when v_patch_clean ? 'reviewer' or v_patch_clean ? 'reviewer_user_id'
        or v_patch_clean ? 'review_rows'
      then coalesce(v_reviewer, '')
      else c.reviewer end,
    review_deadline = case
      when v_patch_clean ? 'review_deadline'
        and jsonb_typeof(v_patch_clean->'review_deadline') = 'string'
      then (v_patch_clean->>'review_deadline')::timestamptz
      when v_patch_clean ? 'review_deadline' and v_patch_clean->'review_deadline' = 'null'::jsonb
      then null
      else c.review_deadline end,
    collab_rows = case when v_patch_clean ? 'collab_rows' then v_collab_rows else c.collab_rows end,
    review_rows = case when v_patch_clean ? 'review_rows' then v_review_rows else c.review_rows end,
    multi_collab = case when v_patch_clean ? 'multi_collab' then v_multi_collab else c.multi_collab end,
    collab_count = case
      when v_patch_clean ? 'collab_count' then (v_patch_clean->>'collab_count')::numeric
      else c.collab_count end,
    status = case when v_patch_clean ? 'status' then coalesce(v_patch_clean->>'status', c.status) else c.status end,
    updated_at = now()
  where c.id = p_case_id
    and c.revision = p_expected_revision
    and c.env = v_env
  returning c.revision into v_revision;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'stale_revision');
  end if;

  perform private.p0_sync_case_participants_from_desired(
    p_case_id, v_uid, v_old_map, v_new_map
  );

  select array_agg(k order by k)
    into v_changed_fields
  from jsonb_object_keys(v_patch_clean) t(k)
  where k not in ('translator_user_id', 'reviewer_user_id');

  perform private.record_case_mutation(
    p_case_id, v_env, v_uid, 'pm_update_case_assignments',
    coalesce(v_changed_fields, '{}'::text[]),
    p_expected_revision, v_revision
  );

  return jsonb_build_object(
    'ok', true,
    'id', p_case_id,
    'revision', v_revision
  );
exception
  when sqlstate '22023' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

revoke all on function public.pm_update_case_assignments(uuid, bigint, jsonb) from public, anon;
grant execute on function public.pm_update_case_assignments(uuid, bigint, jsonb)
  to authenticated, service_role;

comment on function public.pm_update_case_assignments(uuid, bigint, jsonb) is
  'P0-D：PM／Executive 指派；同步 cases 顯示欄位與 case_participants；須可信 user_id。';

-- ── 4) apply_case_update：剝除指派鍵 ───────────────────────────────────────────
create or replace function public.apply_case_update(
  p_case_id uuid,
  p_patch jsonb,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_env text := public.current_env();
  v_row public.cases%rowtype;
  v_patch public.cases%rowtype;
  v_patch_clean jsonb;
  v_updated_at timestamptz;
  v_revision bigint;
  v_unknown text;
  v_changed_fields text[];
  v_assignment_key text;
begin
  if v_uid is null or not public.is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  if p_expected_revision is null or p_expected_revision < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_revision');
  end if;

  if p_patch is null or p_patch = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'empty_patch');
  end if;

  v_patch_clean := p_patch
    - 'id'
    - 'env'
    - 'created_at'
    - 'created_by'
    - 'revision'
    - 'updated_at'
    - 'login_account'
    - 'login_password'
    - 'login_url'
    - 'other_login_info'
    - 'tools'
    - 'question_tools'
    - 'tool_field_values';

  if v_patch_clean = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'empty_patch_after_filter');
  end if;

  select k into v_assignment_key
  from jsonb_object_keys(v_patch_clean) t(k)
  where k in (
    'translator', 'translation_deadline', 'reviewer', 'review_deadline',
    'collab_rows', 'review_rows', 'multi_collab', 'collab_count'
  )
  limit 1;

  if v_assignment_key is not null then
    return jsonb_build_object('ok', false, 'error', 'assignment_field_use_pm_rpc');
  end if;

  select k into v_unknown
  from jsonb_object_keys(v_patch_clean) as t(k)
  where k not in (
    'billing_unit',
    'body_content',
    'case_reference_materials',
    'cat_tool_enabled',
    'category',
    'change_log_enabled_at',
    'client',
    'client_case_link',
    'client_guidelines',
    'client_po_number',
    'client_question_form',
    'client_receipt',
    'client_receipt_files',
    'comments',
    'common_info',
    'common_links',
    'contact',
    'custom_guidelines_url',
    'decline_records',
    'delivery_method',
    'delivery_method_files',
    'dispatch_route',
    'edit_logs',
    'execution_tool',
    'fee_entry',
    'icon_url',
    'inquiry_note',
    'inquiry_slack_records',
    'internal_comments',
    'internal_note_form',
    'internal_records',
    'internal_review_final',
    'keyword',
    'online_tool_filename',
    'online_tool_project',
    'process_note',
    'question_form',
    'reference_materials',
    'series_reference_materials',
    'source_files',
    'status',
    'task_status',
    'title',
    'track_changes',
    'translator_final',
    'unit_count',
    'work_groups',
    'work_type',
    'working_files'
  )
  limit 1;

  if v_unknown is not null then
    return jsonb_build_object('ok', false, 'error', 'unknown_patch_key');
  end if;

  select array_agg(k order by k)
    into v_changed_fields
  from jsonb_object_keys(v_patch_clean) as t(k);

  select * into v_row
  from public.cases c
  where c.id = p_case_id
    and c.env = v_env
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  if v_row.revision is distinct from p_expected_revision then
    return jsonb_build_object('ok', false, 'error', 'stale_revision');
  end if;

  v_patch := jsonb_populate_record(v_row, v_patch_clean);

  update public.cases c set
    billing_unit = v_patch.billing_unit,
    body_content = v_patch.body_content,
    case_reference_materials = v_patch.case_reference_materials,
    cat_tool_enabled = v_patch.cat_tool_enabled,
    category = v_patch.category,
    change_log_enabled_at = v_patch.change_log_enabled_at,
    client = v_patch.client,
    client_case_link = v_patch.client_case_link,
    client_guidelines = v_patch.client_guidelines,
    client_po_number = v_patch.client_po_number,
    client_question_form = v_patch.client_question_form,
    client_receipt = v_patch.client_receipt,
    client_receipt_files = v_patch.client_receipt_files,
    comments = v_patch.comments,
    common_info = v_patch.common_info,
    common_links = v_patch.common_links,
    contact = v_patch.contact,
    custom_guidelines_url = v_patch.custom_guidelines_url,
    decline_records = v_patch.decline_records,
    delivery_method = v_patch.delivery_method,
    delivery_method_files = v_patch.delivery_method_files,
    dispatch_route = v_patch.dispatch_route,
    edit_logs = v_patch.edit_logs,
    execution_tool = v_patch.execution_tool,
    fee_entry = v_patch.fee_entry,
    icon_url = v_patch.icon_url,
    inquiry_note = v_patch.inquiry_note,
    inquiry_slack_records = v_patch.inquiry_slack_records,
    internal_comments = v_patch.internal_comments,
    internal_note_form = v_patch.internal_note_form,
    internal_records = v_patch.internal_records,
    internal_review_final = v_patch.internal_review_final,
    keyword = v_patch.keyword,
    online_tool_filename = v_patch.online_tool_filename,
    online_tool_project = v_patch.online_tool_project,
    process_note = v_patch.process_note,
    question_form = v_patch.question_form,
    reference_materials = v_patch.reference_materials,
    series_reference_materials = v_patch.series_reference_materials,
    source_files = v_patch.source_files,
    status = v_patch.status,
    task_status = v_patch.task_status,
    title = v_patch.title,
    track_changes = v_patch.track_changes,
    translator_final = v_patch.translator_final,
    unit_count = v_patch.unit_count,
    updated_at = now(),
    work_groups = v_patch.work_groups,
    work_type = v_patch.work_type,
    working_files = v_patch.working_files
  where c.id = p_case_id
    and c.revision = p_expected_revision
    and c.env = v_env
  returning c.updated_at, c.revision into v_updated_at, v_revision;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'stale_revision');
  end if;

  perform private.record_case_mutation(
    p_case_id, v_env, v_uid, 'apply_case_update',
    coalesce(v_changed_fields, '{}'::text[]),
    p_expected_revision, v_revision
  );

  return jsonb_build_object(
    'ok', true,
    'id', p_case_id,
    'updated_at', v_updated_at,
    'revision', v_revision
  );
end;
$$;

comment on function public.apply_case_update(uuid, jsonb, bigint) is
  'P0-D：admin-only；指派欄位改走 pm_update_case_assignments；成功寫入 case_mutation_audit。';

-- ── 5) admin_create_case：允許 meta user_id ＋原子 participant ─────────────────
create or replace function private.p0_admin_create_validate_payload(p_payload jsonb)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_key text;
  v_forbidden text[] := array[
    'id', 'env', 'created_at', 'created_by', 'revision', 'updated_at',
    'login_account', 'login_password', 'login_url', 'other_login_info',
    'tools', 'question_tools', 'tool_field_values'
  ];
  v_allowed text[] := array[
    'billing_unit', 'body_content', 'case_reference_materials', 'cat_tool_enabled',
    'category', 'change_log_enabled_at', 'client', 'client_case_link', 'client_guidelines',
    'client_po_number', 'client_question_form', 'client_receipt', 'client_receipt_files',
    'collab_count', 'collab_rows', 'comments', 'common_info', 'common_links', 'contact',
    'custom_guidelines_url', 'decline_records', 'delivery_method', 'delivery_method_files',
    'dispatch_route', 'edit_logs', 'execution_tool', 'fee_entry', 'icon_url', 'inquiry_note',
    'inquiry_slack_records', 'internal_comments', 'internal_note_form', 'internal_records',
    'internal_review_final', 'keyword', 'multi_collab', 'online_tool_filename',
    'online_tool_project', 'process_note', 'question_form', 'reference_materials',
    'review_deadline', 'review_rows', 'reviewer', 'series_reference_materials',
    'source_files', 'status', 'task_status', 'title', 'track_changes',
    'translation_deadline', 'translator', 'translator_final', 'translator_user_id',
    'reviewer_user_id', 'unit_count', 'work_groups', 'work_type', 'working_files'
  ];
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return 'invalid_payload';
  end if;

  select k into v_key
  from jsonb_object_keys(p_payload) k
  where k = any(v_forbidden)
  limit 1;
  if v_key is not null then
    return 'forbidden_payload_key';
  end if;

  select k into v_key
  from jsonb_object_keys(p_payload) k
  where not (k = any(v_allowed))
  limit 1;
  if v_key is not null then
    return 'unknown_payload_key';
  end if;

  if p_payload ? 'translator_user_id'
    and not private.p0_is_valid_uuid(p_payload->>'translator_user_id')
  then
    return 'invalid_translator_user_id';
  end if;

  if p_payload ? 'reviewer_user_id'
    and not private.p0_is_valid_uuid(p_payload->>'reviewer_user_id')
  then
    return 'invalid_reviewer_user_id';
  end if;

  return null;
end;
$$;

create or replace function public.admin_create_case(
  p_case_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_env text := public.current_env();
  v_clean jsonb;
  v_err text;
  v_multi_collab boolean;
  v_translator jsonb;
  v_collab_rows jsonb;
  v_review_rows jsonb;
  v_translator_user_id uuid;
  v_reviewer text;
  v_reviewer_user_id uuid;
  v_new_map jsonb;
begin
  if v_uid is null or not public.is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;
  if p_case_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_case_id');
  end if;

  v_clean := coalesce(p_payload, '{}'::jsonb);
  v_err := private.p0_admin_create_validate_payload(v_clean);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  v_multi_collab := coalesce((v_clean->>'multi_collab')::boolean, false);
  v_collab_rows := private.p0_normalize_collab_rows(coalesce(v_clean->'collab_rows', '[]'::jsonb));
  v_review_rows := private.p0_normalize_review_rows(coalesce(v_clean->'review_rows', '[]'::jsonb));
  v_translator := coalesce(v_clean->'translator', '[]'::jsonb);
  v_reviewer := coalesce(nullif(trim(v_clean->>'reviewer'), ''), '');

  if v_multi_collab then
    v_translator := '[]'::jsonb;
    v_translator_user_id := null;
  elsif v_clean ? 'translator_user_id'
    and private.p0_is_valid_uuid(v_clean->>'translator_user_id')
  then
    v_translator_user_id := (v_clean->>'translator_user_id')::uuid;
    v_translator := jsonb_build_array(private.p0_assignment_profile_name(v_translator_user_id));
  elsif jsonb_typeof(v_translator) = 'array' and jsonb_array_length(v_translator) > 0 then
    return jsonb_build_object('ok', false, 'error', 'missing_translator_user_id');
  else
    v_translator := '[]'::jsonb;
    v_translator_user_id := null;
  end if;

  if jsonb_array_length(v_review_rows) > 0 then
    v_reviewer := '';
    v_reviewer_user_id := null;
  elsif v_clean ? 'reviewer_user_id'
    and private.p0_is_valid_uuid(v_clean->>'reviewer_user_id')
  then
    v_reviewer_user_id := (v_clean->>'reviewer_user_id')::uuid;
    v_reviewer := private.p0_assignment_profile_name(v_reviewer_user_id);
  elsif nullif(trim(v_reviewer), '') is not null then
    return jsonb_build_object('ok', false, 'error', 'missing_reviewer_user_id');
  else
    v_reviewer_user_id := null;
    v_reviewer := '';
  end if;

  insert into public.cases (
    id, env, created_by, title, status, client, contact, keyword, client_po_number,
    client_case_link, dispatch_route, category, work_type, work_groups, process_note,
    billing_unit, unit_count, inquiry_note, translator, translation_deadline, reviewer,
    review_deadline, execution_tool, cat_tool_enabled, delivery_method, delivery_method_files,
    client_receipt, client_receipt_files, custom_guidelines_url, client_guidelines,
    common_info, common_links, internal_note_form, client_question_form, working_files,
    online_tool_project, online_tool_filename, source_files, series_reference_materials,
    case_reference_materials, reference_materials, question_form, translator_final,
    internal_review_final, track_changes, fee_entry, internal_records, comments,
    internal_comments, body_content, multi_collab, collab_count, collab_rows, review_rows,
    decline_records, icon_url, inquiry_slack_records, edit_logs, change_log_enabled_at,
    task_status
  )
  values (
    p_case_id, v_env, v_uid,
    coalesce(nullif(trim(v_clean->>'title'), ''), ''),
    coalesce(nullif(trim(v_clean->>'status'), ''), 'draft'),
    coalesce(nullif(trim(v_clean->>'client'), ''), ''),
    coalesce(nullif(trim(v_clean->>'contact'), ''), ''),
    coalesce(nullif(trim(v_clean->>'keyword'), ''), ''),
    coalesce(nullif(trim(v_clean->>'client_po_number'), ''), ''),
    case when v_clean ? 'client_case_link' then v_clean->'client_case_link' else null end,
    coalesce(nullif(trim(v_clean->>'dispatch_route'), ''), ''),
    coalesce(nullif(trim(v_clean->>'category'), ''), ''),
    coalesce(v_clean->'work_type', '[]'::jsonb),
    coalesce(v_clean->'work_groups', '[]'::jsonb),
    coalesce(nullif(trim(v_clean->>'process_note'), ''), ''),
    coalesce(nullif(trim(v_clean->>'billing_unit'), ''), ''),
    coalesce((v_clean->>'unit_count')::numeric, 0),
    coalesce(nullif(trim(v_clean->>'inquiry_note'), ''), ''),
    v_translator,
    case
      when v_clean ? 'translation_deadline'
        and jsonb_typeof(v_clean->'translation_deadline') = 'string'
      then (v_clean->>'translation_deadline')::timestamptz
      else null
    end,
    v_reviewer,
    case
      when v_clean ? 'review_deadline'
        and jsonb_typeof(v_clean->'review_deadline') = 'string'
      then (v_clean->>'review_deadline')::timestamptz
      else null
    end,
    coalesce(nullif(trim(v_clean->>'execution_tool'), ''), ''),
    coalesce((v_clean->>'cat_tool_enabled')::boolean, false),
    coalesce(nullif(trim(v_clean->>'delivery_method'), ''), ''),
    case when v_clean ? 'delivery_method_files' then v_clean->'delivery_method_files' else null end,
    coalesce(nullif(trim(v_clean->>'client_receipt'), ''), ''),
    case when v_clean ? 'client_receipt_files' then v_clean->'client_receipt_files' else null end,
    coalesce(v_clean->'custom_guidelines_url', '""'::jsonb),
    coalesce(v_clean->'client_guidelines', '[]'::jsonb),
    coalesce(v_clean->'common_info', '[]'::jsonb),
    case when v_clean ? 'common_links' then v_clean->'common_links' else null end,
    coalesce((v_clean->>'internal_note_form')::boolean, false),
    coalesce((v_clean->>'client_question_form')::boolean, false),
    coalesce(v_clean->'working_files', '[]'::jsonb),
    coalesce(nullif(trim(v_clean->>'online_tool_project'), ''), ''),
    coalesce(nullif(trim(v_clean->>'online_tool_filename'), ''), ''),
    coalesce(v_clean->'source_files', '[]'::jsonb),
    case when v_clean ? 'series_reference_materials' then v_clean->'series_reference_materials' else null end,
    case when v_clean ? 'case_reference_materials' then v_clean->'case_reference_materials' else null end,
    coalesce(v_clean->'reference_materials', '[]'::jsonb),
    coalesce(nullif(trim(v_clean->>'question_form'), ''), ''),
    coalesce(v_clean->'translator_final', '[]'::jsonb),
    coalesce(v_clean->'internal_review_final', '[]'::jsonb),
    coalesce(v_clean->'track_changes', '[]'::jsonb),
    coalesce(nullif(trim(v_clean->>'fee_entry'), ''), ''),
    coalesce(v_clean->'internal_records', '[]'::jsonb),
    case when v_clean ? 'comments' then v_clean->'comments' else null end,
    case when v_clean ? 'internal_comments' then v_clean->'internal_comments' else null end,
    case when v_clean ? 'body_content' then v_clean->'body_content' else null end,
    v_multi_collab,
    coalesce((v_clean->>'collab_count')::numeric, 0),
    v_collab_rows,
    v_review_rows,
    coalesce(v_clean->'decline_records', '[]'::jsonb),
    case when v_clean ? 'icon_url' then nullif(trim(v_clean->>'icon_url'), '') else null end,
    coalesce(v_clean->'inquiry_slack_records', '[]'::jsonb),
    coalesce(v_clean->'edit_logs', '[]'::jsonb),
    case
      when v_clean ? 'change_log_enabled_at'
        and jsonb_typeof(v_clean->'change_log_enabled_at') = 'string'
      then (v_clean->>'change_log_enabled_at')::timestamptz
      else null
    end,
    coalesce(nullif(trim(v_clean->>'task_status'), ''), '')
  );

  v_new_map := private.p0_desired_participants_map(
    v_multi_collab, v_translator, v_translator_user_id, v_collab_rows, v_review_rows,
    v_reviewer, v_reviewer_user_id
  );
  perform private.p0_sync_case_participants_from_desired(
    p_case_id, v_uid, '{}'::jsonb, v_new_map
  );

  perform private.record_case_mutation(
    p_case_id, v_env, v_uid, 'admin_create_case',
    array['create'], 0, 0
  );

  return jsonb_build_object(
    'ok', true,
    'id', p_case_id,
    'revision', 0
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'case_already_exists');
  when sqlstate '22023' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  when others then
    raise log 'admin_create_case internal error case_id=% env=% sqlstate=%',
      p_case_id, v_env, sqlstate;
    return jsonb_build_object('ok', false, 'error', 'internal_error');
end;
$$;

comment on function public.admin_create_case(uuid, jsonb) is
  'P0-D：PM 建案；含初始指派時原子建立 case_participants；meta translator_user_id 不寫入 cases。';
