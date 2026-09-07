-- STATUS: draft; NOT run against production; unverified
--
-- P0-V：cases_visible／fees_visible 受控 definer view 例外 — 完整契約。
-- SQL 層 + 與 scripts/micro3-definer-view-api-check.mjs（Data API）互補。
--
-- 執行：隔離 branch／本機 DB；全程 BEGIN…ROLLBACK。

begin;

do $$
declare
  v_pm uuid := gen_random_uuid();
  v_t1 uuid := gen_random_uuid();
  v_t2 uuid := gen_random_uuid();
  v_case uuid := gen_random_uuid();
  v_case_prod uuid := gen_random_uuid();
  v_fee_own uuid := gen_random_uuid();
  v_fee_other uuid := gen_random_uuid();
  v_fee_prod uuid := gen_random_uuid();
  v_visible record;
  v_tools jsonb;
  v_count bigint;
  v_scalar text;
  v_join_client text;
  v_fees_expected_cols text[] := array[
    'id','title','assignee','status','internal_note','internal_note_url','task_items',
    'client_info','notes','edit_logs','edit_log_phases','created_by','created_at',
    'updated_at','finalized_by','finalized_at','env'
  ];
  v_cases_expected_cols text[] := array[
    'id','title','status','client','contact','keyword','client_po_number','client_case_link',
    'dispatch_route','category','work_type','work_groups','process_note','billing_unit',
    'unit_count','inquiry_note','translator','translation_deadline','reviewer','review_deadline',
    'execution_tool','tool_field_values','cat_tool_enabled','tools','question_tools',
    'delivery_method','delivery_method_files','client_receipt','client_receipt_files',
    'custom_guidelines_url','client_guidelines','common_info','common_links',
    'internal_note_form','client_question_form','working_files','other_login_info',
    'login_account','login_password','online_tool_project','online_tool_filename',
    'source_files','series_reference_materials','case_reference_materials','reference_materials',
    'question_form','translator_final','internal_review_final','track_changes','fee_entry',
    'internal_records','comments','internal_comments','body_content','multi_collab',
    'collab_count','collab_rows','review_rows','decline_records','icon_url','created_by',
    'created_at','inquiry_slack_records','updated_at','edit_logs','change_log_enabled_at',
    'task_status','env','revision'
  ];
  v_actual_cols text[];
  v_drift text[];
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values
    (v_pm, 'p0v-pm@test.local', '{"display_name":"P0V PM"}'),
    (v_t1, 'p0v-t1@test.local', '{"display_name":"P0V 譯者一"}'),
    (v_t2, 'p0v-t2@test.local', '{"display_name":"P0V 譯者二"}');

  update public.profiles set is_test = true where id in (v_pm, v_t1, v_t2);
  delete from public.user_roles where user_id in (v_pm, v_t1, v_t2);
  insert into public.user_roles(user_id, role)
  values (v_pm, 'pm'), (v_t1, 'member'), (v_t2, 'member');

  insert into public.cases (
    id, title, status, client, contact, keyword, env, created_by,
    login_account, login_password, other_login_info, tool_field_values,
    tools, question_tools, internal_comments, created_at, updated_at
  ) values
    (
      v_case, '[P0-V] mask fixture', 'dispatched', 'secret-client', 'secret-contact',
      'secret-kw', 'test', v_pm,
      'acct', 'pw', 'other',
      '{"root":"secret"}'::jsonb,
      '[{"id":"t1","tool":"Public","fieldValues":{"token":"secret"},"futureSensitiveKey":["x"],"fields":[{"id":"f1","label":"L","type":"text"}]}]'::jsonb,
      '[{"id":"q1","tool":"Q","fieldValues":{"token":"secret"}}]'::jsonb,
      '[{"text":"internal secret"}]'::jsonb,
      now(), now()
    ),
    (
      v_case_prod, '[P0-V] prod only', 'dispatched', 'prod-client', '', '',
      'production', v_pm,
      '', '', '', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
      now(), now()
    );

  insert into public.fees (
    id, title, assignee, status, env, created_by, client_info, edit_logs, created_at, updated_at
  ) values
    (
      v_fee_own, '[P0-V] own fee', 'P0V 譯者一', 'finalized', 'test', v_pm,
      '{"client":"fee-secret-client","rateConfirmed":true,"revenue":999}'::jsonb,
      '[{"fieldKey":"client","newValue":"secret"}]'::jsonb,
      now(), now()
    ),
    (
      v_fee_other, '[P0-V] other fee', 'P0V 譯者二', 'finalized', 'test', v_pm,
      '{"client":"other-secret","rateConfirmed":true}'::jsonb,
      '[]'::jsonb,
      now(), now()
    ),
    (
      v_fee_prod, '[P0-V] prod fee', 'P0V 譯者一', 'finalized', 'production', v_pm,
      '{"client":"prod-secret"}'::jsonb,
      '[]'::jsonb,
      now(), now()
    );

  -- catalog 契約（superuser 執行；authenticated 無 private schema USAGE）
  if has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'authenticated must not have private schema USAGE';
  end if;
  if not has_function_privilege('authenticated', 'private.public_tool_structure(jsonb)', 'EXECUTE') then
    raise exception 'missing EXECUTE on public_tool_structure';
  end if;
  if not has_function_privilege('authenticated', 'private.case_field_permission_allowed(text,text)', 'EXECUTE') then
    raise exception 'missing EXECUTE on case_field_permission_allowed';
  end if;
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in ('public_tool_structure', 'case_field_permission_allowed')
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then
    raise exception 'private helpers must not be anon executable';
  end if;

  select array_agg(column_name::text order by ordinal_position)
    into v_actual_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'cases_visible';
  select array_agg(c) into v_drift
  from unnest(v_actual_cols) c where not (c = any(v_cases_expected_cols));
  if v_drift is not null and array_length(v_drift, 1) > 0 then
    raise exception 'cases_visible allowlist drift: %', v_drift;
  end if;
  select array_agg(c) into v_drift
  from unnest(v_cases_expected_cols) c where not (c = any(v_actual_cols));
  if v_drift is not null and array_length(v_drift, 1) > 0 then
    raise exception 'cases_visible missing expected columns: %', v_drift;
  end if;

  select array_agg(column_name::text order by ordinal_position)
    into v_actual_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'fees_visible';
  select array_agg(c) into v_drift
  from unnest(v_actual_cols) c where not (c = any(v_fees_expected_cols));
  if v_drift is not null and array_length(v_drift, 1) > 0 then
    raise exception 'fees_visible allowlist drift extra: %', v_drift;
  end if;

  if pg_get_userbyid((select relowner from pg_class where oid = 'public.cases_visible'::regclass)) <> 'postgres' then
    raise exception 'cases_visible owner must be postgres';
  end if;
  if pg_get_userbyid((select relowner from pg_class where oid = 'public.fees_visible'::regclass)) <> 'postgres' then
    raise exception 'fees_visible owner must be postgres';
  end if;
  if has_table_privilege('anon', 'public.cases_visible', 'SELECT')
     or has_table_privilege('anon', 'public.fees_visible', 'SELECT') then
    raise exception 'anon must not select definer views';
  end if;

  -- Slack 三表契約見 p0_slack_edge_only_contract_check.sql

  if exists (
    select 1
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    where n.nspname = 'private'
      and (d.defaclacl::text ilike '%=X%/public%' or d.defaclacl::text ilike '%=X%/anon%'
           or d.defaclacl::text ilike '%=X%/authenticated%')
  ) then
    raise exception 'private schema default EXECUTE must not grant client roles';
  end if;

  -- 1) anon 無 view SELECT
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    perform 1 from public.cases_visible limit 1;
    raise exception 'anon must not select cases_visible';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.fees_visible limit 1;
    raise exception 'anon must not select fees_visible';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- 2) authenticated 無基表 SELECT
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform client from public.cases where id = v_case;
    raise exception 'authenticated must not select cases base table';
  exception when insufficient_privilege then null;
  end;
  begin
    perform id from public.fees where id = v_fee_own;
    raise exception 'authenticated must not select fees base table';
  exception when insufficient_privilege then null;
  end;

  -- 4) qualified helper call 失敗（authenticated session）
  begin
    perform private.public_tool_structure('[]'::jsonb);
    raise exception 'public_tool_structure qualified call must fail';
  exception
    when insufficient_privilege then null;
    when invalid_schema_name then null;
  end;
  begin
    perform private.case_field_permission_allowed('case_detail_client', 'view');
    raise exception 'case_field_permission_allowed qualified call must fail';
  exception
    when insufficient_privilege then null;
    when invalid_schema_name then null;
  end;

  -- 6) cases_visible：join + scalar subquery + filter + count 不洩漏
  select cv.client into v_join_client
  from public.cases_visible cv
  join public.cases_visible cv2 on cv2.id = cv.id
  where cv.id = v_case;

  select (
    select cv.client from public.cases_visible cv where cv.id = v_case
  ) into v_scalar;

  select client, contact, keyword, login_account, login_password, tools
    into v_visible
  from public.cases_visible cv
  where cv.id = v_case;

  select count(*) into v_count
  from public.cases_visible cv
  where cv.client ilike '%secret-client%';

  if v_join_client <> '' or v_scalar <> '' then
    raise exception 'join/subquery leaked masked client';
  end if;
  if v_visible.client <> '' or v_visible.contact <> '' or v_visible.keyword <> ''
     or v_visible.login_account <> '' or v_visible.login_password <> ''
     or v_count > 0 then
    raise exception 'filter/select leaked masked values';
  end if;
  v_tools := v_visible.tools;
  if v_tools::text ilike '%secret%' or v_tools::text ilike '%futureSensitiveKey%' then
    raise exception 'tools allowlist drift leaked unknown JSON key';
  end if;

  -- 7) 跨 env cases
  if exists (select 1 from public.cases_visible cv where cv.id = v_case_prod) then
    raise exception 'cross-env case visible';
  end if;

  -- fees_visible：本人／他人、遮罩、跨 env、filter/count/join
  select count(*) into v_count from public.fees_visible fv where fv.id = v_fee_own;
  if v_count <> 1 then raise exception 'assignee must see own fee row'; end if;

  select count(*) into v_count from public.fees_visible fv where fv.id = v_fee_other;
  if v_count <> 0 then raise exception 'must not see other assignee fee'; end if;

  select count(*) into v_count from public.fees_visible fv where fv.id = v_fee_prod;
  if v_count <> 0 then raise exception 'cross-env fee invisible'; end if;

  select fv.client_info->>'client', fv.client_info->>'rateConfirmed'
    into v_scalar, v_join_client
  from public.fees_visible fv where fv.id = v_fee_own;
  if coalesce(v_scalar, '') <> '' or coalesce(v_join_client, '') = 'true' then
    raise exception 'fee client_info sensitive fields not masked';
  end if;

  select count(*) into v_count
  from public.fees_visible fv
  where fv.client_info::text ilike '%fee-secret%';
  if v_count > 0 then raise exception 'fee filter leaked client_info'; end if;

  select count(*) into v_count
  from public.fees_visible fv
  join public.fees_visible fv2 on fv2.id = fv.id
  where fv.id = v_fee_own and fv.client_info::text ilike '%999%';
  if v_count > 0 then raise exception 'fee join leaked revenue'; end if;

  reset role;

  raise notice 'p0_definer_view_contract_check: all assertions passed';
end $$;

rollback;
