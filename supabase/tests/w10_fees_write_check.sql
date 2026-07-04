-- W10 批次 3：fees 寫入僅 PM/執行長 — DB 層 RLS 驗證（可重複執行）
--
-- 目的：以譯者一與 PM 身分對 public.fees 嘗試 INSERT/UPDATE/DELETE，驗證：
--         - 譯者 INSERT fees          → DENY（WITH CHECK is_admin 失敗，擲出例外）
--         - 譯者 UPDATE 自己的 fee 單價 → DENY（USING is_admin 為否 → 0 rows）
--         - 譯者 UPDATE status（模擬開立）→ DENY（0 rows）
--         - 譯者 DELETE 自己的 fee      → DENY（0 rows）
--         - PM INSERT/UPDATE/DELETE     → ALLOW
--
-- 說明：RLS 下 INSERT 違反 WITH CHECK 會擲例外（42501），以 begin/exception 捕捉；
--       UPDATE/DELETE 的 USING 為否時不擲例外、僅影響 0 列，故以 ROW_COUNT 判定 DENY。
-- 執行方式：supabase MCP execute_sql 或 psql（需可 SET ROLE authenticated 的privileged 角色）。
-- 全程單一交易，fixture 以 [W10-FXW] 前綴標記並於結尾刪除，不留殘料。

do $$
declare
  v_t1 uuid; v_t1_name text; v_pm uuid;
  env_val text := 'test';
  fx uuid := gen_random_uuid();          -- 譯者一的非草稿 fee（PM 建立）
  fx_t1_try uuid := gen_random_uuid();   -- 譯者嘗試新增用固定 id（防殘料）
  fx_pm uuid := gen_random_uuid();       -- PM 新增用
  rc int;
  t1_ins text; t1_upd text; t1_status text; t1_del text;
  pm_upd text; pm_ins text; pm_del text;
begin
  select id, display_name into v_t1, v_t1_name from public.profiles where email = 'test-t1@test.local';
  select id into v_pm from public.profiles where email = 'test-pm@test.local';

  create temp table if not exists _w10w(chk text, got text, expected text, verdict text) on commit drop;
  delete from _w10w;

  insert into public.fees(id, title, assignee, status, task_items, client_info, notes,
    edit_logs, edit_log_phases, env, created_by, created_at, updated_at)
  values (fx, '[W10-FXW] 本人非草稿', v_t1_name, 'finalized',
    '[{"id":"t1","taskType":"翻譯","billingUnit":"字","unitCount":100,"unitPrice":2}]'::jsonb,
    '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, env_val, v_pm, now(), now());

  -- ── 譯者一 寫入嘗試（全部應 DENY）──
  perform set_config('request.jwt.claims', json_build_object('sub', v_t1::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

    begin
      insert into public.fees(id, title, assignee, status, env, created_by)
      values (fx_t1_try, '[W10-FXW] 譯者嘗試新增', v_t1_name, 'draft', env_val, v_t1);
      t1_ins := 'ALLOW';
    exception when others then
      t1_ins := 'DENY';
    end;

    update public.fees
      set task_items = '[{"id":"t1","taskType":"翻譯","billingUnit":"字","unitCount":100,"unitPrice":999}]'::jsonb
      where id = fx;
    get diagnostics rc = row_count;
    t1_upd := case when rc = 0 then 'DENY' else 'ALLOW' end;

    update public.fees set status = 'finalized' where id = fx;
    get diagnostics rc = row_count;
    t1_status := case when rc = 0 then 'DENY' else 'ALLOW' end;

    delete from public.fees where id = fx;
    get diagnostics rc = row_count;
    t1_del := case when rc = 0 then 'DENY' else 'ALLOW' end;

  reset role;
  perform set_config('request.jwt.claims', null, true);

  -- ── PM 寫入（全部應 ALLOW）──
  perform set_config('request.jwt.claims', json_build_object('sub', v_pm::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

    update public.fees set title = '[W10-FXW] PM 改標題' where id = fx;
    get diagnostics rc = row_count;
    pm_upd := case when rc = 1 then 'ALLOW' else 'DENY' end;

    begin
      insert into public.fees(id, title, assignee, status, env, created_by)
      values (fx_pm, '[W10-FXW] PM 新增', v_t1_name, 'draft', env_val, v_pm);
      pm_ins := 'ALLOW';
    exception when others then
      pm_ins := 'DENY';
    end;

    delete from public.fees where id = fx;
    get diagnostics rc = row_count;
    pm_del := case when rc = 1 then 'ALLOW' else 'DENY' end;

  reset role;
  perform set_config('request.jwt.claims', null, true);

  insert into _w10w values
    ('t1_insert_fees_denied',      t1_ins,    'DENY',  case when t1_ins='DENY' then 'PASS' else 'FAIL' end),
    ('t1_update_unitprice_denied', t1_upd,    'DENY',  case when t1_upd='DENY' then 'PASS' else 'FAIL' end),
    ('t1_update_status_denied',    t1_status, 'DENY',  case when t1_status='DENY' then 'PASS' else 'FAIL' end),
    ('t1_delete_fees_denied',      t1_del,    'DENY',  case when t1_del='DENY' then 'PASS' else 'FAIL' end),
    ('pm_update_allowed',          pm_upd,    'ALLOW', case when pm_upd='ALLOW' then 'PASS' else 'FAIL' end),
    ('pm_insert_allowed',          pm_ins,    'ALLOW', case when pm_ins='ALLOW' then 'PASS' else 'FAIL' end),
    ('pm_delete_allowed',          pm_del,    'ALLOW', case when pm_del='ALLOW' then 'PASS' else 'FAIL' end);

  -- cleanup（fx 已由 PM delete 移除；防禦性再刪一次）
  delete from public.fees where id in (fx, fx_t1_try, fx_pm);
end $$;

select * from _w10w order by chk;
