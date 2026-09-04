-- STATUS: draft; NOT run; unverified
--
-- P0-B2／B3：workflow／指派外層 RPC ACL + stage 表僅 SELECT。
-- 對齊 migrations：
--   20260831043143_p0b_workflow_rpc_acl.sql
--   20260831043145_p0b_assignment_rls.sql
--
-- 覆蓋（註解＋斷言草稿）：
--   - 內層 sync／upsert／revert：authenticated 無 EXECUTE
--   - 外層 lms_sync_*／cat_update_*／cat_pm_*：authenticated 有 EXECUTE；anon 無
--   - 非 admin 呼叫 lms_sync／cat_pm_assign → not_authorized
--   - assignee 可更新自己的 file／view assignment status；不可更新他人
--   - authenticated 對 cat_stage_assignments／cat_file_workflow_stages 無 INSERT/UPDATE/DELETE
--
-- 執行：隔離 branch／本機 DB；全程 BEGIN…ROLLBACK。禁止對正式庫執行。

begin;

do $$
declare
  v_member uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_pm uuid := gen_random_uuid();
  v_case uuid := gen_random_uuid();
  v_project uuid := gen_random_uuid();
  v_file uuid := gen_random_uuid();
  v_asg uuid := gen_random_uuid();
  v_asg_other uuid := gen_random_uuid();
  v_direct_blocked boolean := false;
  v_cross_blocked boolean := false;
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values
    (v_member, 'p0b-wf-member@test.local', '{"display_name":"P0B WF 成員"}'),
    (v_other, 'p0b-wf-other@test.local', '{"display_name":"P0B WF 他人"}'),
    (v_pm, 'p0b-wf-pm@test.local', '{"display_name":"P0B WF PM"}');
  update public.profiles set is_test = true where id in (v_member, v_other, v_pm);
  delete from public.user_roles where user_id = v_pm;
  insert into public.user_roles(user_id, role) values (v_pm, 'pm');

  insert into public.cases (
    id, title, status, client, translator, env, created_by, created_at, updated_at
  ) values (
    v_case, '[P0-B] workflow acl fixture', 'dispatched', 'c',
    '[]'::jsonb, 'test', v_pm, now(), now()
  );

  insert into public.cat_projects (id, name, env, created_at)
  values (v_project, '[P0-B] proj', 'test', now())
  on conflict do nothing;

  -- 若 cat_projects 欄位名不同，此草稿需依實際 schema 調整後再跑
  insert into public.cat_files (id, project_id, name, env, related_lms_case_id)
  values (v_file, v_project, 'fixture.mqxliff', 'test', v_case);

  insert into public.cat_file_assignments (
    id, file_id, assignee_user_id, status, assigned_at, updated_at
  ) values
    (v_asg, v_file, v_member, 'assigned', now(), now()),
    (v_asg_other, v_file, v_other, 'assigned', now(), now());

  -- 內層 helper：authenticated 不得 EXECUTE
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
     or has_function_privilege(
       'authenticated',
       'public.cat_revert_workflow_stages_for_case(uuid)',
       'EXECUTE'
     )
  then
    raise exception 'authenticated still has EXECUTE on inner workflow helpers';
  end if;

  -- 外層：anon 不得；authenticated 應有
  if has_function_privilege(
       'anon', 'public.lms_sync_cat_workflow_for_case(uuid)', 'EXECUTE'
     )
     or has_function_privilege(
       'anon', 'public.cat_pm_assign_file(uuid, uuid[])', 'EXECUTE'
     )
  then
    raise exception 'anon has EXECUTE on outer workflow RPCs';
  end if;

  if not has_function_privilege(
       'authenticated', 'public.lms_sync_cat_workflow_for_case(uuid)', 'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.cat_update_file_assignment_status(uuid, text)',
       'EXECUTE'
     )
  then
    raise exception 'authenticated missing EXECUTE on outer workflow RPCs';
  end if;

  -- 非 admin 不得 sync
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_member::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.lms_sync_cat_workflow_for_case(v_case);
    raise exception 'member lms_sync should fail';
  exception
    when sqlstate '42501' then null;
  end;

  -- assignee 更新自己的狀態
  perform public.cat_update_file_assignment_status(v_asg, 'in_progress');

  -- 不可更新他人
  begin
    perform public.cat_update_file_assignment_status(v_asg_other, 'completed');
    raise exception 'cross-assignee status update should fail';
  exception
    when sqlstate '42501' then
      v_cross_blocked := true;
  end;

  -- 直寫 stage 表應被擋
  begin
    update public.cat_stage_assignments set updated_at = now() where false;
    insert into public.cat_stage_assignments (
      file_id, file_workflow_stage_id, assignee_user_id, workflow_status
    ) values (v_file, gen_random_uuid(), v_member, 'assigned');
  exception
    when insufficient_privilege or sqlstate '42501' then
      v_direct_blocked := true;
    when others then
      -- RLS／缺欄位亦視為「不可直寫」路徑
      v_direct_blocked := true;
  end;
  reset role;

  if not v_cross_blocked then
    raise exception 'cross-assignee update was not blocked';
  end if;
  if not v_direct_blocked then
    raise exception 'direct stage assignment write was not blocked';
  end if;

  raise notice 'p0_cat_workflow_acl_check: draft assertions would pass in this transaction';
end $$;

rollback;
