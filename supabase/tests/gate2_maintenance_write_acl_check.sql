-- STATUS: local / isolated DB only; NOT against production.
-- Gate 2 maintenance write ACL：定向驗證（BEGIN…ROLLBACK）。
--
-- 斷言要求：維護拒絕須同時 SQLSTATE 42501 與 message maintenance_write_denied
-- （不得把任意 insufficient_privilege 當成功）。

begin;

do $$
declare
  v_pm uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_case uuid := gen_random_uuid();
  v_result jsonb;
  v_revision bigint;
  v_gate jsonb;
  v_sqlstate text;
  v_sqlmsg text;
  v_denied boolean;
  v_audit_before bigint;
  v_audit_after bigint;
  v_participant_before int;
  v_participant_after int;
  v_rev_before bigint;
  v_translator_before jsonb;
  v_rev_after bigint;
  v_translator_after jsonb;
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values
    (v_pm, 'maint-acl-pm@test.local', '{"display_name":"Maint PM"}'),
    (v_member, 'maint-acl-member@test.local', '{"display_name":"Maint Member"}');

  update public.profiles set is_test = true, display_name = 'Maint PM' where id = v_pm;
  update public.profiles set is_test = true, display_name = 'Maint Member' where id = v_member;

  delete from public.user_roles where user_id in (v_pm, v_member);
  insert into public.user_roles(user_id, role) values
    (v_pm, 'pm'),
    (v_member, 'member');

  insert into public.cases (
    id, env, title, status, revision, multi_collab,
    translator, reviewer, collab_rows, review_rows
  ) values (
    v_case, 'test', 'Maint ACL Case', 'draft', 1, false,
    '[]'::jsonb, '', '[]'::jsonb, '[]'::jsonb
  );

  -- ── 原權限：內層 helper 不得對 authenticated 開放（包裝後仍須成立）────────
  if has_function_privilege(
       'authenticated',
       'public.sync_cat_workflow_assignments_for_case(uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.sync_cat_file_assignments_for_case(uuid)',
       'EXECUTE'
     )
  then
    raise exception 'authenticated EXECUTE re-opened on inner sync helpers';
  end if;

  if has_function_privilege(
       'authenticated',
       'private.sync_cat_workflow_assignments_for_case_impl(uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'private.sync_cat_file_assignments_for_case_impl(uuid)',
       'EXECUTE'
     )
  then
    raise exception 'authenticated EXECUTE on private sync *_impl (bypass risk)';
  end if;

  if not has_function_privilege(
       'authenticated',
       'public.lms_sync_cat_workflow_for_case(uuid)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.pm_update_case_assignments(uuid, bigint, jsonb)',
       'EXECUTE'
     )
  then
    raise exception 'authenticated lost EXECUTE on expected public entries';
  end if;

  -- ── 維護關閉：有權 PM 指派成功（基線）────────────────────────────────────
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_gate := public.maintenance_write_gate();
  if coalesce((v_gate->>'enabled')::boolean, true) then
    raise exception 'expected maintenance disabled by default';
  end if;
  v_result := public.pm_update_case_assignments(
    v_case,
    1,
    jsonb_build_object(
      'translator', jsonb_build_array('Maint Member'),
      'translator_user_id', v_member
    )
  );
  reset role;
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'pm assign before maintenance should succeed: %', v_result;
  end if;
  select revision into v_revision from public.cases where id = v_case;
  if v_revision is distinct from 2 then
    raise exception 'expected revision 2 after baseline assign, got %', v_revision;
  end if;

  -- ── 啟用維護：僅放行 PM ───────────────────────────────────────────────────
  perform private.maintenance_allowlist_add(v_pm, 'gate2 operator');
  perform private.maintenance_set_enabled(true, v_pm);

  -- 內層 helper：維護開時仍不可被一般使用者呼叫
  if has_function_privilege(
       'authenticated',
       'public.sync_cat_file_assignments_for_case(uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.sync_cat_workflow_assignments_for_case(uuid)',
       'EXECUTE'
     )
  then
    raise exception 'inner helpers callable by authenticated while maintenance on';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_member::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_denied := false;
  v_sqlstate := null;
  v_sqlmsg := null;
  begin
    perform public.sync_cat_file_assignments_for_case(v_case);
  exception
    when insufficient_privilege then
      v_denied := true;
      v_sqlstate := sqlstate;
      v_sqlmsg := sqlerrm;
    when others then
      v_sqlstate := sqlstate;
      v_sqlmsg := sqlerrm;
      -- 無權 EXECUTE 時也可能是 42501 以外；記錄後仍視為阻擋
      v_denied := true;
  end;
  reset role;
  if not v_denied then
    raise exception 'member must not execute inner sync helper';
  end if;

  -- 原本有權的 PM：維護中若不在 allowlist 應被拒（先測移除再加回）
  perform private.maintenance_allowlist_remove(v_pm);
  select revision, translator into v_rev_before, v_translator_before
  from public.cases where id = v_case;
  select count(*) into v_audit_before from public.case_mutation_audit where case_id = v_case;
  select count(*) into v_participant_before from public.case_participants where case_id = v_case;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_denied := false;
  v_sqlstate := null;
  v_sqlmsg := null;
  begin
    v_result := public.pm_update_case_assignments(
      v_case,
      v_rev_before,
      jsonb_build_object(
        'reviewer', 'Maint PM',
        'reviewer_user_id', v_pm
      )
    );
  exception
    when others then
      v_sqlstate := sqlstate;
      v_sqlmsg := sqlerrm;
      if v_sqlstate = '42501' and v_sqlmsg like '%maintenance_write_denied%' then
        v_denied := true;
      else
        raise exception 'unexpected deny shape: state=% msg=%', v_sqlstate, v_sqlmsg;
      end if;
  end;
  reset role;

  if not v_denied then
    raise exception 'pm without allowlist must be maintenance_write_denied, got %', v_result;
  end if;

  select revision, translator into v_rev_after, v_translator_after
  from public.cases where id = v_case;
  select count(*) into v_audit_after from public.case_mutation_audit where case_id = v_case;
  select count(*) into v_participant_after from public.case_participants where case_id = v_case;
  if v_rev_after is distinct from v_rev_before
     or v_translator_after is distinct from v_translator_before
     or v_audit_after <> v_audit_before
     or v_participant_after <> v_participant_before
  then
    raise exception 'denied write must leave cases/revision/participants/audit unchanged';
  end if;

  -- 放行 PM：通過維護閘門後仍受角色／revision 約束
  perform private.maintenance_allowlist_add(v_pm, 'gate2 operator');
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_gate := public.maintenance_write_gate();
  if (v_gate->>'allowed')::boolean is not true then
    raise exception 'allowlisted pm should be allowed: %', v_gate;
  end if;
  -- 錯 revision → 既有授權失敗（非維護）
  v_result := public.pm_update_case_assignments(
    v_case,
    999999,
    jsonb_build_object('reviewer', 'Maint PM', 'reviewer_user_id', v_pm)
  );
  if coalesce(v_result->>'error', '') <> 'stale_revision'
     or coalesce((v_result->>'ok')::boolean, true) is not false
  then
    raise exception 'wrong revision should fail under existing auth: %', v_result;
  end if;

  v_result := public.pm_update_case_assignments(
    v_case,
    v_rev_before,
    jsonb_build_object(
      'reviewer', 'Maint PM',
      'reviewer_user_id', v_pm
    )
  );
  reset role;
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'allowlisted pm assign should succeed: %', v_result;
  end if;
  select revision into v_revision from public.cases where id = v_case;
  if not exists (
    select 1 from public.case_mutation_audit
    where case_id = v_case and actor_user_id = v_pm
  ) then
    raise exception 'expected audit actor_user_id = pm';
  end if;

  -- 成員不可靠 allowlist：即使 JWT 也非放行
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_member::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_denied := false;
  begin
    v_result := public.pm_update_case_assignments(
      v_case,
      v_revision,
      jsonb_build_object('reviewer', 'x')
    );
  exception
    when others then
      if sqlstate = '42501' and sqlerrm like '%maintenance_write_denied%' then
        v_denied := true;
      else
        raise;
      end if;
  end;
  reset role;
  if not v_denied then
    raise exception 'member must get maintenance_write_denied';
  end if;

  -- service actor check
  if public.maintenance_actor_allowed_for_service(v_member) is not false then
    raise exception 'service check should deny member';
  end if;
  if public.maintenance_actor_allowed_for_service(v_pm) is not true then
    raise exception 'service check should allow pm';
  end if;

  -- 停用後：內層 helper 仍不可被 authenticated 呼叫
  perform private.maintenance_set_enabled(false, v_pm);
  if has_function_privilege(
       'authenticated',
       'public.sync_cat_file_assignments_for_case(uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.sync_cat_workflow_assignments_for_case(uuid)',
       'EXECUTE'
     )
  then
    raise exception 'inner helpers callable after maintenance off';
  end if;

  -- 有權 PM：解除後成功
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_gate := public.maintenance_write_gate();
  v_result := public.pm_update_case_assignments(
    v_case,
    v_revision,
    jsonb_build_object(
      'reviewer', 'Maint PM',
      'reviewer_user_id', v_pm
    )
  );
  reset role;
  if (v_gate->>'enabled')::boolean is not false then
    raise exception 'expected disabled after set_enabled false';
  end if;
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'pm after disable should succeed: %', v_result;
  end if;

  -- 成員解除後仍走角色拒絕（非維護）
  select revision into v_revision from public.cases where id = v_case;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_member::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_result := public.pm_update_case_assignments(
    v_case,
    v_revision,
    jsonb_build_object('reviewer', 'x')
  );
  reset role;
  if coalesce(v_result->>'error', '') <> 'not_authorized' then
    raise exception 'member after disable should hit role auth, got %', v_result;
  end if;

  -- 啟用觀測：不得把 enabled=false／矛盾 payload 當停寫完成
  perform private.maintenance_set_enabled(true, v_pm);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_member::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_gate := public.maintenance_write_gate();
  reset role;
  if (v_gate->>'enabled')::boolean is not true
     or (v_gate->>'allowed')::boolean is not false
  then
    raise exception 'ops must observe enabled=true allowed=false for non-allowlist: %', v_gate;
  end if;
  perform private.maintenance_set_enabled(false, v_pm);

  raise notice 'gate2_maintenance_write_acl_check OK';
end;
$$;

rollback;
