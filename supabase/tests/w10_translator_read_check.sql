-- W10 批次 1：譯者讀取列級收緊 — DB 層驗證（可重複執行）
--
-- 目的：不經 UI，直接在資料庫層模擬「譯者一（測試）」與「PM（測試）」身分，
--       驗證 invoices / invoice_fees / fees 三張表列級 SELECT 政策收緊後行為：
--         - 譯者讀他人 invoices/fees/invoice_fees          → 0 列
--         - 譯者讀自己「草稿」fees                          → 0 列
--         - 譯者讀自己非草稿 fees                           → 等於實際本人非草稿筆數
--         - 譯者讀 invoices / invoice_fees                  → 僅本人所屬
--         - PM 讀全部                                       → 等於該 env 總筆數
--         - 寫入面（W5 invoices_insert）不得回歸            → 本人 ALLOW、他人 DENY
--
-- 注意：欄位級遮罩（營收/客戶欄位/內部備註為 NULL、變更紀錄過濾）屬 W10 批次 2，
--       本腳本僅驗「列級」，遮罩斷言待批次 2 補上。
--
-- 執行方式：supabase MCP execute_sql 或 psql（需具 BYPASSRLS 且可 SET ROLE authenticated 的角色）。
-- 全程單一交易，測試列以 [W10-SIM] 前綴標記並於結尾刪除。
-- 前置：profiles 內 test-t1@test.local（member）、test-t2@test.local（member）、test-pm@test.local（pm）皆存在且 is_test=true。

do $$
declare
  v_t1 uuid; v_t1_name text; v_t2_name text; v_pm uuid;
  env_val text := 'test';
  gt_inv_t1 int; gt_inv_total int;
  gt_fee_t1_nondraft int; gt_fee_total int;
  gt_if_t1 int;
  s_inv_total int; s_inv_others int;
  s_fee_total int; s_fee_others int; s_fee_own_draft int; s_fee_own_nondraft int;
  s_if_total int; s_if_others int;
  pm_inv_total int; pm_fee_total int;
begin
  select id, display_name into v_t1, v_t1_name from public.profiles where email = 'test-t1@test.local';
  select display_name into v_t2_name from public.profiles where email = 'test-t2@test.local';
  select id into v_pm from public.profiles where email = 'test-pm@test.local';

  -- 基準真相（superuser）
  select count(*) into gt_inv_total from public.invoices where env = env_val;
  select count(*) into gt_inv_t1 from public.invoices where env = env_val and translator = v_t1_name;
  select count(*) into gt_fee_total from public.fees where env = env_val;
  select count(*) into gt_fee_t1_nondraft from public.fees where env = env_val and assignee = v_t1_name and status <> 'draft';
  select count(*) into gt_if_t1 from public.invoice_fees if2
    join public.invoices i on i.id = if2.invoice_id
    where if2.env = env_val and i.translator = v_t1_name;

  create temp table if not exists _w10(chk text, got int, expected int, verdict text) on commit drop;
  delete from _w10;

  -- ===== 模擬譯者一（member）=====
  perform set_config('request.jwt.claims', json_build_object('sub', v_t1::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
    select count(*) into s_inv_total from public.invoices;
    select count(*) into s_inv_others from public.invoices where translator is distinct from v_t1_name;
    select count(*) into s_fee_total from public.fees;
    select count(*) into s_fee_others from public.fees where assignee is distinct from v_t1_name;
    select count(*) into s_fee_own_draft from public.fees where assignee = v_t1_name and status = 'draft';
    select count(*) into s_fee_own_nondraft from public.fees where assignee = v_t1_name and status <> 'draft';
    select count(*) into s_if_total from public.invoice_fees;
    select count(*) into s_if_others from public.invoice_fees if2
      where not exists (
        select 1 from public.invoices i where i.id = if2.invoice_id and i.translator = v_t1_name
      );
  reset role;
  perform set_config('request.jwt.claims', null, true);

  -- ===== 模擬 PM（admin）=====
  perform set_config('request.jwt.claims', json_build_object('sub', v_pm::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
    select count(*) into pm_inv_total from public.invoices;
    select count(*) into pm_fee_total from public.fees;
  reset role;
  perform set_config('request.jwt.claims', null, true);

  insert into _w10 values
    ('t1_invoices_others',        s_inv_others,      0,                  case when s_inv_others=0 then 'PASS' else 'FAIL' end),
    ('t1_invoices_total_own',     s_inv_total,       gt_inv_t1,          case when s_inv_total=gt_inv_t1 then 'PASS' else 'FAIL' end),
    ('t1_invoice_fees_others',    s_if_others,       0,                  case when s_if_others=0 then 'PASS' else 'FAIL' end),
    ('t1_invoice_fees_total_own', s_if_total,        gt_if_t1,           case when s_if_total=gt_if_t1 then 'PASS' else 'FAIL' end),
    ('t1_fees_others',            s_fee_others,      0,                  case when s_fee_others=0 then 'PASS' else 'FAIL' end),
    ('t1_fees_own_draft_visible', s_fee_own_draft,   0,                  case when s_fee_own_draft=0 then 'PASS' else 'FAIL' end),
    ('t1_fees_own_nondraft',      s_fee_own_nondraft, gt_fee_t1_nondraft, case when s_fee_own_nondraft=gt_fee_t1_nondraft then 'PASS' else 'FAIL' end),
    ('pm_invoices_total',         pm_inv_total,      gt_inv_total,       case when pm_inv_total=gt_inv_total then 'PASS' else 'FAIL' end),
    ('pm_fees_total',             pm_fee_total,      gt_fee_total,       case when pm_fee_total=gt_fee_total then 'PASS' else 'FAIL' end);

  -- ===== 寫入面不回歸（W5 invoices_insert）=====
  perform set_config('request.jwt.claims', json_build_object('sub', v_t1::text, 'role', 'authenticated')::text, true);
  begin
    set local role authenticated;
    insert into public.invoices(title, translator, status, note, env, created_by)
      values ('[W10-SIM] self', v_t1_name, 'pending', '', current_env(), v_t1);
    reset role;
    insert into _w10 values ('w_insert_self_allow', 1, 1, 'PASS');
  exception when others then
    reset role;
    insert into _w10 values ('w_insert_self_allow', 0, 1, 'FAIL:' || SQLERRM);
  end;
  begin
    set local role authenticated;
    insert into public.invoices(title, translator, status, note, env, created_by)
      values ('[W10-SIM] other', v_t2_name, 'pending', '', current_env(), v_t1);
    reset role;
    insert into _w10 values ('w_insert_other_deny', 1, 0, 'FAIL_HOLE');
  exception when others then
    reset role;
    insert into _w10 values ('w_insert_other_deny', 0, 0, 'PASS');
  end;
  perform set_config('request.jwt.claims', null, true);

  delete from public.invoices where title like '[W10-SIM]%';
end $$;

select * from _w10 order by chk;
