-- 工項 D：譯者不得直讀 public.cases 基表；讀取走 cases_visible（可重複執行）
do $$
declare
  v_t1 uuid; v_pm uuid;
  env_val text := 'test';
  fx_id uuid := gen_random_uuid();
  t1_base int; t1_view int; t1_client text; t1_kw text;
  pm_base int; pm_client text;
begin
  select id into v_t1 from public.profiles where email = 'test-t1@test.local';
  select id into v_pm from public.profiles where email = 'test-pm@test.local';
  if v_t1 is null or v_pm is null then
    raise exception 'missing test profiles test-t1 / test-pm';
  end if;

  create temp table if not exists _casedeny(chk text, got text, expected text, verdict text) on commit drop;
  delete from _casedeny;

  insert into public.cases(
    id, title, status, client, contact, keyword, client_po_number, dispatch_route,
    client_case_link, internal_comments, env, created_by, created_at, updated_at
  ) values (
    fx_id, '[D-DENY] 遮罩測試案', 'inquiry',
    '機密客戶', '機密聯絡人', '機密關鍵字', 'PO-SECRET', '派案機密',
    jsonb_build_object('url', 'https://secret.example', 'label', '機密連結'),
    '[{"id":"ic1","author":"PM","content":"機密內部備註","createdAt":"2026-07-19T00:00:00Z"}]'::jsonb,
    env_val, v_pm, now(), now()
  );

  perform set_config('request.jwt.claims', json_build_object('sub', v_t1::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
    select count(*) into t1_base from public.cases where id = fx_id;
    select count(*), max(client), max(keyword)
      into t1_view, t1_client, t1_kw
      from public.cases_visible where id = fx_id;
  reset role;
  perform set_config('request.jwt.claims', null, true);

  perform set_config('request.jwt.claims', json_build_object('sub', v_pm::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
    select count(*), max(client) into pm_base, pm_client from public.cases where id = fx_id;
  reset role;
  perform set_config('request.jwt.claims', null, true);

  insert into _casedeny values
    ('t1_base_0', t1_base::text, '0', case when t1_base = 0 then 'PASS' else 'FAIL' end),
    ('t1_view_1', t1_view::text, '1', case when t1_view = 1 then 'PASS' else 'FAIL' end),
    ('t1_client_empty', coalesce(t1_client, ''), '', case when coalesce(t1_client, '') = '' then 'PASS' else 'FAIL' end),
    ('t1_keyword_empty', coalesce(t1_kw, ''), '', case when coalesce(t1_kw, '') = '' then 'PASS' else 'FAIL' end),
    ('pm_base_1', pm_base::text, '1', case when pm_base = 1 then 'PASS' else 'FAIL' end),
    ('pm_client_full', coalesce(pm_client, ''), '機密客戶', case when coalesce(pm_client, '') = '機密客戶' then 'PASS' else 'FAIL' end);

  delete from public.cases where id = fx_id;

  raise notice '%', (select string_agg(chk || '=' || verdict, ', ' order by chk) from _casedeny);
  if exists (select 1 from _casedeny where verdict = 'FAIL') then
    raise exception 'w10_cases_base_select_deny_check FAILED: %',
      (select string_agg(chk || ' got=' || got || ' expected=' || expected, '; ') from _casedeny where verdict = 'FAIL');
  end if;
end $$;
