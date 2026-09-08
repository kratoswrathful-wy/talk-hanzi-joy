-- STATUS: draft; NOT run; unverified
--
-- P0-B1：apply_case_update admin-only + expected revision + stale 防護。
-- 對齊 migration：20260831043141_p0b_apply_case_update_admin_only.sql
--
-- 覆蓋（註解＋斷言草稿）：
--   - PUBLIC／anon 不得 EXECUTE
--   - 舊 2 參數簽名不存在
--   - 非 admin → not_authorized（不洩漏存在）
--   - admin 錯 revision → stale_revision
--   - admin 同 env 成功 → ok + revision 遞增（trigger）
--   - patch 含 login_*／tools 等敏感鍵被剝除後仍可更新其他欄
--   - 未知 key → unknown_patch_key 且不突變（harden）
--   - 僅 updated_at → empty_patch_after_filter（harden）
--   - cases 基表 UPDATE policy 僅 admin 同 env；authenticated 無 UPDATE privilege（harden）
--
-- 執行：隔離 branch／本機 DB；全程 BEGIN…ROLLBACK。禁止對正式庫執行。
-- 另見：supabase/tests/p0b_acl_harden_check.sql

begin;

do $$
declare
  v_member uuid := gen_random_uuid();
  v_pm uuid := gen_random_uuid();
  v_case uuid := gen_random_uuid();
  v_revision bigint;
  v_result jsonb;
  v_anon_blocked boolean := false;
  v_member_blocked boolean := false;
  v_stale_blocked boolean := false;
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values
    (v_member, 'p0b-member@test.local', '{"display_name":"P0B 成員"}'),
    (v_pm, 'p0b-pm@test.local', '{"display_name":"P0B PM"}');
  update public.profiles set is_test = true where id in (v_member, v_pm);
  delete from public.user_roles where user_id = v_pm;
  insert into public.user_roles(user_id, role) values (v_pm, 'pm');

  insert into public.cases (
    id, title, status, client, translator, env, created_by, created_at, updated_at
  ) values (
    v_case, '[P0-B] apply_case_update fixture', 'dispatched', 'client',
    '[]'::jsonb, 'test', v_pm, now(), now()
  );

  select revision into v_revision from public.cases where id = v_case;

  -- 舊 2 參數簽名應已消失
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'apply_case_update'
      and pg_get_function_identity_arguments(p.oid) = 'uuid, jsonb'
  ) then
    raise exception 'legacy apply_case_update(uuid, jsonb) still exists';
  end if;

  if has_function_privilege(
       'public', 'public.apply_case_update(uuid, jsonb, bigint)', 'EXECUTE'
     )
     or has_function_privilege(
       'anon', 'public.apply_case_update(uuid, jsonb, bigint)', 'EXECUTE'
     )
  then
    raise exception 'PUBLIC/anon still has EXECUTE on apply_case_update';
  end if;

  -- anon 不得呼叫
  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'anon')::text,
    true
  );
  set local role anon;
  begin
    perform public.apply_case_update(v_case, '{"title":"x"}'::jsonb, v_revision);
  exception
    when insufficient_privilege or sqlstate '42501' then
      v_anon_blocked := true;
  end;
  reset role;
  if not v_anon_blocked then
    raise exception 'anon apply_case_update was not blocked';
  end if;

  -- 非 admin → not_authorized
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_member::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_result := public.apply_case_update(v_case, '{"title":"hacked"}'::jsonb, v_revision);
  reset role;
  if coalesce(v_result->>'ok', 'true') = 'true'
     or coalesce(v_result->>'error', '') <> 'not_authorized' then
    raise exception 'member apply_case_update not denied: %', v_result;
  end if;
  v_member_blocked := true;

  -- admin stale revision
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_pm::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  v_result := public.apply_case_update(
    v_case, '{"title":"stale"}'::jsonb, v_revision + 99
  );
  if coalesce(v_result->>'error', '') <> 'stale_revision' then
    raise exception 'expected stale_revision, got %', v_result;
  end if;
  v_stale_blocked := true;

  -- admin success（敏感鍵應被剝除、revision 遞增）
  v_result := public.apply_case_update(
    v_case,
    jsonb_build_object(
      'title', 'p0b-ok',
      'login_account', 'should-strip',
      'tools', '[]'::jsonb,
      'revision', 999
    ),
    v_revision
  );
  reset role;

  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'admin apply_case_update failed: %', v_result;
  end if;
  if (v_result->>'revision')::bigint <> v_revision + 1 then
    raise exception 'revision not bumped by trigger: %', v_result;
  end if;
  if exists (
    select 1 from public.cases c
    where c.id = v_case and c.login_account = 'should-strip'
  ) then
    raise exception 'login_account was written via apply_case_update';
  end if;
  if not exists (
    select 1 from public.cases c
    where c.id = v_case and c.title = 'p0b-ok'
  ) then
    raise exception 'title not updated';
  end if;

  if not (v_member_blocked and v_stale_blocked and v_anon_blocked) then
    raise exception 'incomplete ACL coverage';
  end if;

  raise notice 'p0_apply_case_update_admin_only_check: draft assertions would pass in this transaction';
end $$;

rollback;
