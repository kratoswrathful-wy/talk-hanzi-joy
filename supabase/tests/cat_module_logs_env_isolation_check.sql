-- CAT 模組層變更紀錄：正式／測試資料必須可依 env 完整分離。
-- 全程在交易內執行，最後 rollback，不保留測試資料。
begin;

do $$
declare
  v_marker text := 'env-check-' || gen_random_uuid()::text;
  v_production_count integer;
  v_test_count integer;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cat_module_logs'
      and column_name = 'env'
      and is_nullable = 'NO'
  ) then
    raise exception 'cat_module_logs_env_isolation_check: env 欄位不存在或可為 null';
  end if;

  insert into public.cat_module_logs (module, payload, env)
  values
    ('env-isolation-check', jsonb_build_object('marker', v_marker), 'production'),
    ('env-isolation-check', jsonb_build_object('marker', v_marker), 'test');

  select count(*)
  into v_production_count
  from public.cat_module_logs
  where module = 'env-isolation-check'
    and payload ->> 'marker' = v_marker
    and env = 'production';

  select count(*)
  into v_test_count
  from public.cat_module_logs
  where module = 'env-isolation-check'
    and payload ->> 'marker' = v_marker
    and env = 'test';

  if v_production_count <> 1 or v_test_count <> 1 then
    raise exception
      'cat_module_logs_env_isolation_check: 分區筆數錯誤 production=% test=%',
      v_production_count,
      v_test_count;
  end if;

  begin
    insert into public.cat_module_logs (module, payload, env)
    values ('env-isolation-check', jsonb_build_object('marker', v_marker), 'staging');
    raise exception 'cat_module_logs_env_isolation_check: 非法 env 寫入未被拒絕';
  exception
    when check_violation then
      null;
  end;

  raise notice 'cat_module_logs_env_isolation_check PASS';
end $$;

rollback;
