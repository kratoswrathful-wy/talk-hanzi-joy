-- STATUS: draft for isolated DB only; NOT run against production.
-- pm_complete_case_translation + dispatch trigger ACL.
-- 執行：隔離 branch／本機 DB；BEGIN…ROLLBACK。

begin;

do $$
declare
  v_t1 uuid := gen_random_uuid();
  v_t2 uuid := gen_random_uuid();
  v_pm uuid := gen_random_uuid();
  v_rv uuid := gen_random_uuid();
  v_case uuid := gen_random_uuid();
  v_case_empty uuid := gen_random_uuid();
  v_case_keep uuid := gen_random_uuid();
  v_revision bigint;
  v_result jsonb;
  v_blocked boolean;
  v_audit_actor uuid;
  v_tr_status text;
  v_audit_before bigint;
  v_audit_after bigint;
  v_tr_count int;
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values
    (v_t1, 'pm-complete-t1@test.local', '{"display_name":"T1"}'),
    (v_t2, 'pm-complete-t2@test.local', '{"display_name":"T2"}'),
    (v_pm, 'pm-complete-pm@test.local', '{"display_name":"PM"}'),
    (v_rv, 'pm-complete-rv@test.local', '{"display_name":"RV"}');
  update public.profiles set is_test = true, display_name = 'T1' where id = v_t1;
  update public.profiles set is_test = true, display_name = 'T2' where id = v_t2;
  update public.profiles set is_test = true, display_name = 'PM' where id = v_pm;
  update public.profiles set is_test = true, display_name = 'RV' where id = v_rv;
  delete from public.user_roles where user_id in (v_pm, v_t1, v_t2, v_rv);
  insert into public.user_roles(user_id, role) values
    (v_pm, 'pm'),
    (v_t1, 'member'),
    (v_t2, 'member'),
    (v_rv, 'member');

  insert into public.cases (
    id, title, status, client, translator, env, created_by, multi_collab
  ) values
    (v_case, '[ISO] pm complete ok', 'dispatched', 'c',
      jsonb_build_array('T1'), 'test', v_pm, false),
    (v_case_empty, '[ISO] dispatch guard', 'inquiry', 'c',
      jsonb_build_array('T1'), 'test', v_pm, false),
    (v_case_keep, '[ISO] keep translator', 'inquiry', 'c',
      jsonb_build_array('T1'), 'test', v_pm, false);

  insert into public.case_participants(
    case_id, user_id, role, work_status, source, created_by, updated_by
  ) values
    (v_case, v_t1, 'translator', 'active', 'pm_assign', v_pm, v_pm),
    (v_case_keep, v_t1, 'translator', 'active', 'pm_assign', v_pm, v_pm);

  select revision into v_revision from public.cases where id = v_case;

  -- 非管理者不得代完成
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t2::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_blocked := false;
  begin
    perform public.pm_complete_case_translation(v_case, v_revision);
  exception
    when sqlstate '42501' or sqlstate 'P0002' then
      v_blocked := true;
  end;
  reset role;
  if not v_blocked then
    raise exception 'non-admin pm_complete must be blocked';
  end if;

  -- 非指派譯者不得完成
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t2::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_blocked := false;
  begin
    perform public.complete_case_translation(v_case, v_revision);
  exception
    when sqlstate 'P0002' or sqlstate '42501' then
      v_blocked := true;
  end;
  reset role;
  if not v_blocked then
    raise exception 'unassigned translator complete must be blocked';
  end if;

  -- 管理者代完成：audit actor = PM；translator → completed
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_result := public.pm_complete_case_translation(v_case, v_revision);
  reset role;
  if v_result->>'status' <> 'task_completed' then
    raise exception 'pm_complete failed: %', v_result;
  end if;
  select actor_user_id into v_audit_actor
  from public.case_mutation_audit
  where case_id = v_case and action = 'pm_complete_case_translation'
  order by created_at desc
  limit 1;
  if v_audit_actor is distinct from v_pm then
    raise exception 'audit actor must be manager, got %', v_audit_actor;
  end if;
  select work_status into v_tr_status
  from public.case_participants
  where case_id = v_case and user_id = v_t1 and role = 'translator';
  if v_tr_status <> 'completed' then
    raise exception 'translator work_status not completed after pm_complete';
  end if;

  -- stale／重複：拒且 audit 不增
  select count(*) into v_audit_before from public.case_mutation_audit where case_id = v_case;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_blocked := false;
  begin
    perform public.pm_complete_case_translation(v_case, v_revision);
  exception
    when sqlstate '40001' or sqlstate 'P0002' then
      v_blocked := true;
  end;
  reset role;
  if not v_blocked then
    raise exception 'stale/duplicate pm_complete must be blocked';
  end if;
  select count(*) into v_audit_after from public.case_mutation_audit where case_id = v_case;
  if v_audit_after <> v_audit_before then
    raise exception 'failed pm_complete must not write audit';
  end if;

  -- 派出閘門：無 active translator 不得改 dispatched
  v_blocked := false;
  begin
    update public.cases set status = 'dispatched' where id = v_case_empty;
  exception
    when sqlstate '22023' then
      v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'dispatch without translator participant must be blocked';
  end if;

  -- 僅改 reviewer：translator participant 仍在
  select revision into v_revision from public.cases where id = v_case_keep;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_result := public.pm_update_case_assignments(
    v_case_keep,
    v_revision,
    jsonb_build_object(
      'reviewer', 'RV',
      'reviewer_user_id', v_rv::text
    )
  );
  reset role;
  if coalesce(v_result->>'ok', 'false') <> 'true' then
    raise exception 'reviewer-only pm_update failed: %', v_result;
  end if;
  select count(*) into v_tr_count
  from public.case_participants
  where case_id = v_case_keep
    and user_id = v_t1
    and role = 'translator'
    and access_revoked_at is null;
  if v_tr_count <> 1 then
    raise exception 'reviewer-only patch must keep translator participant';
  end if;
end;
$$;

rollback;
