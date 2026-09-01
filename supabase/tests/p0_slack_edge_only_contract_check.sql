-- STATUS: draft; NOT run against production; unverified
--
-- P0 Slack Edge-only：三表 client grants 拒絕、get_own_slack_meta RPC、service_role 操作。
-- 執行：隔離 branch／臨時 Micro；全程 BEGIN…ROLLBACK。不得輸出 token 值。

begin;

do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_c uuid := gen_random_uuid();
  v_state_id uuid := gen_random_uuid();
  v_tbl text;
  v_priv text;
  v_count bigint;
  v_row record;
  v_slack_tables text[] := array[
    'slack_oauth_states', 'user_slack_meta', 'user_slack_credentials'
  ];
begin
  insert into auth.users(id, email, raw_user_meta_data)
  values
    (v_a, 'p0slack-a@test.local', '{"display_name":"P0 Slack A"}'),
    (v_b, 'p0slack-b@test.local', '{"display_name":"P0 Slack B"}'),
    (v_c, 'p0slack-c@test.local', '{}');

  update public.profiles set is_test = true where id in (v_a, v_b, v_c);

  -- service_role fixture（不含真實 token 字串於輸出）
  insert into public.user_slack_meta (user_id, slack_user_id, slack_team_id, updated_at)
  values (v_a, 'U_P0SLACK_A', 'T_P0FIXTURE', now());

  insert into public.user_slack_credentials (
    user_id, access_token, refresh_token, slack_user_id, slack_team_id, updated_at
  ) values (
    v_a, 'fixture-access-redacted', 'fixture-refresh-redacted', 'U_P0SLACK_A', 'T_P0FIXTURE', now()
  );

  insert into public.user_slack_meta (user_id, slack_user_id, slack_team_id, updated_at)
  values (v_b, 'U_P0SLACK_B', 'T_P0FIXTURE', now());

  -- catalog：三表 RLS 啟用
  foreach v_tbl in array v_slack_tables loop
    if not (select relrowsecurity from pg_class where oid = format('public.%I', v_tbl)::regclass) then
      raise exception '% must have RLS enabled', v_tbl;
    end if;
  end loop;

  -- catalog：anon／authenticated 無 SELECT/INSERT/UPDATE/DELETE
  foreach v_tbl in array v_slack_tables loop
    foreach v_priv in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      if has_table_privilege('anon', format('public.%I', v_tbl), v_priv)
         or has_table_privilege('authenticated', format('public.%I', v_tbl), v_priv) then
        raise exception '% % grant must not exist for anon/authenticated', v_tbl, v_priv;
      end if;
      if has_table_privilege('public', format('public.%I', v_tbl), v_priv) then
        raise exception '% % grant must not exist for PUBLIC', v_tbl, v_priv;
      end if;
    end loop;
  end loop;

  -- anon 不可執行 RPC
  if has_function_privilege('anon', 'public.get_own_slack_meta()', 'EXECUTE') then
    raise exception 'anon must not execute get_own_slack_meta';
  end if;

  -- 使用者 A：RPC 只得本人 meta
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_a::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  select count(*) into v_count from public.get_own_slack_meta();
  if v_count <> 1 then
    raise exception 'user A must see exactly one meta row via RPC';
  end if;

  select * into v_row from public.get_own_slack_meta() limit 1;
  if v_row.user_id <> v_a or v_row.slack_user_id <> 'U_P0SLACK_A' then
    raise exception 'user A RPC returned wrong row';
  end if;

  -- 使用者 B：只得 B
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_b::text, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_count from public.get_own_slack_meta();
  if v_count <> 1 then
    raise exception 'user B must see exactly one meta row via RPC';
  end if;

  select * into v_row from public.get_own_slack_meta() limit 1;
  if v_row.user_id <> v_b or v_row.slack_user_id <> 'U_P0SLACK_B' then
    raise exception 'user B RPC must not return user A meta';
  end if;

  -- 無 meta 使用者：空集合
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_c::text, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_count from public.get_own_slack_meta();
  if v_count <> 0 then
    raise exception 'user without meta must get empty RPC result';
  end if;

  -- client 直查三表全部拒絕（authenticated）
  foreach v_tbl in array v_slack_tables loop
    begin
      execute format('select 1 from public.%I limit 1', v_tbl);
      raise exception 'authenticated must not select %', v_tbl;
    exception when insufficient_privilege then null;
    end;
  end loop;

  reset role;

  -- anon 直查與 RPC 拒絕
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;

  foreach v_tbl in array v_slack_tables loop
    begin
      execute format('select 1 from public.%I limit 1', v_tbl);
      raise exception 'anon must not select %', v_tbl;
    exception when insufficient_privilege then null;
    end;
  end loop;

  begin
    perform 1 from public.get_own_slack_meta() limit 1;
    raise exception 'anon must not execute get_own_slack_meta';
  exception when insufficient_privilege then null;
  end;

  reset role;

  -- service_role：OAuth state 建立／讀取／刪除
  set local role service_role;

  insert into public.slack_oauth_states (id, user_id, state, expires_at)
  values (v_state_id, v_a, 'p0-fixture-state', now() + interval '10 minutes');

  select count(*) into v_count
  from public.slack_oauth_states s
  where s.id = v_state_id and s.user_id = v_a;
  if v_count <> 1 then
    raise exception 'service_role must read oauth state';
  end if;

  delete from public.slack_oauth_states where id = v_state_id;
  select count(*) into v_count from public.slack_oauth_states where id = v_state_id;
  if v_count <> 0 then
    raise exception 'service_role must delete oauth state';
  end if;

  -- service_role：meta upsert／讀取／刪除
  insert into public.user_slack_meta (user_id, slack_user_id, slack_team_id, updated_at)
  values (v_a, 'U_P0SR_UPSERT', 'T_P0FIXTURE', now())
  on conflict (user_id) do update
    set slack_user_id = excluded.slack_user_id,
        updated_at = excluded.updated_at;

  select count(*) into v_count
  from public.user_slack_meta m
  where m.user_id = v_a and m.slack_user_id = 'U_P0SR_UPSERT';
  if v_count <> 1 then
    raise exception 'service_role meta upsert/read failed';
  end if;

  -- service_role：credentials upsert／讀取／刪除（欄位存在即可，不輸出 token）
  insert into public.user_slack_credentials (
    user_id, access_token, refresh_token, slack_user_id, slack_team_id, updated_at
  ) values (
    v_b, 'sr-fixture-access', 'sr-fixture-refresh', 'U_P0SR_B', 'T_P0FIXTURE', now()
  )
  on conflict (user_id) do update
    set access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        updated_at = excluded.updated_at;

  select count(*) into v_count
  from public.user_slack_credentials c
  where c.user_id = v_b and c.slack_user_id = 'U_P0SR_B';
  if v_count <> 1 then
    raise exception 'service_role credentials upsert/read failed';
  end if;

  delete from public.user_slack_credentials where user_id = v_b;
  select count(*) into v_count from public.user_slack_credentials where user_id = v_b;
  if v_count <> 0 then
    raise exception 'service_role credentials delete failed';
  end if;

  delete from public.user_slack_meta where user_id = v_b;
  select count(*) into v_count from public.user_slack_meta where user_id = v_b;
  if v_count <> 0 then
    raise exception 'service_role meta delete failed';
  end if;

  reset role;

  raise notice 'p0_slack_edge_only_contract_check: all assertions passed';
end $$;

rollback;
