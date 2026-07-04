-- CAT AI model registry Phase 1 RLS 驗證（可重複執行）
--
-- 目的：確認 enabled 選項可供一般 authenticated 讀取；
--       非 executive 不可寫入 cat_ai_model_options；
--       ai_provider_models 可供 authenticated 讀取（供外層 rpc join）。
--
-- 執行：supabase MCP execute_sql 或 psql；需 BYPASSRLS 角色。
-- 前置：profiles 內存在 test-t1@test.local（member）。

do $$
declare
  v_member uuid;
  v_enabled_count int;
  v_provider_count int;
begin
  select id into v_member from public.profiles where email = 'test-t1@test.local';

  create temp table if not exists _registry_rls(chk text, outcome text) on commit drop;
  delete from _registry_rls;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_member::text, 'role', 'authenticated')::text,
    true
  );

  -- 1) member 可讀 enabled 模型選項
  begin
    set local role authenticated;
    select count(*) into v_enabled_count
    from public.cat_ai_model_options
    where enabled = true;
    reset role;
    insert into _registry_rls values (
      '1_member_select_enabled',
      case when v_enabled_count >= 1 then 'ALLOW count=' || v_enabled_count::text else 'DENY_EMPTY' end
    );
  exception when others then
    reset role;
    insert into _registry_rls values ('1_member_select_enabled', 'ERR:' || SQLERRM);
  end;

  -- 2) member 可讀 ai_provider_models
  begin
    set local role authenticated;
    select count(*) into v_provider_count from public.ai_provider_models;
    reset role;
    insert into _registry_rls values (
      '2_member_select_provider_models',
      case when v_provider_count >= 1 then 'ALLOW count=' || v_provider_count::text else 'DENY_EMPTY' end
    );
  exception when others then
    reset role;
    insert into _registry_rls values ('2_member_select_provider_models', 'ERR:' || SQLERRM);
  end;

  -- 3) member 不可 insert cat_ai_model_options
  begin
    set local role authenticated;
    insert into public.cat_ai_model_options (
      provider_key, model_id, enabled, display_name_zh
    ) values ('openai', '[RLS-SIM] fake-model', false, 'RLS SIM');
    reset role;
    insert into _registry_rls values ('3_member_insert_option', 'ALLOW_POLICY_HOLE');
  exception when others then
    reset role;
    insert into _registry_rls values ('3_member_insert_option', 'DENY_EXPECTED');
  end;

  delete from public.cat_ai_model_options where model_id = '[RLS-SIM] fake-model';
end $$;

select * from _registry_rls order by chk;
