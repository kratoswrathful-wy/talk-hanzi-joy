-- STATUS: draft; NOT run; unverified
--
-- P0-B ACL harden：對齊 migration 20260831151322_p0b_acl_harden.sql
--
-- 覆蓋（註解＋斷言草稿）：
--   1) 一般使用者呼叫 cat_pm_upsert_*／cat_pm_assign_*（含自指派）→ not_authorized
--   2) 假 UUID／跨 env（is_test 不符）assignee → invalid_assignee
--   3) 非法 status／非法跳轉（member）→ invalid_status／invalid_status_transition
--   4) PM 可設 allowlist 內任意合法狀態（含 cancelled）
--   5) authenticated 對 cat_file_assignments／cat_view_assignments／cases 無 UPDATE
--      （INSERT/DELETE 於 file／view assignment 亦無）
--   6) apply_case_update：updated_at 竄改被剝除；未知 key → unknown_patch_key 且不突變
--   7) PUBLIC／anon 不得 EXECUTE 新／外層 privileged RPC
--   8) P0-C：apply_case_update 成功寫 audit；authenticated 無 cases INSERT/DELETE
--   9) P0-C：admin_create_case／admin_delete_case（PM only）
--
-- 執行：隔離 branch／本機 DB；全程 BEGIN…ROLLBACK。禁止對正式庫執行。

begin;

do $$
declare
  v_member uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_pm uuid := gen_random_uuid();
  v_prod_user uuid := gen_random_uuid();
  v_case uuid := gen_random_uuid();
  v_project uuid := gen_random_uuid();
  v_file uuid := gen_random_uuid();
  v_view uuid := gen_random_uuid();
  v_asg uuid := gen_random_uuid();
  v_revision bigint;
  v_title text;
  v_result jsonb;
  v_fake uuid := '00000000-0000-4000-8000-000000000099'::uuid;
  v_new_case uuid := gen_random_uuid();
  v_audit_before int;
  v_audit_after int;
  v_direct_insert_blocked boolean := false;
  v_direct_delete_blocked boolean := false;
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values
    (v_member, 'p0b-harden-member@test.local', '{"display_name":"P0B Harden 成員"}'),
    (v_other, 'p0b-harden-other@test.local', '{"display_name":"P0B Harden 他人"}'),
    (v_pm, 'p0b-harden-pm@test.local', '{"display_name":"P0B Harden PM"}'),
    (v_prod_user, 'p0b-harden-prod@example.com', '{"display_name":"P0B Harden Prod"}');
  update public.profiles set is_test = true where id in (v_member, v_other, v_pm);
  update public.profiles set is_test = false where id = v_prod_user;
  delete from public.user_roles where user_id = v_pm;
  insert into public.user_roles(user_id, role) values (v_pm, 'pm');

  insert into public.cases (
    id, title, status, client, translator, env, created_by, created_at, updated_at
  ) values (
    v_case, '[P0-B] harden fixture', 'dispatched', 'c',
    '[]'::jsonb, 'test', v_pm, now(), now()
  );

  insert into public.cat_projects (id, name, env, created_at)
  values (v_project, '[P0-B] harden proj', 'test', now())
  on conflict do nothing;

  insert into public.cat_files (id, project_id, name, env, related_lms_case_id)
  values (v_file, v_project, 'harden.mqxliff', 'test', v_case);

  insert into public.cat_views (id, project_id, owner_user_id, name, file_ids, segment_ids)
  values (v_view, v_project, v_pm, '[P0-B] harden view', array[v_file], '{}'::uuid[]);

  insert into public.cat_file_assignments (
    id, file_id, assignee_user_id, status, assigned_at, updated_at
  ) values (v_asg, v_file, v_member, 'assigned', now(), now());

  -- 表權限：file／view assignment 無 DML；cases 無 UPDATE
  if has_table_privilege('authenticated', 'public.cat_file_assignments', 'INSERT')
     or has_table_privilege('authenticated', 'public.cat_file_assignments', 'UPDATE')
     or has_table_privilege('authenticated', 'public.cat_file_assignments', 'DELETE')
     or has_table_privilege('authenticated', 'public.cat_view_assignments', 'INSERT')
     or has_table_privilege('authenticated', 'public.cat_view_assignments', 'UPDATE')
     or has_table_privilege('authenticated', 'public.cat_view_assignments', 'DELETE')
     or has_table_privilege('authenticated', 'public.cases', 'UPDATE')
  then
    raise exception 'authenticated still has DML on assignment tables or cases UPDATE';
  end if;

  if has_function_privilege(
       'anon', 'public.cat_pm_assign_view(uuid, uuid[])', 'EXECUTE'
     )
     or has_function_privilege(
       'public', 'public.cat_pm_upsert_translate_stage_assignment(uuid, uuid, text, uuid, text, integer, integer, text, boolean, uuid)', 'EXECUTE'
     )
  then
    raise exception 'PUBLIC/anon still has EXECUTE on harden RPCs';
  end if;

  -- 成員不得自指派 upsert
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_member::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.cat_pm_upsert_translate_stage_assignment(
      v_file, v_member, null, null, null, null, null, 'assigned', false, null
    );
    raise exception 'member self-upsert should fail';
  exception
    when sqlstate '42501' then null;
  end;

  begin
    perform public.cat_pm_assign_file(v_file, array[v_member]);
    raise exception 'member assign_file should fail';
  exception
    when sqlstate '42501' then null;
  end;

  -- 非法 status
  begin
    perform public.cat_update_file_assignment_status(v_asg, 'bogus');
    raise exception 'bogus status should fail';
  exception
    when sqlstate '22023' then null;
  end;

  -- 非法跳轉：assigned → completed（跳過 in_progress）
  begin
    perform public.cat_update_file_assignment_status(v_asg, 'completed');
    raise exception 'skip transition should fail for member';
  exception
    when sqlstate '22023' then null;
  end;

  -- 合法正向
  perform public.cat_update_file_assignment_status(v_asg, 'in_progress');

  -- 成員不得 cancelled
  begin
    perform public.cat_update_file_assignment_status(v_asg, 'cancelled');
    raise exception 'member cancelled should fail';
  exception
    when sqlstate '22023' then null;
  end;

  reset role;

  -- PM：假 UUID／跨 env
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  begin
    perform public.cat_pm_assign_file(v_file, array[v_fake]);
    raise exception 'fake assignee should fail';
  exception
    when sqlstate '22023' then null;
  end;

  begin
    perform public.cat_pm_assign_file(v_file, array[v_prod_user]);
    raise exception 'cross-env assignee should fail';
  exception
    when sqlstate '22023' then null;
  end;

  -- PM 可 cancelled
  perform public.cat_update_file_assignment_status(v_asg, 'cancelled');

  -- apply_case_update：未知鍵
  select revision, title into v_revision, v_title from public.cases where id = v_case;
  v_result := public.apply_case_update(
    v_case,
    jsonb_build_object('title', 'should-not-apply', 'not_a_column', true),
    v_revision
  );
  if coalesce(v_result->>'ok', '') <> 'false'
     or coalesce(v_result->>'error', '') <> 'unknown_patch_key'
  then
    raise exception 'unknown_patch_key expected, got %', v_result;
  end if;
  if exists (
    select 1 from public.cases where id = v_case and title is distinct from v_title
  ) then
    raise exception 'unknown key mutated title';
  end if;

  -- 僅 updated_at → empty_patch_after_filter
  v_result := public.apply_case_update(
    v_case,
    jsonb_build_object('updated_at', '2099-01-01T00:00:00Z'),
    v_revision
  );
  if coalesce(v_result->>'error', '') <> 'empty_patch_after_filter' then
    raise exception 'updated_at-only should empty_patch_after_filter, got %', v_result;
  end if;

  -- P0-C：authenticated 無 cases INSERT/DELETE
  if has_table_privilege('authenticated', 'public.cases', 'INSERT')
     or has_table_privilege('authenticated', 'public.cases', 'DELETE')
  then
    raise exception 'authenticated still has INSERT/DELETE on cases';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_member::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    insert into public.cases (id, title, status, client, env)
    values (gen_random_uuid(), 'hack', 'draft', 'x', 'test');
    raise exception 'member direct insert should fail';
  exception
    when insufficient_privilege or sqlstate '42501' then
      v_direct_insert_blocked := true;
  end;
  begin
    delete from public.cases where id = v_case;
    raise exception 'member direct delete should fail';
  exception
    when insufficient_privilege or sqlstate '42501' then
      v_direct_delete_blocked := true;
  end;
  reset role;
  if not v_direct_insert_blocked or not v_direct_delete_blocked then
    raise exception 'direct cases DML bypass not blocked';
  end if;

  -- P0-C：apply_case_update 成功寫 audit
  select count(*) into v_audit_before
  from public.case_mutation_audit where case_id = v_case;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  select revision into v_revision from public.cases where id = v_case;
  v_result := public.apply_case_update(
    v_case,
    jsonb_build_object('title', '[P0-B] harden fixture updated'),
    v_revision
  );
  if coalesce(v_result->>'ok', '') <> 'true' then
    raise exception 'admin apply_case_update failed: %', v_result;
  end if;
  select count(*) into v_audit_after
  from public.case_mutation_audit
  where case_id = v_case and action = 'apply_case_update';
  if v_audit_after <= v_audit_before then
    raise exception 'apply_case_update did not write audit';
  end if;

  -- P0-C：admin_create_case / admin_delete_case
  v_result := public.admin_create_case(
    v_new_case,
    jsonb_build_object('title', '[P0-C] rpc create', 'status', 'draft', 'client', 'c')
  );
  if coalesce(v_result->>'ok', '') <> 'true' then
    raise exception 'admin_create_case failed: %', v_result;
  end if;
  v_result := public.admin_delete_case(v_new_case, 0);
  if coalesce(v_result->>'ok', '') <> 'true' then
    raise exception 'admin_delete_case failed: %', v_result;
  end if;
  reset role;

  raise notice 'p0b_acl_harden_check: draft assertions would pass in this transaction';
end $$;

rollback;
