-- W5-3 billing RLS 負向驗證（DB 層，可重複執行）
--
-- 目的：不經 UI、不依賴測試模式換人流程，直接在資料庫層模擬「譯者一」身分，
--       驗證合併後的 invoices INSERT 政策（invoices_insert）行為正確：
--         1. 譯者可建立「本人」請款             → 應 ALLOW
--         2. 譯者建立「他人」請款               → 應 DENY（RLS WITH CHECK 擋下）
--         3/4. 讀取為同 env 全體開放（設計如此）→ 可見他人請款筆數 > 0（非 0）
--
-- 執行方式：
--   supabase MCP execute_sql，或 psql 連線後貼上整段。
--   透過 SET LOCAL ROLE authenticated + set_config('request.jwt.claims', ...) 模擬使用者，
--   全程在單一交易內完成，測試列以 [RLS-SIM] 前綴標記並於結尾刪除，不留殘料。
--
-- 前置：profiles 內存在 test-t1@test.local（is_test=true，member）與 test-t2@test.local。
-- 註：本腳本必須以具 BYPASSRLS 且可 SET ROLE authenticated 的連線角色執行（如 postgres/service）。
--
-- 2026-07-03 首次執行結果：
--   1_insert_self=ALLOW、2_insert_other=DENY_EXPECTED、3_select_total=12、4_select_others=11
--   → 寫入面政策正確；讀取面為同 env 全體可讀（業務設計，非 0）。

do $$
declare
  v_t1 uuid; v_t1_name text; v_t2_name text;
  v_total int; v_others int;
begin
  select id, display_name into v_t1, v_t1_name from public.profiles where email = 'test-t1@test.local';
  select display_name into v_t2_name from public.profiles where email = 'test-t2@test.local';

  create temp table if not exists _rls_sim(chk text, outcome text) on commit drop;
  delete from _rls_sim;

  -- 模擬 authenticated 的譯者一（current_env() 依 profiles.is_test 解為 'test'）
  perform set_config('request.jwt.claims', json_build_object('sub', v_t1::text, 'role', 'authenticated')::text, true);

  -- 1) 本人請款：應 ALLOW
  begin
    set local role authenticated;
    insert into public.invoices(title, translator, status, note, env, created_by)
      values ('[RLS-SIM] self', v_t1_name, 'pending', '', current_env(), v_t1);
    reset role;
    insert into _rls_sim values ('1_insert_self', 'ALLOW');
  exception when others then
    reset role;
    insert into _rls_sim values ('1_insert_self', 'DENY:' || SQLERRM);
  end;

  -- 2) 冒名他人請款：應 DENY
  begin
    set local role authenticated;
    insert into public.invoices(title, translator, status, note, env, created_by)
      values ('[RLS-SIM] other', v_t2_name, 'pending', '', current_env(), v_t1);
    reset role;
    insert into _rls_sim values ('2_insert_other', 'ALLOW_POLICY_HOLE');
  exception when others then
    reset role;
    insert into _rls_sim values ('2_insert_other', 'DENY_EXPECTED');
  end;

  -- 3/4) 讀取：同 env 全體開放（記錄實際可見筆數，非斷言為 0）
  begin
    set local role authenticated;
    select count(*) into v_total from public.invoices;
    select count(*) into v_others from public.invoices where translator is distinct from v_t1_name;
    reset role;
    insert into _rls_sim values ('3_select_total', v_total::text);
    insert into _rls_sim values ('4_select_others', v_others::text);
  exception when others then
    reset role;
    insert into _rls_sim values ('3_select', 'ERR:' || SQLERRM);
  end;

  -- 清理測試列
  delete from public.invoices where title like '[RLS-SIM]%';
end $$;

select * from _rls_sim order by chk;
