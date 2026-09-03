-- STATUS: draft; NOT run against production; unverified
--
-- P0-C: admin_create_case fixed allowlist INSERT — round-trip and negatives.
-- Aligns with: 20260901120000_p0c_security_convergence.sql (+ P0-D participant sync)
--
-- Coverage:
--   - general create round-trip
--   - template create round-trip
--   - restore create round-trip with trusted UUIDs + server name normalize (T3)
--   - name-only assignment negatives (T3b)
--   - AI agent create round-trip
--   - unknown / forbidden / sensitive key reject
--   - non-admin / cross-env reject
--   - invalid status / type reject
--   - audit exists and stores no field values
--
-- Run: isolated branch / local DB; wrap in BEGIN…ROLLBACK.

begin;

do $$
declare
  v_pm uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_other_env_pm uuid := gen_random_uuid();
  v_translator uuid := gen_random_uuid();
  v_reviewer uuid := gen_random_uuid();
  v_case_general uuid := gen_random_uuid();
  v_case_template uuid := gen_random_uuid();
  v_case_restore uuid := gen_random_uuid();
  v_case_ai uuid := gen_random_uuid();
  v_case_neg uuid := gen_random_uuid();
  v_result jsonb;
  v_visible record;
  v_audit_count int;
  v_audit_cols text[];
  v_review_name text;
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values
    (v_pm, 'p0-create-pm@test.local', '{"display_name":"P0 Create PM"}'),
    (v_member, 'p0-create-m@test.local', '{"display_name":"P0 Member"}'),
    (v_other_env_pm, 'p0-create-prod@test.local', '{"display_name":"P0 Prod PM"}'),
    (v_translator, 'p0-create-tr@test.local', '{"display_name":"Translator B"}'),
    (v_reviewer, 'p0-create-rv@test.local', '{"display_name":"Reviewer A"}');

  update public.profiles set is_test = true
  where id in (v_pm, v_member, v_other_env_pm, v_translator, v_reviewer);
  update public.profiles set is_test = false where id = v_other_env_pm;
  update public.profiles set display_name = '譯者 B' where id = v_translator;
  update public.profiles set display_name = '審稿者 A' where id = v_reviewer;

  delete from public.user_roles
  where user_id in (v_pm, v_member, v_other_env_pm, v_translator, v_reviewer);
  insert into public.user_roles(user_id, role)
  values
    (v_pm, 'pm'),
    (v_member, 'member'),
    (v_other_env_pm, 'pm'),
    (v_translator, 'member'),
    (v_reviewer, 'member');

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  -- T1 general create round-trip
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
  select title, client, contact, process_note
    into v_visible
  from public.cases_visible
  where id = v_case_general;
  if v_visible.title <> '[P0-C] general create'
     or v_visible.client <> 'Acme'
     or v_visible.contact <> 'contact@test.local'
     or v_visible.process_note <> 'note' then
    raise exception 'T1 round-trip field mismatch';
  end if;

  -- T2 template create round-trip
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
  select status, category, unit_count, multi_collab, collab_rows, translation_deadline
    into v_visible
  from public.cases_visible
  where id = v_case_template;
  if v_visible.status <> 'inquiry'
     or v_visible.category <> 'game'
     or v_visible.unit_count <> 1200
     or v_visible.multi_collab is not true
     or jsonb_array_length(v_visible.collab_rows) <> 1
     or v_visible.translation_deadline is null then
    raise exception 'T2 template round-trip mismatch';
  end if;

  -- T3 restore create with trusted UUIDs (wrong front-end labels; server normalizes)
  v_result := public.admin_create_case(
    v_case_restore,
    jsonb_build_object(
      'title', '[P0-C] restored case',
      'status', 'dispatched',
      'client', 'RestoreClient',
      'reviewer', 'Wrong Reviewer Label',
      'review_rows', jsonb_build_array(
        jsonb_build_object(
          'reviewer', 'Wrong Reviewer Label',
          'segment', 'all',
          'reviewerUserId', v_reviewer
        )
      ),
      'translator', jsonb_build_array('Wrong Translator Label'),
      'translator_user_id', v_translator::text,
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

  -- Inspect as manager: authenticated may lack base-table SELECT
  reset role;

  select status, reviewer, translator, review_rows
    into v_visible
  from public.cases_visible
  where id = v_case_restore;
  if v_visible.status <> 'dispatched' then
    raise exception 'T3 restore status mismatch';
  end if;
  if jsonb_array_length(v_visible.translator) <> 1
     or (v_visible.translator->>0) <> '譯者 B' then
    raise exception 'T3 translator should be server-normalized to 譯者 B, got %', v_visible.translator;
  end if;
  -- P0-D: when review_rows present, cases.reviewer is cleared
  if coalesce(nullif(trim(v_visible.reviewer), ''), '') <> '' then
    raise exception 'T3 cases.reviewer should be empty when review_rows present, got %', v_visible.reviewer;
  end if;
  if jsonb_typeof(v_visible.review_rows) <> 'array'
     or jsonb_array_length(v_visible.review_rows) < 1 then
    raise exception 'T3 review_rows missing after restore create';
  end if;
  v_review_name := v_visible.review_rows->0->>'reviewer';
  if v_review_name <> '審稿者 A' then
    raise exception 'T3 review_rows reviewer should normalize to 審稿者 A, got %', v_review_name;
  end if;

  if not exists (
    select 1 from public.case_participants cp
    where cp.case_id = v_case_restore
      and cp.user_id = v_translator
      and cp.role = 'translator'
      and cp.work_status = 'active'
      and cp.source = 'pm_assign'
      and cp.access_revoked_at is null
  ) then
    raise exception 'T3 missing active pm_assign translator participant';
  end if;
  if not exists (
    select 1 from public.case_participants cp
    where cp.case_id = v_case_restore
      and cp.user_id = v_reviewer
      and cp.role = 'reviewer'
      and cp.work_status = 'active'
      and cp.source = 'pm_assign'
      and cp.access_revoked_at is null
  ) then
    raise exception 'T3 missing active pm_assign reviewer participant from review_rows';
  end if;

  -- Restore authenticated role for remaining RPC calls
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  -- T3b name-only negatives (no trusted UUID)
  v_result := public.admin_create_case(
    gen_random_uuid(),
    jsonb_build_object(
      'title', '[P0-C] name-only translator',
      'status', 'draft',
      'client', 'c',
      'translator', jsonb_build_array('譯者 B')
    )
  );
  if coalesce(v_result->>'ok', 'false') = 'true' then
    raise exception 'T3b name-only translator should not succeed';
  end if;
  if coalesce(v_result->>'error', '') <> 'missing_translator_user_id' then
    raise exception 'T3b expected missing_translator_user_id, got %', v_result;
  end if;

  v_result := public.admin_create_case(
    gen_random_uuid(),
    jsonb_build_object(
      'title', '[P0-C] name-only reviewer',
      'status', 'draft',
      'client', 'c',
      'reviewer', '審稿者 A'
    )
  );
  if coalesce(v_result->>'ok', 'false') = 'true' then
    raise exception 'T3b name-only reviewer should not succeed';
  end if;
  if coalesce(v_result->>'error', '') <> 'missing_reviewer_user_id' then
    raise exception 'T3b expected missing_reviewer_user_id, got %', v_result;
  end if;

  -- T4 AI agent create round-trip
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
    into v_visible
  from public.cases_visible
  where id = v_case_ai;
  if v_visible.inquiry_note <> 'from agent' or v_visible.body_content is null then
    raise exception 'T4 AI round-trip mismatch';
  end if;

  -- T5 unknown key full reject
  v_result := public.admin_create_case(
    v_case_neg,
    jsonb_build_object('title', 'x', 'future_unknown_field', 'secret')
  );
  if coalesce(v_result->>'error', '') <> 'unknown_create_key' then
    raise exception 'T5 expected unknown_create_key got: %', v_result;
  end if;

  -- T6 forbidden / sensitive key reject
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

  -- T7 invalid status
  v_result := public.admin_create_case(
    gen_random_uuid(),
    jsonb_build_object('title', 'x', 'status', 'not_a_real_status')
  );
  if coalesce(v_result->>'error', '') <> 'invalid_status' then
    raise exception 'T7 expected invalid_status got: %', v_result;
  end if;

  -- T8 invalid type
  v_result := public.admin_create_case(
    gen_random_uuid(),
    jsonb_build_object('title', 'x', 'multi_collab', 'yes')
  );
  if coalesce(v_result->>'error', '') <> 'invalid_field_type' then
    raise exception 'T8 expected invalid_field_type got: %', v_result;
  end if;

  -- T9 non-admin reject
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

  -- T10 audit exists and stores no field values (inspect after reset role)
  reset role;
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

  -- T11 cross-env: production PM lands in production env
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
  from public.cases_visible cv
  where cv.created_by = v_other_env_pm and cv.env = 'production';
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
