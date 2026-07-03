-- W10 批次 2：fees_visible 欄位遮罩 — DB 層驗證（可重複執行）
--
-- 目的：建立 env=test fixture（assignee=譯者一 的非草稿／草稿費用單＋本人請款單），
--       以譯者一與 PM 身分查 public.fees_visible，驗證：
--         - 譯者讀自己非草稿 fees ≥ 1（非 trivial）；讀自己草稿 = 0
--         - 遮罩：client_info 客戶/報價清空（僅留 rateConfirmed）、internal_note 空、
--                 edit_logs 只留白名單欄位（無營收/客戶條目、無機密字串）、task_items 原值完整
--         - PM 查同列：client_info/internal_note/edit_logs 全欄位完整（CASE 另一分支）
--         - 欄位漂移：fees 有而 fees_visible 沒有的欄位 → WARN 清單（維護防漂移）
--
-- 執行方式：supabase MCP execute_sql 或 psql（需 BYPASSRLS 且可 SET ROLE authenticated 的角色）。
-- 全程單一交易，fixture 以 [W10-FX] 前綴標記並於結尾刪除，不留殘料。

do $$
declare
  v_t1 uuid; v_t1_name text; v_pm uuid;
  env_val text := 'test';
  fx_nondraft uuid := gen_random_uuid();
  fx_draft uuid := gen_random_uuid();
  fx_inv uuid := gen_random_uuid();
  s_own_nondraft int; s_draft_visible int; s_own_inv int;
  s_ci jsonb; s_internal text; s_editlogs jsonb; s_task jsonb;
  pm_ci jsonb; pm_internal text; pm_editlogs jsonb;
  drift text;
begin
  select id, display_name into v_t1, v_t1_name from public.profiles where email = 'test-t1@test.local';
  select id into v_pm from public.profiles where email = 'test-pm@test.local';

  create temp table if not exists _w10m(chk text, got text, expected text, verdict text) on commit drop;
  delete from _w10m;

  -- ── fixture（superuser 建立）──
  insert into public.fees(id, title, assignee, status, internal_note, internal_note_url,
    task_items, client_info, notes, edit_logs, edit_log_phases, env, created_by, created_at, updated_at)
  values (
    fx_nondraft, '[W10-FX] 非草稿本人', v_t1_name, 'finalized',
    '機密內部備註', 'https://internal.example/secret',
    '[{"id":"t1","taskType":"翻譯","billingUnit":"字","unitCount":100,"unitPrice":2}]'::jsonb,
    jsonb_build_object(
      'clientTaskItems', '[{"id":"c1","taskType":"翻譯","billingUnit":"字","unitCount":100,"clientPrice":9.99}]'::jsonb,
      'client','機密客戶','contact','機密聯絡人','clientPoNumber','PO-SECRET','dispatchRoute','機密派案',
      'reconciled', true, 'rateConfirmed', true, 'invoiced', true, 'sameCase', false,
      'isFirstFee', false, 'notFirstFee', false, 'clientCaseId','', 'eciKeywords','',
      'clientCaseLink', jsonb_build_object('url','','label','')
    ),
    '[{"id":"n1","author":"PM","text":"費用相關備註","createdAt":"2026-01-01T00:00:00Z"}]'::jsonb,
    '[{"id":"e1","field":"單價","fieldKey":"單價","oldValue":"1","newValue":"2","author":"PM","timestamp":"2026-01-01T00:00:00Z"},
      {"id":"e2","field":"營收總額","fieldKey":"營收","oldValue":"100","newValue":"999","author":"PM","timestamp":"2026-01-01T00:00:00Z"},
      {"id":"e3","field":"客戶","fieldKey":"客戶","oldValue":"A","newValue":"機密客戶","author":"PM","timestamp":"2026-01-01T00:00:00Z"}]'::jsonb,
    '{}'::jsonb, env_val, v_pm, now(), now()
  );
  insert into public.fees(id, title, assignee, status, internal_note, internal_note_url,
    task_items, client_info, notes, edit_logs, edit_log_phases, env, created_by, created_at, updated_at)
  values (fx_draft, '[W10-FX] 草稿本人', v_t1_name, 'draft', '', '',
    '[]'::jsonb, null, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, env_val, v_pm, now(), now());
  insert into public.invoices(id, title, translator, status, note, env, created_by)
  values (fx_inv, '[W10-FX] 本人請款', v_t1_name, 'pending', '', env_val, v_t1);

  -- ── 譯者一查 fees_visible ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_t1::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
    select count(*) into s_own_nondraft from public.fees_visible where assignee = v_t1_name and status <> 'draft';
    select count(*) into s_draft_visible from public.fees_visible where id = fx_draft;
    select count(*) into s_own_inv from public.invoices where translator = v_t1_name;
    select client_info, internal_note, edit_logs, task_items
      into s_ci, s_internal, s_editlogs, s_task
      from public.fees_visible where id = fx_nondraft;
  reset role;
  perform set_config('request.jwt.claims', null, true);

  -- ── PM 查同一列 ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_pm::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
    select client_info, internal_note, edit_logs
      into pm_ci, pm_internal, pm_editlogs
      from public.fees_visible where id = fx_nondraft;
  reset role;
  perform set_config('request.jwt.claims', null, true);

  insert into _w10m values
    ('t1_own_nondraft_ge1',      s_own_nondraft::text, '>=1', case when s_own_nondraft>=1 then 'PASS' else 'FAIL' end),
    ('t1_own_draft_hidden',      s_draft_visible::text, '0',  case when s_draft_visible=0 then 'PASS' else 'FAIL' end),
    ('t1_own_invoice_ge1',       s_own_inv::text, '>=1',      case when s_own_inv>=1 then 'PASS' else 'FAIL' end),
    ('t1_ci_client_empty',       coalesce(s_ci->>'client',''), '', case when coalesce(s_ci->>'client','')='' then 'PASS' else 'FAIL' end),
    ('t1_ci_clientTaskItems_empty', coalesce((s_ci->'clientTaskItems')::text,'[]'), '[]', case when coalesce((s_ci->'clientTaskItems')::text,'[]')='[]' then 'PASS' else 'FAIL' end),
    ('t1_ci_rateConfirmed_kept', coalesce(s_ci->>'rateConfirmed',''), 'true', case when coalesce(s_ci->>'rateConfirmed','')='true' then 'PASS' else 'FAIL' end),
    ('t1_internal_note_masked',  coalesce(s_internal,''), '', case when coalesce(s_internal,'')='' then 'PASS' else 'FAIL' end),
    ('t1_editlogs_count_1',      jsonb_array_length(coalesce(s_editlogs,'[]'::jsonb))::text, '1', case when jsonb_array_length(coalesce(s_editlogs,'[]'::jsonb))=1 then 'PASS' else 'FAIL' end),
    ('t1_editlogs_no_secret',    case when coalesce(s_editlogs::text,'') ~ '(營收|客戶|999|機密)' then 'LEAK' else 'clean' end, 'clean', case when coalesce(s_editlogs::text,'') ~ '(營收|客戶|999|機密)' then 'FAIL' else 'PASS' end),
    ('t1_task_items_intact',     jsonb_array_length(coalesce(s_task,'[]'::jsonb))::text, '1', case when jsonb_array_length(coalesce(s_task,'[]'::jsonb))=1 then 'PASS' else 'FAIL' end),
    ('pm_ci_client_full',        coalesce(pm_ci->>'client',''), '機密客戶', case when coalesce(pm_ci->>'client','')='機密客戶' then 'PASS' else 'FAIL' end),
    ('pm_internal_note_full',    coalesce(pm_internal,''), '機密內部備註', case when coalesce(pm_internal,'')='機密內部備註' then 'PASS' else 'FAIL' end),
    ('pm_editlogs_count_3',      jsonb_array_length(coalesce(pm_editlogs,'[]'::jsonb))::text, '3', case when jsonb_array_length(coalesce(pm_editlogs,'[]'::jsonb))=3 then 'PASS' else 'FAIL' end);

  -- ── 欄位漂移檢查 ──
  select string_agg(column_name, ', ') into drift
  from (
    select column_name from information_schema.columns where table_schema='public' and table_name='fees'
    except
    select column_name from information_schema.columns where table_schema='public' and table_name='fees_visible'
  ) d;
  insert into _w10m values ('column_drift_fees_to_view', coalesce(drift,'(none)'), '(none)', case when drift is null then 'PASS' else 'WARN' end);

  delete from public.fees where id in (fx_nondraft, fx_draft);
  delete from public.invoices where id = fx_inv;
end $$;

select * from _w10m order by chk;
