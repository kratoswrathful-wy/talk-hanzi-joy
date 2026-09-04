-- STATUS: draft for isolated DB only; NOT run against production; unverified
--
-- P0-A4（R1-E rewrite）：動態欄位 ACL、registry 隔離、revision、遮罩值不得回寫。
-- 對齊 migration：20260830122359_p0a_case_field_acl.sql
--
-- 覆蓋（註解＋斷言）：
--   - anon / 未指派 / 跨 env / 跨案拒絕
--   - participant 僅允許 permission_settings 白名單欄位
--   - stale revision
--   - 遮罩／無權限欄位（client）與系統欄（status）不得經 RPC 回寫
--   - 憑證鍵不在 registry → field_not_permitted
--   - PUBLIC EXECUTE；authenticated 不得寫 private.case_field_acl_registry
--   - A2 脈絡：僅 unresolved 無 participant 時不得 update_case_permitted_fields
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
  v_setting uuid := gen_random_uuid();
  v_duplicate_setting uuid := gen_random_uuid();
  v_before_hash text;
  v_after_hash text;
  v_result jsonb;
  v_denied boolean := false;
  v_unknown_denied boolean := false;
  v_cred_key_denied boolean := false;
  v_ambiguous_blocked boolean := false;
  v_anon_blocked boolean := false;
  v_unassigned_blocked boolean := false;
  v_cross_env_blocked boolean := false;
  v_cross_case_blocked boolean := false;
  v_stale_blocked boolean := false;
  v_a2_blocked boolean := false;
  v_revision bigint;
  v_title text;
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values
    (v_t1, 'p0-r1e-field-t1@test.local', '{"display_name":"P0 譯者一"}'),
    (v_t2, 'p0-r1e-field-t2@test.local', '{"display_name":"P0 譯者二"}'),
    (v_pm, 'p0-r1e-field-pm@test.local', '{"display_name":"P0 PM"}');
  update public.profiles set is_test = true where id in (v_t1, v_t2, v_pm);
  delete from public.user_roles where user_id = v_pm;
  insert into public.user_roles(user_id, role) values (v_pm, 'pm');

  -- 單一 test env permission_settings（member 可改 title，不可改 client）
  delete from public.permission_settings where env = 'test';
  insert into public.permission_settings(id, env, config, updated_by)
  values (
    v_setting,
    'test',
    jsonb_build_object(
      'fields', '{}'::jsonb,
      'settings_sections', '{}'::jsonb,
      'module_permissions', jsonb_build_object(
        'member', jsonb_build_object(
          'case_management', jsonb_build_object(
            'visible', true,
            'items', jsonb_build_object(
              'case_detail_title', jsonb_build_object('view', true, 'edit', true),
              'case_detail_client', jsonb_build_object('view', false, 'edit', false)
            )
          )
        )
      )
    ),
    v_pm
  );

  insert into public.cases (
    id, title, status, client, translator, env, created_by,
    login_account, login_password, other_login_info,
    tool_field_values, tools, question_tools, created_at, updated_at
  )
  values
    (
      v_case, '[P0-A R1-E] field ACL fixture', 'dispatched', 'secret-client',
      '[]'::jsonb, 'test', v_pm,
      'account-secret', 'password-secret', 'other-secret',
      '{"token":"secret"}'::jsonb,
      '[{"id":"t","tool":"Tool","fieldValues":{"token":"secret"},"future":{"secret":"x"}}]'::jsonb,
      '[{"id":"q","tool":"Q","fieldValues":{"token":"secret"}}]'::jsonb,
      now(), now()
    ),
    (
      v_case_other, '[P0-A R1-E] field other', 'dispatched', 'other',
      '[]'::jsonb, 'test', v_pm,
      '', '', '', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, now(), now()
    ),
    (
      v_case_prod, '[P0-A R1-E] field prod', 'dispatched', 'prod',
      '[]'::jsonb, 'production', v_pm,
      '', '', '', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, now(), now()
    );

  insert into public.case_participants (
    case_id, user_id, role, source, created_by, updated_by
  ) values (
    v_case, v_t1, 'translator', 'pm_assign', v_pm, v_pm
  );

  -- A2 風格：另一案只有 unresolved、無 participant
  insert into public.case_participant_backfill_unresolved (
    case_id, env, candidate_user_id, candidate_role,
    source_kind, source_record_id, reason
  ) values (
    v_case_other, 'test', v_t1, 'translator',
    'cases_name_only', 'case.translator',
    'name_only_not_an_authorization_identity'
  );

  -- ── PUBLIC / anon 不得 EXECUTE ──
  if has_function_privilege(
       'public', 'public.update_case_permitted_fields(uuid,bigint,jsonb)', 'EXECUTE'
     )
     or has_function_privilege(
       'anon', 'public.update_case_permitted_fields(uuid,bigint,jsonb)', 'EXECUTE'
     )
  then
    raise exception 'PUBLIC/anon still has EXECUTE on update_case_permitted_fields';
  end if;

  if has_schema_privilege('authenticated', 'private', 'USAGE')
    or has_table_privilege(
      'authenticated',
      'private.case_field_acl_registry',
      'INSERT,UPDATE,DELETE'
    ) then
    raise exception 'ACL registry is writable or visible to authenticated';
  end if;

  select md5(concat_ws(
    '|',
    login_account,
    login_password,
    other_login_info,
    tool_field_values::text,
    tools::text,
    question_tools::text
  ))
  into v_before_hash
  from public.cases where id = v_case;

  -- ── anon 拒絕 ──
  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'anon')::text,
    true
  );
  set local role anon;
  begin
    perform public.update_case_permitted_fields(
      v_case, 0, jsonb_build_object('title', 'anon-hijack')
    );
  exception
    when insufficient_privilege or sqlstate '42501' then
      v_anon_blocked := true;
  end;
  reset role;
  if not v_anon_blocked then
    raise exception 'anon update_case_permitted_fields was not blocked';
  end if;

  -- ── 未指派（t2 無 participant）──
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t2::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.update_case_permitted_fields(
      v_case, 0, jsonb_build_object('title', 'unassigned')
    );
  exception
    when sqlstate '42501' then
      v_unassigned_blocked := true;
  end;
  reset role;
  if not v_unassigned_blocked then
    raise exception 'unassigned field update was not blocked';
  end if;

  -- ── 跨 env ──
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.update_case_permitted_fields(
      v_case_prod, 0, jsonb_build_object('title', 'cross-env')
    );
  exception
    when sqlstate 'P0002' or sqlstate '42501' then
      v_cross_env_blocked := true;
  end;
  reset role;
  if not v_cross_env_blocked then
    raise exception 'cross-env field update was not blocked';
  end if;

  -- ── A2：僅 unresolved → active_participant_required ──
  set local role authenticated;
  begin
    perform public.update_case_permitted_fields(
      v_case_other, 0, jsonb_build_object('title', 'from-unresolved')
    );
  exception
    when sqlstate '42501' then
      v_a2_blocked := true;
  end;
  reset role;
  if not v_a2_blocked then
    raise exception 'A2 unresolved-only actor was allowed to update fields';
  end if;
  if exists (
    select 1 from public.case_participants
    where case_id = v_case_other and user_id = v_t1
  ) then
    raise exception 'A2 produced effective participants';
  end if;

  -- ── 跨案：t1 是 v_case participant，不得改 v_case_other（且無 participant）──
  -- （與 A2 重疊；再以「有 participant 的他案」強化：t2 成為 other 的 participant）
  insert into public.case_participants (
    case_id, user_id, role, source, created_by, updated_by
  ) values (
    v_case_other, v_t2, 'translator', 'pm_assign', v_pm, v_pm
  );
  set local role authenticated;
  begin
    perform public.update_case_permitted_fields(
      v_case_other, 0, jsonb_build_object('title', 'cross-case')
    );
  exception
    when sqlstate '42501' then
      v_cross_case_blocked := true;
  end;
  reset role;
  if not v_cross_case_blocked then
    raise exception 'cross-case field update was not blocked';
  end if;

  -- ── 合法允許欄位 ──
  set local role authenticated;
  v_result := public.update_case_permitted_fields(
    v_case,
    0,
    jsonb_build_object('title', '[P0-A R1-E] allowed title')
  );
  reset role;

  if (v_result ->> 'revision')::bigint <> 1
    or (select title from public.cases where id = v_case) <> '[P0-A R1-E] allowed title' then
    raise exception 'allowed field update failed: %', v_result;
  end if;

  select md5(concat_ws(
    '|',
    login_account,
    login_password,
    other_login_info,
    tool_field_values::text,
    tools::text,
    question_tools::text
  ))
  into v_after_hash
  from public.cases where id = v_case;
  if v_after_hash <> v_before_hash then
    raise exception 'non-credential update changed credential hash';
  end if;

  -- ── stale revision ──
  set local role authenticated;
  begin
    perform public.update_case_permitted_fields(
      v_case, 0, jsonb_build_object('title', 'stale')
    );
  exception
    when sqlstate '40001' then
      v_stale_blocked := true;
  end;
  reset role;
  if not v_stale_blocked then
    raise exception 'stale revision field update was not blocked';
  end if;

  -- ── 遮罩／無權限欄位不得回寫（client edit=false）──
  set local role authenticated;
  begin
    perform public.update_case_permitted_fields(
      v_case, 1, jsonb_build_object('client', '')
    );
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  reset role;
  if not v_denied then
    raise exception 'masked client write-back was not denied';
  end if;

  -- ── 系統欄不在 registry ──
  set local role authenticated;
  begin
    perform public.update_case_permitted_fields(
      v_case, 1, jsonb_build_object('status', 'delivered')
    );
  exception when sqlstate '42501' then
    v_unknown_denied := true;
  end;
  reset role;
  if not v_unknown_denied then
    raise exception 'system field escaped registry';
  end if;

  -- ── 憑證鍵不得經 permitted-fields RPC 回寫 ──
  set local role authenticated;
  begin
    perform public.update_case_permitted_fields(
      v_case, 1, jsonb_build_object('loginPassword', 'hacked')
    );
  exception when sqlstate '42501' then
    v_cred_key_denied := true;
  end;
  reset role;
  if not v_cred_key_denied then
    raise exception 'credential key write via field RPC was not denied';
  end if;

  -- ── permission_settings duplicate row → 55000 (temp drop UNIQUE; restore after) ──
  drop index if exists public.permission_settings_env_unique;

  select revision, title into v_revision, v_title
  from public.cases where id = v_case;

  insert into public.permission_settings(id, env, config, updated_by)
  values (v_duplicate_setting, 'test', '{}'::jsonb, v_pm);

  set local role authenticated;
  begin
    perform public.update_case_permitted_fields(
      v_case, v_revision, jsonb_build_object('title', 'must not update')
    );
  exception when sqlstate '55000' then
    v_ambiguous_blocked := true;
  end;
  reset role;

  if not v_ambiguous_blocked then
    raise exception 'duplicate permission_settings was not blocked';
  end if;
  if (select revision from public.cases where id = v_case) is distinct from v_revision then
    raise exception 'ambiguous permission_settings must not bump revision';
  end if;
  if (select title from public.cases where id = v_case) is distinct from v_title then
    raise exception 'ambiguous permission_settings must not change title';
  end if;

  delete from public.permission_settings where id = v_duplicate_setting;

  create unique index if not exists permission_settings_env_unique
    on public.permission_settings (env);

  -- verify UNIQUE restored; do not leave the probe row
  begin
    insert into public.permission_settings(id, env, config, updated_by)
    values (gen_random_uuid(), 'test', '{}'::jsonb, v_pm);
    raise exception 'unique(env) should block duplicate after recreate';
  exception
    when unique_violation then
      null;
  end;

  raise notice 'p0_case_field_acl_check PASS';
end $$;

rollback;
