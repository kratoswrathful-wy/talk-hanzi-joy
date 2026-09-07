-- STATUS: draft for isolated DB only; NOT run against production; unverified
--
-- P0-A3（R1-E rewrite）：動作 RPC ACL／revision／併發承接。
-- 對齊 migrations：
--   20260830122356_p0a_case_action_rpcs.sql
--   20260830122353_p0a_case_participant_backfill_safe.sql（A2：unresolved-only）
--
-- 覆蓋（註解＋斷言）：
--   - anon / 未指派 / 跨 env / 跨案拒絕
--   - participant 僅本人允許範圍（完成需 active translator participant）
--   - stale revision（40001）
--   - PUBLIC EXECUTE 撤銷；authenticated 不得直接寫入 case_participants
--   - 公開詢案承接競態（同 revision 二次承接）
--   - A2：unresolved 候選不得變成有效 participant
--
-- 執行：隔離 branch／本機 DB，postgres 或 BYPASSRLS 角色；全程 BEGIN…ROLLBACK。

begin;

do $$
declare
  v_t1 uuid := gen_random_uuid();
  v_t2 uuid := gen_random_uuid();
  v_pm uuid := gen_random_uuid();
  v_case uuid := gen_random_uuid();
  v_case_other uuid := gen_random_uuid();
  v_case_prod uuid := gen_random_uuid();
  v_revision bigint;
  v_result jsonb;
  v_anon_blocked boolean := false;
  v_unassigned_blocked boolean := false;
  v_cross_env_blocked boolean := false;
  v_cross_case_blocked boolean := false;
  v_stale_blocked boolean := false;
  v_race_blocked boolean := false;
  v_direct_write_blocked boolean := false;
  v_participants_before int;
  v_participants_after int;
begin
  -- ── fixture users（auth.users → handle_new_user → profiles + member）──
  insert into auth.users(id, email, raw_user_meta_data)
  values
    (v_t1, 'p0-r1e-t1@test.local', '{"display_name":"P0 譯者一"}'),
    (v_t2, 'p0-r1e-t2@test.local', '{"display_name":"P0 譯者二"}'),
    (v_pm, 'p0-r1e-pm@test.local', '{"display_name":"P0 PM"}');
  update public.profiles
  set is_test = true
  where id in (v_t1, v_t2, v_pm);
  delete from public.user_roles where user_id = v_pm;
  insert into public.user_roles(user_id, role) values (v_pm, 'pm');

  insert into public.cases (
    id, title, status, client, translator, env, created_by, created_at, updated_at
  )
  values
    (
      v_case, '[P0-A R1-E] action rpc fixture', 'inquiry', 'masked-client',
      '[]'::jsonb, 'test', v_pm, now(), now()
    ),
    (
      v_case_other, '[P0-A R1-E] other case', 'dispatched', 'other',
      '[]'::jsonb, 'test', v_pm, now(), now()
    ),
    (
      v_case_prod, '[P0-A R1-E] prod env case', 'inquiry', 'prod-client',
      '[]'::jsonb, 'production', v_pm, now(), now()
    );

  -- 另一案先有 t2 participant（供跨案負向）
  insert into public.case_participants (
    case_id, user_id, role, source, created_by, updated_by
  ) values (
    v_case_other, v_t2, 'translator', 'pm_assign', v_pm, v_pm
  );

  select revision into v_revision from public.cases where id = v_case;

  -- ── PUBLIC / anon 不得 EXECUTE 動作 RPC ──
  if has_function_privilege(
       'public', 'public.accept_public_inquiry_case(uuid,bigint)', 'EXECUTE'
     )
     or has_function_privilege(
       'anon', 'public.accept_public_inquiry_case(uuid,bigint)', 'EXECUTE'
     )
     or has_function_privilege(
       'anon', 'public.complete_case_translation(uuid,bigint)', 'EXECUTE'
     )
  then
    raise exception 'PUBLIC/anon still has EXECUTE on action RPCs';
  end if;

  -- ── anon：不得呼叫承接 ──
  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'anon')::text,
    true
  );
  set local role anon;
  begin
    perform public.accept_public_inquiry_case(v_case, v_revision);
  exception
    when insufficient_privilege or sqlstate '42501' then
      v_anon_blocked := true;
  end;
  reset role;
  if not v_anon_blocked then
    raise exception 'anon accept_public_inquiry_case was not blocked';
  end if;

  -- ── 跨 env：test 身分看不見 production 案（case_unavailable）──
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.accept_public_inquiry_case(
      v_case_prod,
      (select revision from public.cases where id = v_case_prod)
    );
  exception
    when sqlstate 'P0002' or sqlstate '42501' then
      v_cross_env_blocked := true;
  end;
  reset role;
  if not v_cross_env_blocked then
    raise exception 'cross-env accept was not blocked';
  end if;

  -- ── 合法公開承接 ──
  set local role authenticated;
  v_result := public.accept_public_inquiry_case(v_case, v_revision);
  reset role;

  if v_result ->> 'status' <> 'dispatched'
    or (v_result ->> 'revision')::bigint <> v_revision + 1 then
    raise exception 'accept result invalid: %', v_result;
  end if;
  if not exists (
    select 1 from public.case_participants
    where case_id = v_case
      and user_id = v_t1
      and role = 'translator'
      and access_revoked_at is null
      and source = 'public_inquiry_accept'
  ) then
    raise exception 'accept did not create participant';
  end if;

  -- ── 公開詢案承接競態／stale：同 revision 再承接必須失敗 ──
  set local role authenticated;
  begin
    perform public.accept_public_inquiry_case(v_case, v_revision);
  exception
    when sqlstate 'P0002' or sqlstate '40001' then
      v_race_blocked := true;
      v_stale_blocked := true;
  end;
  reset role;
  if not v_race_blocked then
    raise exception 'public inquiry accept race/stale was not blocked';
  end if;

  -- ── 未指派：t2 非本案 participant，完成應拒 ──
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t2::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.complete_case_translation(v_case, v_revision + 1);
  exception
    when sqlstate 'P0002' or sqlstate '42501' then
      v_unassigned_blocked := true;
  end;
  reset role;
  if not v_unassigned_blocked then
    raise exception 'unassigned completion was not blocked';
  end if;

  -- ── 跨案：t1 對「另一案」完成應拒（僅 t2 是該案 participant）──
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t1::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.complete_case_translation(
      v_case_other,
      (select revision from public.cases where id = v_case_other)
    );
  exception
    when sqlstate 'P0002' or sqlstate '42501' then
      v_cross_case_blocked := true;
  end;
  reset role;
  if not v_cross_case_blocked then
    raise exception 'cross-case completion was not blocked';
  end if;

  -- ── stale revision：用過期 revision 完成 ──
  v_stale_blocked := false;
  set local role authenticated;
  begin
    perform public.complete_case_translation(v_case, v_revision);
  exception
    when sqlstate '40001' or sqlstate 'P0002' then
      v_stale_blocked := true;
  end;
  reset role;
  if not v_stale_blocked then
    raise exception 'stale revision completion was not blocked';
  end if;

  -- ── participant 本人合法完成 ──
  set local role authenticated;
  v_result := public.complete_case_translation(v_case, v_revision + 1);
  reset role;
  if v_result ->> 'status' <> 'task_completed'
    or (v_result ->> 'revision')::bigint <> v_revision + 2 then
    raise exception 'legal completion failed: %', v_result;
  end if;
  if (select work_status from public.case_participants
      where case_id = v_case and user_id = v_t1 and role = 'translator')
    <> 'completed' then
    raise exception 'participant work status not completed';
  end if;
  if (select count(*) from public.case_mutation_audit where case_id = v_case) < 2 then
    raise exception 'unexpected audit count';
  end if;

  -- ── authenticated 不得直接寫入 case_participants（繞過 RPC）──
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_t2::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    insert into public.case_participants (
      case_id, user_id, role, source, created_by, updated_by
    ) values (
      v_case, v_t2, 'translator', 'pm_assign', v_t2, v_t2
    );
  exception
    when insufficient_privilege or sqlstate '42501' then
      v_direct_write_blocked := true;
  end;
  reset role;
  if not v_direct_write_blocked then
    raise exception 'direct case_participants INSERT bypass was not blocked';
  end if;

  -- ── A2：unresolved-only；寫入 unresolved 不得產生有效 participant ──
  select count(*) into v_participants_before from public.case_participants;
  insert into public.case_participant_backfill_unresolved (
    case_id, env, candidate_user_id, candidate_role,
    source_kind, source_record_id, reason
  ) values (
    v_case_other, 'test', v_t1, 'translator',
    'cases_name_only', 'case.translator',
    'name_only_not_an_authorization_identity'
  )
  on conflict do nothing;
  select count(*) into v_participants_after from public.case_participants;
  if v_participants_after <> v_participants_before then
    raise exception 'A2 unresolved insert created participants';
  end if;
  if exists (
    select 1 from public.case_participants
    where case_id = v_case_other and user_id = v_t1
  ) then
    raise exception 'A2 produced effective participant for unresolved candidate';
  end if;

  raise notice 'p0_case_mutation_acl_check PASS';
end $$;

rollback;
