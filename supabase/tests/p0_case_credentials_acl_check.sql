-- STATUS: draft for isolated DB only; NOT run against production; unverified
--
-- P0-A5（R1-E rewrite）：cases_visible 遮罩／allowlist、基表 grant、憑證 RPC、撤權。
-- 對齊 migration：20260830122401_p0a_case_credentials.sql
--                 20260830122356_p0a_case_action_rpcs.sql（revoke_case_participant_access）
--
-- 對齊 20260930120000_case_credentials_readable_by_case_viewers.sql
--       20260930120100_case_pm_private_fields_admin_only.sql
-- 覆蓋（註解＋斷言）：
--   - anon／跨 env 拒絕 get_case_credentials
--   - 本 env 未受派、跨案（同 env）、撤權後、僅 unresolved 仍可讀（不再以 participant 設讀取門檻）
--   - credential mask（view 空值＋tools allowlist 重建）
--   - 成員 cases_visible 不得見客戶／關鍵字／PO／內部備註；計費單位與數量可見
--   - 遮罩值不得經 update_case_permitted_fields / 非 admin update_case_credentials 回寫
--   - PUBLIC EXECUTE；authenticated 不得 SELECT 基表 cases
--
-- 執行：隔離 branch／本機 DB；全程 BEGIN…ROLLBACK。

begin;

do $$
declare
  v_t1 uuid := gen_random_uuid();
  v_t2 uuid := gen_random_uuid();
  v_pm uuid := gen_random_uuid();
  v_case uuid := gen_random_uuid();
  v_case_other uuid := gen_random_uuid();
  v_case_prod uuid := gen_random_uuid();
  v_visible record;
  v_credentials jsonb;
  v_base_denied boolean := false;
  v_anon_denied boolean := false;
  v_anon_rpc_denied boolean := false;
  v_unassigned_denied boolean := false;
  v_cross_env_denied boolean := false;
  v_cross_case_denied boolean := false;
  v_revoked_denied boolean := false;
  v_masked_write_denied boolean := false;
  v_non_admin_cred_write_denied boolean := false;
  v_a2_denied boolean := false;
  v_revision bigint;
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values
    (v_t1, 'p0-r1e-cred-t1@test.local', '{"display_name":"P0 譯者一"}'),
    (v_t2, 'p0-r1e-cred-t2@test.local', '{"display_name":"P0 譯者二"}'),
    (v_pm, 'p0-r1e-cred-pm@test.local', '{"display_name":"P0 PM"}');
  update public.profiles set is_test = true where id in (v_t1, v_t2, v_pm);
  delete from public.user_roles where user_id = v_pm;
  insert into public.user_roles(user_id, role) values (v_pm, 'pm');

  insert into public.cases (
    id, title, status, client, translator, env, created_by,
    login_account, login_password, other_login_info,
    tool_field_values, tools, question_tools, created_at, updated_at
  )
  values
    (
      v_case, '[P0-A R1-E] credential fixture', 'dispatched', 'secret-client',
      '[]'::jsonb, 'test', v_pm,
      'account-secret', 'password-secret', 'other-secret',
      '{"token":"root-secret"}'::jsonb,
      '[{
        "id":"tool-1",
        "tool":"Public tool name",
        "fieldValues":{"token":"tool-secret"},
        "fileValues":{"upload":[{"url":"secret-url"}]},
        "futureSensitiveKey":{"nested":["secret",{"value":"secret"}]},
        "fields":[
          {"id":"f1","label":"Public label","type":"text","future":"secret"},
          {"id":"f2","label":"File label","type":"file"}
        ]
      }]'::jsonb,
      '[{
        "id":"question-1",
        "tool":"Question tool",
        "fieldValues":{"token":"question-secret"},
        "unknownArray":[{"futureSecret":"secret"}]
      }]'::jsonb,
      now(), now()
    );
  update public.cases set
    keyword = 'secret-keyword',
    client_po_number = 'PO-SECRET',
    internal_comments = '[{"id":"ic-1","content":"pm-only"}]'::jsonb,
    billing_unit = '字',
    unit_count = 120
  where id = v_case;
  insert into public.cases (
    id, title, status, client, translator, env, created_by,
    login_account, login_password, other_login_info,
    tool_field_values, tools, question_tools, created_at, updated_at
  )
  values
    (
      v_case_other, '[P0-A R1-E] cred other', 'dispatched', 'other',
      '[]'::jsonb, 'test', v_pm,
      'other-account', 'other-password', '', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb,
      now(), now()
    ),
    (
      v_case_prod, '[P0-A R1-E] cred prod', 'dispatched', 'prod',
      '[]'::jsonb, 'production', v_pm,
      'prod-account', 'prod-password', '', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb,
      now(), now()
    );

  insert into public.case_participants (
    case_id, user_id, role, source, created_by, updated_by
  ) values
    (v_case, v_t1, 'translator', 'pm_assign', v_pm, v_pm),
    (v_case_other, v_t2, 'translator', 'pm_assign', v_pm, v_pm);

  -- A2：第三路徑 — 無 participant、僅 unresolved
  insert into public.case_participant_backfill_unresolved (
    case_id, env, candidate_user_id, candidate_role,
    source_kind, source_record_id, reason
  ) values (
    v_case_prod, 'production', v_t1, 'translator',
    'cases_name_only', 'case.translator',
    'name_only_not_an_authorization_identity'
  );

  -- ── 契約：PUBLIC EXECUTE、基表、view owner／security_invoker ──
  if has_function_privilege('public', 'public.get_case_credentials(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_case_credentials(uuid)', 'EXECUTE')
    or has_function_privilege(
         'public', 'public.update_case_credentials(uuid,bigint,jsonb)', 'EXECUTE'
       )
    or has_function_privilege(
         'anon', 'public.update_case_credentials(uuid,bigint,jsonb)', 'EXECUTE'
       )
    or has_table_privilege('authenticated', 'public.cases', 'SELECT')
    or has_table_privilege('anon', 'public.cases', 'SELECT')
    or pg_get_userbyid((
         select relowner from pg_class
         where oid = 'public.cases_visible'::regclass
       )) <> 'postgres'
    or not coalesce((
         select 'security_invoker=false' = any(reloptions)
         from pg_class where oid = 'public.cases_visible'::regclass
       ), false)
    or not (
         select relrowsecurity from pg_class where oid = 'public.cases'::regclass
       )
  then
    raise exception 'view owner/RLS/base grant/function EXECUTE contract failed';
  end if;

  -- ── anon：view + RPC ──
  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'anon')::text,
    true
  );
  set local role anon;
  begin
    perform 1 from public.cases_visible limit 1;
  exception when insufficient_privilege then
    v_anon_denied := true;
  end;
  begin
    perform public.get_case_credentials(v_case);
  exception
    when insufficient_privilege or sqlstate '42501' then
      v_anon_rpc_denied := true;
  end;
  reset role;
  if not v_anon_denied then
    raise exception 'anon retained cases_visible access';
  end if;
  if not v_anon_rpc_denied then
    raise exception 'anon get_case_credentials was not blocked';
  end if;

  -- ── participant 可見遮罩＋憑證 RPC ──
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  select
    login_account,
    login_password,
    other_login_info,
    tool_field_values,
    tools,
    question_tools,
    client,
    keyword,
    client_po_number,
    internal_comments,
    billing_unit,
    unit_count
  into v_visible
  from public.cases_visible
  where id = v_case;

  begin
    perform login_password from public.cases where id = v_case;
  exception when insufficient_privilege then
    v_base_denied := true;
  end;
  v_credentials := public.get_case_credentials(v_case);
  reset role;

  if v_visible.login_account <> ''
    or v_visible.login_password <> ''
    or v_visible.other_login_info <> ''
    or v_visible.tool_field_values <> '{}'::jsonb then
    raise exception 'direct credential columns were not masked';
  end if;
  if v_visible.client <> ''
    or v_visible.keyword <> ''
    or v_visible.client_po_number <> ''
    or v_visible.internal_comments <> '[]'::jsonb then
    raise exception 'member saw PM-private fields in cases_visible: % % % %',
      v_visible.client, v_visible.keyword, v_visible.client_po_number, v_visible.internal_comments;
  end if;
  if v_visible.billing_unit <> '字' or v_visible.unit_count <> 120 then
    raise exception 'member must still see billing_unit/unit_count: % %',
      v_visible.billing_unit, v_visible.unit_count;
  end if;
  if v_visible.tools <> '[{
      "id":"tool-1",
      "tool":"Public tool name",
      "fieldValues":{},
      "fields":[
        {"id":"f1","label":"Public label","type":"text"},
        {"id":"f2","label":"File label","type":"file"}
      ]
    }]'::jsonb then
    raise exception 'tools were not rebuilt from allowlist: %', v_visible.tools;
  end if;
  if v_visible.question_tools <> '[{
      "id":"question-1",
      "tool":"Question tool",
      "fieldValues":{}
    }]'::jsonb then
    raise exception 'question_tools leaked unknown keys: %', v_visible.question_tools;
  end if;
  if not v_base_denied then
    raise exception 'authenticated retained base table SELECT';
  end if;
  if v_credentials ->> 'loginPassword' <> 'password-secret'
    or v_credentials #>> '{tools,0,fieldValues,token}' <> 'tool-secret' then
    raise exception 'authorized credential RPC did not return full values';
  end if;
  if v_credentials ? 'client' or v_credentials ? 'keyword' or v_credentials ? 'internalComments' then
    raise exception 'credential RPC leaked PM-private keys: %', v_credentials;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  select keyword, client into v_visible from public.cases_visible where id = v_case;
  reset role;
  if v_visible.keyword <> 'secret-keyword' or v_visible.client <> 'secret-client' then
    raise exception 'admin must see PM-private fields: % %', v_visible.keyword, v_visible.client;
  end if;

  -- ── 未指派：同 env 可讀（不再拒絕）──
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t2::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_credentials := public.get_case_credentials(v_case);
  reset role;
  if v_credentials ->> 'loginPassword' <> 'password-secret' then
    raise exception 'unassigned same-env member must read credentials';
  end if;
  v_unassigned_denied := false;

  -- ── 跨案同 env：可讀 ──
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_credentials := public.get_case_credentials(v_case_other);
  reset role;
  if v_credentials ->> 'loginPassword' <> 'other-password' then
    raise exception 'same-env member must read other visible case credentials';
  end if;
  v_cross_case_denied := false;

  -- ── 跨 env ──
  set local role authenticated;
  begin
    perform public.get_case_credentials(v_case_prod);
  exception
    when sqlstate 'P0002' or sqlstate '42501' then
      v_cross_env_denied := true;
  end;
  reset role;
  if not v_cross_env_denied then
    raise exception 'cross-env credential read was not denied';
  end if;

  -- ── A2：unresolved 不授憑證（且不建立 participant）──
  if exists (
    select 1 from public.case_participants
    where case_id = v_case_prod and user_id = v_t1
  ) then
    raise exception 'A2 produced effective participants on prod fixture';
  end if;
  -- 即使把 unresolved 對到 test env 案，仍無 participant → deny
  insert into public.case_participant_backfill_unresolved (
    case_id, env, candidate_user_id, candidate_role,
    source_kind, source_record_id, reason
  ) values (
    v_case, 'test', v_t2, 'translator',
    'cases_name_only', 'case.translator',
    'name_only_not_an_authorization_identity'
  );
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t2::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_credentials := public.get_case_credentials(v_case);
  reset role;
  if v_credentials ->> 'loginPassword' <> 'password-secret' then
    raise exception 'A2 unresolved same-env member must still read credentials';
  end if;
  v_a2_denied := false;

  -- ── 遮罩值不得經 field RPC 回寫（憑證鍵不在 registry → 42501）──
  delete from public.permission_settings where env = 'test';
  insert into public.permission_settings(id, env, config, updated_by)
  values (
    gen_random_uuid(),
    'test',
    jsonb_build_object(
      'module_permissions', jsonb_build_object(
        'member', jsonb_build_object(
          'case_management', jsonb_build_object(
            'visible', true,
            'items', jsonb_build_object(
              'case_detail_title', jsonb_build_object('view', true, 'edit', true)
            )
          )
        )
      )
    ),
    v_pm
  );
  select revision into v_revision from public.cases where id = v_case;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.update_case_permitted_fields(
      v_case, v_revision, jsonb_build_object('loginPassword', '')
    );
  exception when sqlstate '42501' then
    v_masked_write_denied := true;
  end;
  -- 非 admin 不得 update_case_credentials
  begin
    perform public.update_case_credentials(
      v_case, v_revision, jsonb_build_object('loginPassword', 'hijack')
    );
  exception when sqlstate '42501' then
    v_non_admin_cred_write_denied := true;
  end;
  reset role;
  if not v_masked_write_denied then
    raise exception 'masked credential write-back via field RPC was not denied';
  end if;
  if not v_non_admin_cred_write_denied then
    raise exception 'non-admin update_case_credentials was not denied';
  end if;

  -- ── PM 撤權後：同 env 仍可讀（讀取不再綁 participant）──
  select revision into v_revision from public.cases where id = v_case;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  perform public.revoke_case_participant_access(
    v_case, v_t1, 'translator', v_revision
  );
  reset role;

  v_revoked_denied := false;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_credentials := public.get_case_credentials(v_case);
  reset role;
  if v_credentials ->> 'loginPassword' <> 'password-secret' then
    raise exception 'revoked same-env member must still read credentials';
  end if;

  raise notice 'p0_case_credentials_acl_check PASS';
end $$;

rollback;
