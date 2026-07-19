-- W10 C 退回：譯者不得直讀 public.fees 基表；讀取走 fees_visible（可重複執行）
--
-- 驗證：
--   1) 譯者 SELECT fees → 0 列（含本人非草稿 fixture）
--   2) 譯者 SELECT fees_visible 同 id → 1 列且 client 清空、internal_note 可見
--   3) PM SELECT fees 同 id → 1 列且 client 完整

do $$
declare
  v_t1 uuid; v_t1_name text; v_pm uuid;
  env_val text := 'test';
  fx_id uuid := gen_random_uuid();
  t1_fees int; t1_view int; t1_client text; t1_note text;
  pm_fees int; pm_client text;
begin
  select id, display_name into v_t1, v_t1_name from public.profiles where email = 'test-t1@test.local';
  select id into v_pm from public.profiles where email = 'test-pm@test.local';
  if v_t1 is null or v_pm is null then
    raise exception 'missing test profiles test-t1 / test-pm';
  end if;

  create temp table if not exists _w10deny(chk text, got text, expected text, verdict text) on commit drop;
  delete from _w10deny;

  insert into public.fees(id, title, assignee, status, internal_note, internal_note_url,
    task_items, client_info, notes, edit_logs, edit_log_phases, env, created_by, created_at, updated_at)
  values (
    fx_id, '[W10-DENY] 本人非草稿', v_t1_name, 'finalized',
    '[W10-DENY] 相關案件', '',
    '[{"id":"t1","taskType":"翻譯","billingUnit":"字","unitCount":1,"unitPrice":1}]'::jsonb,
    jsonb_build_object(
      'clientTaskItems', '[{"id":"c1","clientPrice":9.99,"billingUnit":"字"}]'::jsonb,
      'client','機密客戶','rateConfirmed', true,
      'sameCase', false, 'isFirstFee', false, 'notFirstFee', false,
      'contact','', 'clientCaseId','', 'eciKeywords','', 'clientPoNumber','',
      'clientCaseLink', jsonb_build_object('url','','label',''),
      'dispatchRoute','', 'reconciled', false, 'invoiced', false
    ),
    '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, env_val, v_pm, now(), now()
  );

  perform set_config('request.jwt.claims', json_build_object('sub', v_t1::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
    select count(*) into t1_fees from public.fees where id = fx_id;
    select count(*), max(client_info->>'client'), max(internal_note)
      into t1_view, t1_client, t1_note
      from public.fees_visible where id = fx_id;
  reset role;
  perform set_config('request.jwt.claims', null, true);

  perform set_config('request.jwt.claims', json_build_object('sub', v_pm::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
    select count(*), max(client_info->>'client') into pm_fees, pm_client from public.fees where id = fx_id;
  reset role;
  perform set_config('request.jwt.claims', null, true);

  insert into _w10deny values
    ('t1_fees_base_zero', t1_fees::text, '0', case when t1_fees = 0 then 'PASS' else 'FAIL' end),
    ('t1_view_one', t1_view::text, '1', case when t1_view = 1 then 'PASS' else 'FAIL' end),
    ('t1_view_client_empty', coalesce(t1_client,''), '', case when coalesce(t1_client,'') = '' then 'PASS' else 'FAIL' end),
    ('t1_view_note_ok', coalesce(t1_note,''), '[W10-DENY] 相關案件', case when coalesce(t1_note,'') = '[W10-DENY] 相關案件' then 'PASS' else 'FAIL' end),
    ('pm_fees_base_one', pm_fees::text, '1', case when pm_fees = 1 then 'PASS' else 'FAIL' end),
    ('pm_fees_client_full', coalesce(pm_client,''), '機密客戶', case when coalesce(pm_client,'') = '機密客戶' then 'PASS' else 'FAIL' end);

  delete from public.fees where id = fx_id;
end $$;

select * from _w10deny order by chk;
