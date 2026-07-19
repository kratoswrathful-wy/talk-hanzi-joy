-- 工項 D：cases_visible 欄位遮罩 — DB 層驗證（可重複執行）
do $$
declare
  v_t1 uuid; v_pm uuid;
  env_val text := 'test';
  fx_id uuid := gen_random_uuid();
  t1_client text; t1_contact text; t1_kw text; t1_po text; t1_route text;
  t1_link jsonb; t1_ic jsonb; t1_title text;
  pm_client text; pm_ic jsonb;
  env_case_cnt int; view_cnt int;
begin
  select id into v_t1 from public.profiles where email = 'test-t1@test.local';
  select id into v_pm from public.profiles where email = 'test-pm@test.local';
  if v_t1 is null or v_pm is null then
    raise exception 'missing test profiles test-t1 / test-pm';
  end if;

  create temp table if not exists _casemask(chk text, got text, expected text, verdict text) on commit drop;
  delete from _casemask;

  insert into public.cases(
    id, title, status, client, contact, keyword, client_po_number, dispatch_route,
    client_case_link, internal_comments, env, created_by, created_at, updated_at
  ) values (
    fx_id, '[D-MASK] 遮罩測試案', 'inquiry',
    '機密客戶', '機密聯絡人', '機密關鍵字', 'PO-SECRET', '派案機密',
    jsonb_build_object('url', 'https://secret.example', 'label', '機密連結'),
    '[{"id":"ic1","author":"PM","content":"機密內部備註","createdAt":"2026-07-19T00:00:00Z"}]'::jsonb,
    env_val, v_pm, now(), now()
  );

  perform set_config('request.jwt.claims', json_build_object('sub', v_t1::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
    select client, contact, keyword, client_po_number, dispatch_route, client_case_link, internal_comments, title
      into t1_client, t1_contact, t1_kw, t1_po, t1_route, t1_link, t1_ic, t1_title
      from public.cases_visible where id = fx_id;
    select count(*) into view_cnt from public.cases_visible where env = env_val;
  reset role;
  perform set_config('request.jwt.claims', null, true);

  select count(*) into env_case_cnt from public.cases where env = env_val;

  perform set_config('request.jwt.claims', json_build_object('sub', v_pm::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
    select client, internal_comments into pm_client, pm_ic from public.cases_visible where id = fx_id;
  reset role;
  perform set_config('request.jwt.claims', null, true);

  insert into _casemask values
    ('t1_title', coalesce(t1_title, ''), '[D-MASK] 遮罩測試案', case when t1_title = '[D-MASK] 遮罩測試案' then 'PASS' else 'FAIL' end),
    ('t1_client', coalesce(t1_client, ''), '', case when coalesce(t1_client, '') = '' then 'PASS' else 'FAIL' end),
    ('t1_contact', coalesce(t1_contact, ''), '', case when coalesce(t1_contact, '') = '' then 'PASS' else 'FAIL' end),
    ('t1_keyword', coalesce(t1_kw, ''), '', case when coalesce(t1_kw, '') = '' then 'PASS' else 'FAIL' end),
    ('t1_po', coalesce(t1_po, ''), '', case when coalesce(t1_po, '') = '' then 'PASS' else 'FAIL' end),
    ('t1_route', coalesce(t1_route, ''), '', case when t1_route is null or t1_route = '' then 'PASS' else 'FAIL' end),
    ('t1_link_url', coalesce(t1_link->>'url', ''), '', case when coalesce(t1_link->>'url', '') = '' then 'PASS' else 'FAIL' end),
    ('t1_ic_empty', coalesce(jsonb_array_length(t1_ic), 0)::text, '0', case when coalesce(jsonb_array_length(t1_ic), 0) = 0 then 'PASS' else 'FAIL' end),
    ('row_level_all', view_cnt::text, env_case_cnt::text, case when view_cnt = env_case_cnt then 'PASS' else 'FAIL' end),
    ('pm_client_full', coalesce(pm_client, ''), '機密客戶', case when pm_client = '機密客戶' then 'PASS' else 'FAIL' end),
    ('pm_ic_full', coalesce(jsonb_array_length(pm_ic), 0)::text, '1', case when coalesce(jsonb_array_length(pm_ic), 0) = 1 then 'PASS' else 'FAIL' end);

  delete from public.cases where id = fx_id;

  raise notice '%', (select string_agg(chk || '=' || verdict, ', ' order by chk) from _casemask);
  if exists (select 1 from _casemask where verdict = 'FAIL') then
    raise exception 'w10_cases_visible_mask_check FAILED: %',
      (select string_agg(chk || ' got=' || got || ' expected=' || expected, '; ') from _casemask where verdict = 'FAIL');
  end if;
end $$;
