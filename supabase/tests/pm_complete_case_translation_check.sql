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

  -- 派出閘門：無 active translator 不得改 dispatched（強制立即檢查 deferred trigger）
  v_blocked := false;
  begin
    update public.cases set status = 'dispatched' where id = v_case_empty;
    set constraints all immediate;
    raise exception 'dispatch_guard_should_have_blocked';
  exception
    when sqlstate '22023' then
      v_blocked := true;
      set constraints all deferred;
    when others then
      set constraints all deferred;
      raise;
  end;
  set constraints all deferred;
  if not v_blocked then
    raise exception 'dispatch without translator participant must be blocked';
  end if;
  -- 回復 inquiry 以便後續合法承接測
  update public.cases set status = 'inquiry' where id = v_case_empty and status = 'dispatched';

  -- 同交易：先 UPDATE dispatched 再 INSERT participant → 交易結束應成功
  begin
    update public.cases set status = 'dispatched' where id = v_case_empty;
    insert into public.case_participants(
      case_id, user_id, role, work_status, source, created_by, updated_by
    ) values (
      v_case_empty, v_t1, 'translator', 'active', 'pm_assign', v_pm, v_pm
    );
    set constraints all immediate;
    set constraints all deferred;
  exception
    when others then
      set constraints all deferred;
      raise exception 'same-txn dispatch+participant must succeed: %', sqlerrm;
  end;
  set constraints all deferred;

  -- 真正指派譯者本人完成成功
  insert into public.cases (
    id, title, status, client, translator, env, created_by, multi_collab
  ) values (
    gen_random_uuid(), '[ISO] translator self complete', 'dispatched', 'c',
    jsonb_build_array('T1'), 'test', v_pm, false
  ) returning id into v_case_empty;
  insert into public.case_participants(
    case_id, user_id, role, work_status, source, created_by, updated_by
  ) values (
    v_case_empty, v_t1, 'translator', 'active', 'pm_assign', v_pm, v_pm
  );
  select revision into v_revision from public.cases where id = v_case_empty;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_result := public.complete_case_translation(v_case_empty, v_revision);
  reset role;
  if v_result->>'status' <> 'task_completed' then
    raise exception 'translator self complete failed: %', v_result;
  end if;

  -- 跨環境拒絕：假 env 列不可被當前 env 完成
  insert into public.cases (
    id, title, status, client, translator, env, created_by, multi_collab
  ) values (
    gen_random_uuid(), '[ISO] cross env', 'dispatched', 'c',
    jsonb_build_array('T1'), 'production', v_pm, false
  ) returning id into v_case_empty;
  insert into public.case_participants(
    case_id, user_id, role, work_status, source, created_by, updated_by
  ) values (
    v_case_empty, v_t1, 'translator', 'active', 'pm_assign', v_pm, v_pm
  );
  select revision into v_revision from public.cases where id = v_case_empty;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_blocked := false;
  begin
    perform public.pm_complete_case_translation(v_case_empty, v_revision);
  exception
    when sqlstate 'P0002' or sqlstate '42501' then
      v_blocked := true;
  end;
  reset role;
  if not v_blocked then
    raise exception 'cross-env pm_complete must be blocked';
  end if;
  if (select status from public.cases where id = v_case_empty) <> 'dispatched' then
    raise exception 'cross-env reject must not mutate status';
  end if;

  -- 公開承接：inquiry → accept（內部先 update 再 insert）須成功
  insert into public.cases (
    id, title, status, client, translator, env, created_by, multi_collab
  ) values (
    gen_random_uuid(), '[ISO] public accept', 'inquiry', 'c',
    '[]'::jsonb, 'test', v_pm, false
  )
  returning id into v_case_empty;
  -- reuse v_case_empty as accept target (previous was already dispatched)
  -- 上面 returning 覆寫；改用新變數較清楚 — 此處以既有 id 變數承接
  select revision into v_revision from public.cases where id = v_case_empty;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t2::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_result := public.accept_public_inquiry_case(v_case_empty, v_revision);
  reset role;
  if v_result->>'status' <> 'dispatched' then
    raise exception 'accept_public_inquiry_case failed: %', v_result;
  end if;
  select count(*) into v_tr_count
  from public.case_participants
  where case_id = v_case_empty and user_id = v_t2 and role = 'translator'
    and access_revoked_at is null and work_status = 'active';
  if v_tr_count <> 1 then
    raise exception 'accept must create active translator participant';
  end if;

  -- 管理者同次指派＋派出（可信 UUID）
  insert into public.cases (
    id, title, status, client, translator, env, created_by, multi_collab
  ) values (
    gen_random_uuid(), '[ISO] pm assign+dispatch', 'inquiry', 'c',
    '[]'::jsonb, 'test', v_pm, false
  ) returning id into v_case_keep;
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
      'translator', jsonb_build_array('T1'),
      'translator_user_id', v_t1::text,
      'status', 'dispatched'
    )
  );
  reset role;
  if coalesce(v_result->>'ok', 'false') <> 'true' then
    raise exception 'pm assign+dispatch failed: %', v_result;
  end if;

  -- stale：仍為 dispatched 的案上用錯 revision（不可用「已完成後再按」代替）
  insert into public.cases (
    id, title, status, client, translator, env, created_by, multi_collab
  ) values (
    gen_random_uuid(), '[ISO] stale while dispatched', 'dispatched', 'c',
    jsonb_build_array('T1'), 'test', v_pm, false
  ) returning id into v_case_empty;
  insert into public.case_participants(
    case_id, user_id, role, work_status, source, created_by, updated_by
  ) values (
    v_case_empty, v_t1, 'translator', 'active', 'pm_assign', v_pm, v_pm
  );
  select revision into v_revision from public.cases where id = v_case_empty;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_blocked := false;
  begin
    perform public.complete_case_translation(v_case_empty, v_revision + 100);
  exception
    when sqlstate '40001' then
      v_blocked := true;
  end;
  reset role;
  if not v_blocked then
    raise exception 'stale revision on still-dispatched case must be case_revision_conflict';
  end if;
  if (select status from public.cases where id = v_case_empty) <> 'dispatched' then
    raise exception 'stale complete must not change case status';
  end if;

  -- 無譯者 participant 時 PM 代完成成功且不造假 participant
  insert into public.cases (
    id, title, status, client, translator, env, created_by, multi_collab
  ) values (
    gen_random_uuid(), '[ISO] pm complete no translator', 'dispatched', 'c',
    jsonb_build_array('Ghost'), 'test', v_pm, false
  ) returning id into v_case_empty;
  select revision into v_revision from public.cases where id = v_case_empty;
  select count(*) into v_audit_before from public.case_participants where case_id = v_case_empty;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_result := public.pm_complete_case_translation(v_case_empty, v_revision);
  reset role;
  if v_result->>'status' <> 'task_completed' then
    raise exception 'pm_complete without translator participant failed: %', v_result;
  end if;
  if coalesce((v_result->>'completedTranslatorParticipants')::int, -1) <> 0 then
    raise exception 'pm_complete must not invent translator completions';
  end if;
  select count(*) into v_audit_after from public.case_participants where case_id = v_case_empty;
  if v_audit_after <> v_audit_before then
    raise exception 'pm_complete must not insert fake participants';
  end if;

  -- 僅改 reviewer：translator participant 仍在
  select revision into v_revision from public.cases where id = (
    select id from public.cases where title = '[ISO] keep translator' limit 1
  );
  -- 上面 v_case_keep 已被覆寫；改查標題
  select id, revision into v_case_keep, v_revision
  from public.cases where title = '[ISO] keep translator' limit 1;
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
