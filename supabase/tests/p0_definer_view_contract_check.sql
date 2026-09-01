-- STATUS: draft; NOT run against production; unverified
--
-- P0-V：cases_visible／fees_visible definer view 受控例外契約（11 項）。
-- 對齊：20260830122401_p0a_case_credentials.sql、20260901120100 補丁。
--
-- 執行：隔離 branch／本機 DB；全程 BEGIN…ROLLBACK。

begin;

do $$
declare
  v_pm uuid := gen_random_uuid();
  v_t1 uuid := gen_random_uuid();
  v_case uuid := gen_random_uuid();
  v_case_prod uuid := gen_random_uuid();
  v_visible record;
  v_tools jsonb;
  v_count bigint;
  v_err text;
  v_expected_cols text[] := array[
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
    (v_t1, 'p0v-t1@test.local', '{"display_name":"P0V 譯者"}');

  update public.profiles set is_test = true where id in (v_pm, v_t1);
  delete from public.user_roles where user_id in (v_pm, v_t1);
  insert into public.user_roles(user_id, role)
  values (v_pm, 'pm'), (v_t1, 'member');

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

  insert into public.case_participants (
    case_id, user_id, role, source, created_by, updated_by
  ) values (v_case, v_t1, 'translator', 'pm_assign', v_pm, v_pm);

  -- 1) anon 無 view SELECT
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    perform 1 from public.cases_visible limit 1;
    raise exception 'anon must not select cases_visible';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform 1 from public.fees_visible limit 1;
    raise exception 'anon must not select fees_visible';
  exception when insufficient_privilege then
    null;
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
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform id from public.fees limit 1;
    raise exception 'authenticated must not select fees base table';
  exception when insufficient_privilege then
    null;
  end;

  -- 3) authenticated 無 private schema USAGE
  if has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'authenticated must not have private schema USAGE';
  end if;

  -- 4) 即使有 helper EXECUTE 也無法 qualified call
  if not (
    has_function_privilege('authenticated', 'private.public_tool_structure(jsonb)', 'EXECUTE')
    and has_function_privilege('authenticated', 'private.case_field_permission_allowed(text,text)', 'EXECUTE')
  ) then
    raise exception 'authenticated helper EXECUTE grant missing for security_barrier view';
  end if;
  begin
    perform private.public_tool_structure('[]'::jsonb);
    raise exception 'qualified private helper call must fail without schema USAGE';
  exception
    when insufficient_privilege then
      null;
    when invalid_schema_name then
      null;
  end;

  -- 5) PostgREST／RPC 無法旁路直接呼叫 helper（private 函式不在 public API）
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in ('public_tool_structure', 'case_field_permission_allowed')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then
    raise exception 'private helpers must not be anon executable';
  end if;

  -- 6) join/subquery/filter/count 不洩漏遮罩值
  select client, contact, keyword, login_account, login_password, tools
    into v_visible
  from public.cases_visible cv
  where cv.id = v_case;

  select count(*) into v_count
  from public.cases_visible cv
  where cv.client ilike '%secret-client%';

  if v_visible.client <> ''
     or v_visible.contact <> ''
     or v_visible.keyword <> ''
     or v_visible.login_account <> ''
     or v_visible.login_password <> ''
     or v_count > 0 then
    raise exception 'masked values leaked via filter/select';
  end if;

  v_tools := v_visible.tools;
  if v_tools::text ilike '%secret%' or v_tools::text ilike '%futureSensitiveKey%' then
    raise exception 'unknown JSON key leaked through tools allowlist view rebuild';
  end if;

  -- 7) 跨 env 不可見
  if exists (
    select 1 from public.cases_visible cv where cv.id = v_case_prod
  ) then
    raise exception 'cross-env row visible in test session';
  end if;

  reset role;

  -- 8) 欄位 allowlist 漂移 → FAIL
  select array_agg(column_name::text order by ordinal_position)
    into v_actual_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'cases_visible';

  select array_agg(c) into v_drift
  from unnest(v_actual_cols) c
  where not (c = any(v_expected_cols));

  if v_drift is not null and array_length(v_drift, 1) > 0 then
    raise exception 'cases_visible allowlist drift: %', v_drift;
  end if;

  select array_agg(c) into v_drift
  from unnest(v_expected_cols) c
  where not (c = any(v_actual_cols));

  if v_drift is not null and array_length(v_drift, 1) > 0 then
    raise exception 'cases_visible missing expected columns: %', v_drift;
  end if;

  -- 10) owner／grant 契約
  if pg_get_userbyid((
       select c.relowner from pg_class c where c.oid = 'public.cases_visible'::regclass
     )) <> 'postgres' then
    raise exception 'cases_visible owner must be postgres';
  end if;
  if has_table_privilege('anon', 'public.cases_visible', 'SELECT') then
    raise exception 'anon must not have cases_visible SELECT';
  end if;
  if not has_table_privilege('authenticated', 'public.cases_visible', 'SELECT') then
    raise exception 'authenticated must have cases_visible SELECT';
  end if;

  -- Slack edge-only（INFO 2）：RLS 啟用、無 client policy、僅 service_role 可寫
  if not (
    (select relrowsecurity from pg_class where oid = 'public.slack_oauth_states'::regclass)
    and (select relrowsecurity from pg_class where oid = 'public.user_slack_meta'::regclass)
  ) then
    raise exception 'slack tables must have RLS enabled';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('slack_oauth_states', 'user_slack_meta')
      and roles::text ilike '%authenticated%'
  ) then
    raise exception 'slack tables must not expose authenticated policies (edge-only)';
  end if;

  raise notice 'p0_definer_view_contract_check: all assertions passed';
end $$;

rollback;
