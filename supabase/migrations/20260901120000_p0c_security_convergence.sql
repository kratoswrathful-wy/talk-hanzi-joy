-- P0-C：譯者承接資格收斂（對齊 UI）、admin 建刪案 RPC、apply_case_update 稽核、
-- privileged CAT helper 撤銷 PUBLIC/anon、基表 SELECT 威脅模型註解。idempotent。
--
-- UI 對照（CasesListSingleCaseFlowButtons／select-options-store／useAuth）：
--   - primaryRole === "member" ⇔ user_roles 含 member；PM／執行長走 admin 路徑
--   - 承接需 display_name（resolveActorDisplayName）
--   - member_translator_settings.frozen 排除
--   - profiles.is_test ↔ current_env()
--   - 單案詢價：translator 陣列已有他人名稱且不含本人 → 拒絕
--   - 協作列 translatorUserId 空白：任一合格 member 可承接

-- ── 1) 譯者承接資格（與 UI 一致）────────────────────────────────────────────
create or replace function private.p0_assert_translator_eligible(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_name text;
begin
  if p_user_id is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if public.is_admin(p_user_id) then
    raise exception using errcode = '42501', message = 'admin_use_management_path';
  end if;

  if not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = p_user_id
      and ur.role = 'member'
  ) then
    raise exception using errcode = '42501', message = 'not_translator_eligible';
  end if;

  perform private.p0b_require_profile(p_user_id);

  v_name := private.case_actor_display_name(p_user_id);
  if v_name is null then
    raise exception using errcode = '42501', message = 'profile_display_name_required';
  end if;

  if exists (
    select 1
    from public.profiles pr
    join public.member_translator_settings mts
      on lower(mts.email) = lower(pr.email)
    where pr.id = p_user_id
      and coalesce(mts.frozen, false) is true
  ) then
    raise exception using errcode = '42501', message = 'translator_frozen';
  end if;
end;
$$;

revoke all on function private.p0_assert_translator_eligible(uuid)
  from public, anon, authenticated;

comment on function private.p0_assert_translator_eligible(uuid) is
  'P0-C：公開承接／婉拒／協作承接前驗證；對齊 UI member＋display_name＋非凍結＋同 env。';

-- ── 2) 動作 RPC：套用資格＋單案他人譯者規則 ─────────────────────────────────
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
  perform private.p0_assert_translator_eligible(v_actor);

  select * into v_case from public.cases c
  where c.id=p_case_id and c.env=v_env for update;
  if not found or v_case.status <> 'inquiry' or v_case.multi_collab then
    raise exception using errcode='P0002', message='case_unavailable';
  end if;
  if v_case.revision <> p_expected_revision then
    raise exception using errcode='40001', message='case_revision_conflict';
  end if;

  v_name := private.case_actor_display_name(v_actor);

  -- 單案：translator 已有他人且不含本人 → 拒（對齊 CasesListSingleCaseFlowButtons）
  if jsonb_typeof(v_case.translator) = 'array'
     and jsonb_array_length(v_case.translator) > 0
     and not (v_case.translator @> jsonb_build_array(v_name))
  then
    raise exception using errcode='42501', message='other_translator_pending';
  end if;

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
  perform private.p0_assert_translator_eligible(v_actor);

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
  perform private.p0_assert_translator_eligible(v_actor);

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
  -- 空白 translatorUserId：任一合格 member 可承接（產品決策）
  if nullif(v_row->>'translatorUserId','') is not null
    and v_row->>'translatorUserId' <> v_actor::text then
    raise exception using errcode='42501', message='collab_row_not_assigned_to_actor';
  end if;
  if v_case.revision <> p_expected_revision then
    raise exception using errcode='40001', message='case_revision_conflict';
  end if;
  v_name := private.case_actor_display_name(v_actor);
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

-- ── 3) apply_case_update：成功寫入稽核；allowlist 註解 ───────────────────────
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

  -- 禁止經 patch 竄改身份／環境／版號／時間戳／憑證／工具／指派安全鍵
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
    'collab_count',
    'collab_rows',
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
    'multi_collab',
    'online_tool_filename',
    'online_tool_project',
    'process_note',
    'question_form',
    'reference_materials',
    'review_deadline',
    'review_rows',
    'reviewer',
    'series_reference_materials',
    'source_files',
    'status',
    'task_status',
    'title',
    'track_changes',
    'translation_deadline',
    'translator',
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
    collab_count = v_patch.collab_count,
    collab_rows = v_patch.collab_rows,
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
    multi_collab = v_patch.multi_collab,
    online_tool_filename = v_patch.online_tool_filename,
    online_tool_project = v_patch.online_tool_project,
    process_note = v_patch.process_note,
    question_form = v_patch.question_form,
    reference_materials = v_patch.reference_materials,
    review_deadline = v_patch.review_deadline,
    review_rows = v_patch.review_rows,
    reviewer = v_patch.reviewer,
    series_reference_materials = v_patch.series_reference_materials,
    source_files = v_patch.source_files,
    status = v_patch.status,
    task_status = v_patch.task_status,
    title = v_patch.title,
    track_changes = v_patch.track_changes,
    translation_deadline = v_patch.translation_deadline,
    translator = v_patch.translator,
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
  'P0-C：admin-only；allowlist 不含 revision／憑證／tools 敏感鍵（已剝除）；成功寫入 case_mutation_audit。';

-- ── 4) admin 建刪案 RPC＋收回 authenticated INSERT/DELETE ───────────────────
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
  v_row public.cases%rowtype;
begin
  if v_uid is null or not public.is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;
  if p_case_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_case_id');
  end if;
  if p_payload is null or p_payload = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'empty_payload');
  end if;

  v_clean := coalesce(p_payload, '{}'::jsonb)
    - 'id' - 'env' - 'created_at' - 'created_by' - 'revision' - 'updated_at'
    - 'login_account' - 'login_password' - 'login_url' - 'other_login_info'
    - 'tools' - 'question_tools' - 'tool_field_values';

  v_row := jsonb_populate_record(
    null::public.cases,
    v_clean || jsonb_build_object(
      'id', p_case_id,
      'env', v_env,
      'created_by', v_uid
    )
  );

  insert into public.cases
  select (v_row).*;

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
  when others then
    return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

create or replace function public.admin_delete_case(
  p_case_id uuid,
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
  v_revision bigint;
begin
  if v_uid is null or not public.is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;
  if p_case_id is null or p_expected_revision is null or p_expected_revision < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_revision');
  end if;

  select c.revision into v_revision
  from public.cases c
  where c.id = p_case_id
    and c.env = v_env
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;
  if v_revision is distinct from p_expected_revision then
    return jsonb_build_object('ok', false, 'error', 'stale_revision');
  end if;

  perform private.record_case_mutation(
    p_case_id, v_env, v_uid, 'admin_delete_case',
    array['delete'], p_expected_revision, p_expected_revision
  );

  delete from public.cases c
  where c.id = p_case_id
    and c.env = v_env
    and c.revision = p_expected_revision;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'stale_revision');
  end if;

  return jsonb_build_object('ok', true, 'id', p_case_id);
end;
$$;

revoke all on function public.admin_create_case(uuid, jsonb) from public, anon;
revoke all on function public.admin_delete_case(uuid, bigint) from public, anon;
grant execute on function public.admin_create_case(uuid, jsonb)
  to authenticated, service_role;
grant execute on function public.admin_delete_case(uuid, bigint)
  to authenticated, service_role;

revoke insert, delete on public.cases from authenticated;

comment on function public.admin_create_case(uuid, jsonb) is
  'P0-C：僅 PM／執行長同 env 建案；憑證鍵剝除；寫入 case_mutation_audit。';
comment on function public.admin_delete_case(uuid, bigint) is
  'P0-C：僅 PM／執行長同 env 刪案（需 expected revision）；寫入 case_mutation_audit。';

-- ── 5) REVOKE PUBLIC/anon（及內層 helper 之 authenticated）────────────────────
revoke all on function public.sync_cat_workflow_assignments_for_case(uuid)
  from public, anon;
revoke all on function public.sync_cat_file_assignments_for_case(uuid)
  from public, anon;
revoke all on function public.cat_upsert_translate_stage_assignment(
  uuid, uuid, text, uuid, text, integer, integer, text, boolean
) from public, anon;
revoke all on function public.cat_upsert_review_stage_assignment(
  uuid, uuid, text, uuid, text, integer, integer, text, boolean
) from public, anon;
revoke all on function public.cat_revert_workflow_stages_for_case(uuid)
  from public, anon;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'ensure_cat_project_default_workflow_template',
        'ensure_cat_file_workflow_stages',
        'cat_upsert_translate_stage_assignment',
        'cat_upsert_review_stage_assignment'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

grant execute on function public.sync_cat_workflow_assignments_for_case(uuid)
  to service_role;
grant execute on function public.sync_cat_file_assignments_for_case(uuid)
  to service_role;
grant execute on function public.cat_upsert_translate_stage_assignment(
  uuid, uuid, text, uuid, text, integer, integer, text, boolean
) to service_role;
grant execute on function public.cat_upsert_review_stage_assignment(
  uuid, uuid, text, uuid, text, integer, integer, text, boolean
) to service_role;
grant execute on function public.cat_revert_workflow_stages_for_case(uuid)
  to service_role;

-- ── 6) cat_mark_stage_assignment_first_edited：search_path 修正 ─────────────
create or replace function public.cat_mark_stage_assignment_first_edited(
  p_assignment_id uuid
)
returns public.cat_stage_assignments
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.cat_stage_assignments;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  update public.cat_stage_assignments as a
  set
    first_edited_at = now(),
    updated_at = now()
  where a.id = p_assignment_id
    and a.assignee_user_id = v_uid
    and a.first_edited_at is null
  returning a.* into v_row;

  if v_row.id is not null then
    return v_row;
  end if;

  select * into v_row
  from public.cat_stage_assignments
  where id = p_assignment_id;

  if v_row.id is null then
    raise exception using errcode = 'P0002', message = 'assignment_not_found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.cat_mark_stage_assignment_first_edited(uuid)
  from public, anon;
grant execute on function public.cat_mark_stage_assignment_first_edited(uuid)
  to authenticated, service_role;

-- ── 7) UPDATE policies：補 WITH CHECK ───────────────────────────────────────
drop policy if exists cases_update on public.cases;
create policy cases_update on public.cases
  for update
  to authenticated
  using (
    public.is_admin((select auth.uid()))
    and env = public.current_env()
  )
  with check (
    public.is_admin((select auth.uid()))
    and env = public.current_env()
  );

drop policy if exists fees_update on public.fees;
create policy fees_update on public.fees
  for update
  using ( is_admin((select auth.uid())) and env = current_env() )
  with check ( is_admin((select auth.uid())) and env = current_env() );

-- ── 8) 基表 SELECT 威脅模型（view 為唯一讀取面）────────────────────────────
revoke select on public.cases from anon, authenticated;
revoke select on public.fees from anon, authenticated;

comment on view public.cases_visible is $p0c_cases_visible$
P0-C 威脅模型：非 admin 唯一讀取面；基表 cases SELECT 已 revoke（anon/authenticated）。
  - 列級：security definer + env/participant 遮罩（見 P0-A/W10）。
  - 欄位：憑證空值、tool JSON allowlist；禁止 PostgREST 直讀基表繞過。
  - 負向測試：w10_cases_base_select_deny_check、p0c 建刪案後 authenticated INSERT/DELETE deny。
$p0c_cases_visible$;

comment on view public.fees_visible is $p0c_fees_visible$
P0-C 威脅模型：譯者唯一讀取面；基表 fees SELECT 已 revoke（anon/authenticated）。
  - 列級：本人草稿／admin／相關案件白名單（W10）。
  - 欄位：非 admin 遮罩 client_info／edit_logs／rateConfirmed。
  - 負向測試：w10_fees_base_select_deny_check。
$p0c_fees_visible$;
