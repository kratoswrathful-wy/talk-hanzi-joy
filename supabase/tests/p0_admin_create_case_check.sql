-- STATUS: draft; NOT run against production; unverified
--
-- P0-C：admin_create_case 固定 allowlist 明列 INSERT — round-trip 與負向。
-- 對齊：20260901120000_p0c_security_convergence.sql（admin_create_case + validate helper）
--
-- 覆蓋：
--   - 一般建案 round-trip（CasesPage 新案件）
--   - 範本建案 round-trip（CasesPage／CaseDetailPage templateValues）
--   - 刪除復原 round-trip（deletedSnapshot 等價 payload）
--   - AI agent 建案 round-trip（validateCasePatch 後典型 snake_case payload）
--   - unknown key 全筆拒絕
--   - forbidden／敏感 key 拒絕
--   - 非 admin／跨 env 拒絕
--   - 非法 status／型別拒絕
--   - audit 存在且不含欄位值
--
-- 執行：隔離 branch／本機 DB；全程 BEGIN…ROLLBACK。

begin;

do $$
declare
  v_pm uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_other_env_pm uuid := gen_random_uuid();
  v_case_general uuid := gen_random_uuid();
  v_case_template uuid := gen_random_uuid();
  v_case_restore uuid := gen_random_uuid();
  v_case_ai uuid := gen_random_uuid();
  v_case_neg uuid := gen_random_uuid();
  v_result jsonb;
  v_row public.cases%rowtype;
  v_visible record;
  v_audit_count int;
  v_audit_cols text[];
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values
    (v_pm, 'p0-create-pm@test.local', '{"display_name":"P0 Create PM"}'),
    (v_member, 'p0-create-m@test.local', '{"display_name":"P0 Member"}'),
    (v_other_env_pm, 'p0-create-prod@test.local', '{"display_name":"P0 Prod PM"}');

  update public.profiles set is_test = true
  where id in (v_pm, v_member, v_other_env_pm);
  update public.profiles set is_test = false where id = v_other_env_pm;

  delete from public.user_roles where user_id in (v_pm, v_member, v_other_env_pm);
  insert into public.user_roles(user_id, role)
  values
    (v_pm, 'pm'),
    (v_member, 'member'),
    (v_other_env_pm, 'pm');

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  -- T1 一般建案 round-trip
  v_result := public.admin_create_case(
    v_case_general,
    jsonb_build_object(
      'title', '[P0-C] general create',
      'status', 'draft',
      'client', 'Acme',
      'contact', 'contact@test.local',
      'keyword', 'kw-general',
      'process_note', 'note'
    )
  );
  if coalesce(v_result->>'ok', '') <> 'true' then
    raise exception 'T1 general create failed: %', v_result;
  end if;
  select * into v_row from public.cases where id = v_case_general;
  if v_row.title <> '[P0-C] general create'
     or v_row.client <> 'Acme'
     or v_row.contact <> 'contact@test.local'
     or v_row.process_note <> 'note' then
    raise exception 'T1 round-trip field mismatch';
  end if;

  -- T2 範本建案 round-trip
  v_result := public.admin_create_case(
    v_case_template,
    jsonb_build_object(
      'title', '[P0-C] template create',
      'status', 'inquiry',
      'client', 'TemplateCo',
      'category', 'game',
      'work_type', jsonb_build_array('translation'),
      'work_groups', jsonb_build_array(
        jsonb_build_object(
          'workType', 'translation',
          'billingUnit', '字',
          'unitCount', 1200
        )
      ),
      'billing_unit', '字',
      'unit_count', 1200,
      'multi_collab', true,
      'collab_count', 2,
      'collab_rows', jsonb_build_array(
        jsonb_build_object('id', 'row-1', 'segment', '1-100', 'unitCount', 500)
      ),
      'common_info', jsonb_build_array(
        jsonb_build_object('label', '備註', 'value', 'from template')
      ),
      'translation_deadline', '2026-12-31T18:00:00+08:00'
    )
  );
  if coalesce(v_result->>'ok', '') <> 'true' then
    raise exception 'T2 template create failed: %', v_result;
  end if;
  select * into v_row from public.cases where id = v_case_template;
  if v_row.status <> 'inquiry'
     or v_row.category <> 'game'
     or v_row.unit_count <> 1200
     or v_row.multi_collab is not true
     or jsonb_array_length(v_row.collab_rows) <> 1
     or v_row.translation_deadline is null then
    raise exception 'T2 template round-trip mismatch';
  end if;

  -- T3 刪除復原 round-trip（deletedSnapshot 等價）
  v_result := public.admin_create_case(
    v_case_restore,
    jsonb_build_object(
      'title', '[P0-C] restored case',
      'status', 'dispatched',
      'client', 'RestoreClient',
      'reviewer', '審稿者 A',
      'review_rows', jsonb_build_array(
        jsonb_build_object('reviewer', '審稿者 A', 'segment', 'all')
      ),
      'translator', jsonb_build_array('譯者 B'),
      'decline_records', '[]'::jsonb,
      'edit_logs', jsonb_build_array(
        jsonb_build_object('fieldKey', 'title', 'at', now())
      ),
      'task_status', '進行中'
    )
  );
  if coalesce(v_result->>'ok', '') <> 'true' then
    raise exception 'T3 restore create failed: %', v_result;
  end if;
  select * into v_row from public.cases where id = v_case_restore;
  if v_row.status <> 'dispatched'
     or v_row.reviewer <> '審稿者 A'
     or jsonb_array_length(v_row.translator) <> 1 then
    raise exception 'T3 restore round-trip mismatch';
  end if;

  -- T4 AI agent 建案 round-trip
  v_result := public.admin_create_case(
    v_case_ai,
    jsonb_build_object(
      'title', '[AI驗收] agent create',
      'status', 'draft',
      'client', 'AI Client',
      'inquiry_note', 'from agent',
      'body_content', jsonb_build_object('blocks', jsonb_build_array())
    )
  );
  if coalesce(v_result->>'ok', '') <> 'true' then
    raise exception 'T4 AI create failed: %', v_result;
  end if;
  select inquiry_note, body_content
    into v_row.inquiry_note, v_row.body_content
  from public.cases
  where id = v_case_ai;
  if v_row.inquiry_note <> 'from agent' or v_row.body_content is null then
    raise exception 'T4 AI round-trip mismatch';
  end if;

  -- T5 unknown key 全筆拒絕
  v_result := public.admin_create_case(
    v_case_neg,
    jsonb_build_object('title', 'x', 'future_unknown_field', 'secret')
  );
  if coalesce(v_result->>'error', '') <> 'unknown_create_key' then
    raise exception 'T5 expected unknown_create_key got: %', v_result;
  end if;

  -- T6 forbidden／敏感 key 拒絕
  v_result := public.admin_create_case(
    gen_random_uuid(),
    jsonb_build_object('title', 'x', 'login_password', 'pw')
  );
  if coalesce(v_result->>'error', '') <> 'forbidden_create_key' then
    raise exception 'T6a expected forbidden_create_key got: %', v_result;
  end if;
  v_result := public.admin_create_case(
    gen_random_uuid(),
    jsonb_build_object('title', 'x', 'tools', '[]'::jsonb)
  );
  if coalesce(v_result->>'error', '') <> 'forbidden_create_key' then
    raise exception 'T6b expected forbidden_create_key got: %', v_result;
  end if;

  -- T7 非法 status
  v_result := public.admin_create_case(
    gen_random_uuid(),
    jsonb_build_object('title', 'x', 'status', 'not_a_real_status')
  );
  if coalesce(v_result->>'error', '') <> 'invalid_status' then
    raise exception 'T7 expected invalid_status got: %', v_result;
  end if;

  -- T8 非法型別
  v_result := public.admin_create_case(
    gen_random_uuid(),
    jsonb_build_object('title', 'x', 'multi_collab', 'yes')
  );
  if coalesce(v_result->>'error', '') <> 'invalid_field_type' then
    raise exception 'T8 expected invalid_field_type got: %', v_result;
  end if;

  -- T9 非 admin 拒絕
  reset role;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_member::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_result := public.admin_create_case(
    gen_random_uuid(),
    jsonb_build_object('title', 'x', 'status', 'draft')
  );
  if coalesce(v_result->>'error', '') <> 'not_authorized' then
    raise exception 'T9 expected not_authorized got: %', v_result;
  end if;

  -- T10 audit 存在且不含欄位值
  reset role;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  select count(*) into v_audit_count
  from public.case_mutation_audit
  where case_id = v_case_general and action = 'admin_create_case';
  if v_audit_count < 1 then
    raise exception 'T10 missing admin_create_case audit';
  end if;
  select array_agg(column_name::text order by ordinal_position)
    into v_audit_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'case_mutation_audit';
  if v_audit_cols && array['title', 'payload', 'patch', 'old_value', 'new_value'] then
    raise exception 'T10 audit table must not store field values';
  end if;

  -- T11 跨 env：production PM 在 test env 不可見／不可建到其他 env（current_env=test 使用者）
  reset role;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other_env_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_result := public.admin_create_case(
    gen_random_uuid(),
    jsonb_build_object('title', 'cross env', 'status', 'draft')
  );
  if coalesce(v_result->>'ok', '') <> 'true' then
    raise exception 'T11 create failed unexpectedly: %', v_result;
  end if;
  select count(*) into v_audit_count
  from public.cases c
  where c.created_by = v_other_env_pm and c.env = 'production';
  if v_audit_count <> 1 then
    raise exception 'T11 case must land in production env for prod PM';
  end if;
  reset role;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  if exists (
    select 1 from public.cases_visible cv
    where cv.created_by = v_other_env_pm
  ) then
    raise exception 'T11 cross-env case visible to test PM';
  end if;

  raise notice 'p0_admin_create_case_check: all assertions passed';
end $$;

rollback;
