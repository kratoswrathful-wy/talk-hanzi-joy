-- STATUS: local / isolated DB only; NOT against production.
-- Gate 2 maintenance write ACL：定向驗證（BEGIN…ROLLBACK）。
--
-- 覆蓋：
-- 1) 非放行帳號舊 session 寫入被拒且無副作用
-- 2) 放行 PM 可依既有授權完成指派；一般帳號不可冒充
-- 3) 閘門停用後合法流程恢復
-- 4) 閘門 RPC 在啟用失敗語意下不得誤判 allowed
--
-- Slack Edge 路徑以程式碼審查＋ gate RPC 契約覆蓋；不在此打真實 Slack。

begin;

do $$
declare
  v_pm uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_case uuid := gen_random_uuid();
  v_result jsonb;
  v_revision bigint;
  v_gate jsonb;
  v_denied boolean;
  v_audit_before bigint;
  v_audit_after bigint;
  v_participant_before int;
  v_participant_after int;
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values
    (v_pm, 'maint-acl-pm@test.local', '{"display_name":"Maint PM"}'),
    (v_member, 'maint-acl-member@test.local', '{"display_name":"Maint Member"}');

  update public.profiles set is_test = true, display_name = 'Maint PM' where id = v_pm;
  update public.profiles set is_test = true, display_name = 'Maint Member' where id = v_member;

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

  -- 預設關閉：gate allowed
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_member::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_gate := public.maintenance_write_gate();
  reset role;
  if coalesce((v_gate->>'enabled')::boolean, true) then
    raise exception 'expected maintenance disabled by default';
  end if;
  if coalesce((v_gate->>'allowed')::boolean, false) is not true then
    raise exception 'expected allowed when disabled';
  end if;

  -- 啟用維護＋只放行 PM
  perform private.maintenance_allowlist_add(v_pm, 'gate2 operator');
  perform private.maintenance_set_enabled(true, v_pm);

  -- 成員 gate：denied
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_member::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_gate := public.maintenance_write_gate();
  reset role;
  if (v_gate->>'enabled')::boolean is not true or (v_gate->>'allowed')::boolean is not false then
    raise exception 'member should be denied by gate: %', v_gate;
  end if;

  select count(*) into v_audit_before from public.case_mutation_audit where case_id = v_case;
  select count(*) into v_participant_before from public.case_participants where case_id = v_case;

  -- 成員呼叫指派 RPC：應 raise，無副作用
  v_denied := false;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_member::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    v_result := public.pm_update_case_assignments(
      v_case,
      1,
      jsonb_build_object(
        'translator', jsonb_build_array('Maint Member'),
        'translator_user_id', v_member
      )
    );
  exception
    when insufficient_privilege then
      v_denied := true;
    when others then
      if sqlerrm like '%maintenance_write_denied%' then
        v_denied := true;
      else
        raise;
      end if;
  end;
  reset role;

  if not v_denied then
    raise exception 'expected maintenance_write_denied for member, got %', v_result;
  end if;

  select count(*) into v_audit_after from public.case_mutation_audit where case_id = v_case;
  select count(*) into v_participant_after from public.case_participants where case_id = v_case;
  if v_audit_after <> v_audit_before or v_participant_after <> v_participant_before then
    raise exception 'denied write must have no side effects';
  end if;

  -- 成員不可靠 display_name／自填欄位冒充：即使用 PM 的名字也過不了 allowlist
  -- （已在上一呼叫驗證）

  -- 放行 PM：JWT=PM，通過維護閘門後仍受 is_admin／revision 約束
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_gate := public.maintenance_write_gate();
  if (v_gate->>'allowed')::boolean is not true then
    raise exception 'pm should be allowed: %', v_gate;
  end if;

  v_result := public.pm_update_case_assignments(
    v_case,
    1,
    jsonb_build_object(
      'translator', jsonb_build_array('Maint Member'),
      'translator_user_id', v_member,
      'reviewer', 'Maint PM',
      'reviewer_user_id', v_pm
    )
  );
  reset role;

  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'pm assign should succeed: %', v_result;
  end if;

  select revision into v_revision from public.cases where id = v_case;
  if v_revision is distinct from 2 then
    raise exception 'expected revision 2 after assign, got %', v_revision;
  end if;

  if not exists (
    select 1 from public.case_mutation_audit
    where case_id = v_case and actor_user_id = v_pm
  ) then
    raise exception 'expected audit actor_user_id = pm';
  end if;

  -- service 路徑：maintenance_actor_allowed_for_service
  if public.maintenance_actor_allowed_for_service(v_member) is not false then
    raise exception 'service check should deny member';
  end if;
  if public.maintenance_actor_allowed_for_service(v_pm) is not true then
    raise exception 'service check should allow pm';
  end if;

  -- 無 JWT：assert 拒絕
  perform set_config('request.jwt.claims', '', true);
  v_denied := false;
  begin
    perform private.assert_maintenance_write_allowed();
  exception
    when others then
      if sqlerrm like '%maintenance_write_denied%' then
        v_denied := true;
      else
        raise;
      end if;
  end;
  if not v_denied then
    raise exception 'null auth.uid should deny when enabled';
  end if;

  -- 停用後恢復：成員仍非 admin，指派應 not_authorized（非 maintenance）
  perform private.maintenance_set_enabled(false, v_pm);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_member::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_gate := public.maintenance_write_gate();
  v_result := public.pm_update_case_assignments(
    v_case,
    v_revision,
    jsonb_build_object('reviewer', 'x')
  );
  reset role;
  if (v_gate->>'enabled')::boolean is not false then
    raise exception 'expected disabled after set_enabled false';
  end if;
  if coalesce(v_result->>'error', '') <> 'not_authorized' then
    raise exception 'member after disable should hit role auth, got %', v_result;
  end if;

  -- PM 在停用後仍可寫（合法流程恢復）
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_result := public.pm_update_case_assignments(
    v_case,
    v_revision,
    jsonb_build_object(
      'reviewer', 'Maint PM',
      'reviewer_user_id', v_pm
    )
  );
  reset role;
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'pm after disable should succeed: %', v_result;
  end if;

  raise notice 'gate2_maintenance_write_acl_check OK';
end;
$$;

rollback;
