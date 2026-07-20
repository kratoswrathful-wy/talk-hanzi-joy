-- 工項 2：譯者直寫 cases UPDATE 靜默 0 列；經 apply_case_update RPC 可改狀態／譯者欄
-- 可重複執行；全程交易內清理 [D-UPD] 測試列。
do $$
declare
  v_t1 uuid; v_pm uuid;
  env_val text := 'test';
  fx_id uuid := gen_random_uuid();
  direct_status text;
  rpc_status text;
  rpc_translator jsonb;
  rpc_client text;
  rpc_result jsonb;
  sensitive_result jsonb;
begin
  select id into v_t1 from public.profiles where email = 'test-t1@test.local';
  select id into v_pm from public.profiles where email = 'test-pm@test.local';
  if v_t1 is null or v_pm is null then
    raise exception 'missing test profiles test-t1 / test-pm';
  end if;

  create temp table if not exists _caseupd(chk text, got text, expected text, verdict text) on commit drop;
  delete from _caseupd;

  insert into public.cases(
    id, title, status, client, translator, env, created_by, created_at, updated_at
  ) values (
    fx_id, '[D-UPD] 譯者寫入測試案', 'inquiry',
    '機密客戶', '[]'::jsonb,
    env_val, v_pm, now(), now()
  );

  -- 1) 譯者直寫基表 UPDATE → 0 列（狀態不變）
  perform set_config('request.jwt.claims', json_build_object('sub', v_t1::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
    update public.cases set status = 'dispatched', updated_at = now() where id = fx_id;
  reset role;
  perform set_config('request.jwt.claims', null, true);
  select status into direct_status from public.cases where id = fx_id;
  insert into _caseupd values
    ('direct_update_noop', direct_status, 'inquiry',
     case when direct_status = 'inquiry' then 'PASS' else 'FAIL' end);

  -- 2) 譯者經 RPC：狀態＋譯者名單應落地
  perform set_config('request.jwt.claims', json_build_object('sub', v_t1::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
    rpc_result := public.apply_case_update(
      fx_id,
      jsonb_build_object(
        'status', 'dispatched',
        'translator', '["譯者一"]'::jsonb,
        'updated_at', now()
      )
    );
  reset role;
  perform set_config('request.jwt.claims', null, true);

  select status, translator, client
    into rpc_status, rpc_translator, rpc_client
  from public.cases where id = fx_id;

  insert into _caseupd values
    ('rpc_ok', coalesce(rpc_result->>'ok', 'false'), 'true',
     case when rpc_result->>'ok' = 'true' then 'PASS' else 'FAIL' end),
    ('rpc_status_dispatched', rpc_status, 'dispatched',
     case when rpc_status = 'dispatched' then 'PASS' else 'FAIL' end),
    ('rpc_translator_set', rpc_translator::text, '["譯者一"]',
     case when rpc_translator = '["譯者一"]'::jsonb then 'PASS' else 'FAIL' end),
    ('rpc_client_untouched', coalesce(rpc_client, ''), '機密客戶',
     case when coalesce(rpc_client, '') = '機密客戶' then 'PASS' else 'FAIL' end);

  -- 3) 譯者 RPC 夾帶敏感欄 → 剝除後 client 不變；可改 task_completed
  perform set_config('request.jwt.claims', json_build_object('sub', v_t1::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
    sensitive_result := public.apply_case_update(
      fx_id,
      jsonb_build_object(
        'status', 'task_completed',
        'client', '駭客竄改',
        'updated_at', now()
      )
    );
  reset role;
  perform set_config('request.jwt.claims', null, true);

  select status, client into rpc_status, rpc_client from public.cases where id = fx_id;
  insert into _caseupd values
    ('rpc_task_completed', rpc_status, 'task_completed',
     case when rpc_status = 'task_completed' then 'PASS' else 'FAIL' end),
    ('rpc_sensitive_stripped', coalesce(rpc_client, ''), '機密客戶',
     case when coalesce(rpc_client, '') = '機密客戶' then 'PASS' else 'FAIL' end),
    ('rpc_sensitive_ok', coalesce(sensitive_result->>'ok', 'false'), 'true',
     case when sensitive_result->>'ok' = 'true' then 'PASS' else 'FAIL' end);

  delete from public.cases where id = fx_id;

  raise notice '%', (select string_agg(chk || '=' || verdict, ', ' order by chk) from _caseupd);
  if exists (select 1 from _caseupd where verdict = 'FAIL') then
    raise exception 'w10_cases_translator_update_rpc_check FAILED: %',
      (select string_agg(chk || ' got=' || got || ' expected=' || expected, '; ')
       from _caseupd where verdict = 'FAIL');
  end if;
end $$;
