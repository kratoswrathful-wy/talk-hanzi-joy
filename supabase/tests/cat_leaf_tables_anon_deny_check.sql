-- CAT 大型葉子表：anon 必須在權限層快速拒絕；authenticated 維持既有讀取能力。
-- 可重複執行，不新增或修改正式資料。
do $$
declare
  v_user_id uuid;
  v_table text;
  v_privilege text;
  v_policy_count integer;
  v_anon_segments_denied boolean := false;
  v_anon_tm_segments_denied boolean := false;
begin
  select id into v_user_id
  from public.profiles
  where id is not null
  limit 1;

  if v_user_id is null then
    raise exception 'cat_leaf_tables_anon_deny_check: missing authenticated profile';
  end if;

  foreach v_table in array array['public.cat_segments', 'public.cat_tm_segments']
  loop
    foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
    loop
      if has_table_privilege('anon', v_table, v_privilege) then
        raise exception 'cat_leaf_tables_anon_deny_check: anon still has % on %', v_privilege, v_table;
      end if;
    end loop;

    foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE']
    loop
      if not has_table_privilege('authenticated', v_table, v_privilege) then
        raise exception 'cat_leaf_tables_anon_deny_check: authenticated missing % on %', v_privilege, v_table;
      end if;
    end loop;
  end loop;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'cat_segments'
    and policyname = 'cat_segments_rw_authenticated'
    and cmd = 'ALL'
    and roles = array['authenticated']::name[];
  if v_policy_count <> 1 then
    raise exception 'cat_leaf_tables_anon_deny_check: cat_segments policy is not authenticated-only';
  end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'cat_tm_segments'
    and policyname = 'cat_tm_segments_rw_authenticated'
    and cmd = 'ALL'
    and roles = array['authenticated']::name[];
  if v_policy_count <> 1 then
    raise exception 'cat_leaf_tables_anon_deny_check: cat_tm_segments policy is not authenticated-only';
  end if;

  begin
    set local statement_timeout = '500ms';
    set local role anon;
    perform id from public.cat_segments limit 1;
    reset role;
  exception
    when insufficient_privilege then
      v_anon_segments_denied := true;
    when query_canceled then
      raise exception 'cat_leaf_tables_anon_deny_check: anon cat_segments query timed out instead of denying';
  end;

  begin
    set local statement_timeout = '500ms';
    set local role anon;
    perform id from public.cat_tm_segments limit 1;
    reset role;
  exception
    when insufficient_privilege then
      v_anon_tm_segments_denied := true;
    when query_canceled then
      raise exception 'cat_leaf_tables_anon_deny_check: anon cat_tm_segments query timed out instead of denying';
  end;

  if not v_anon_segments_denied or not v_anon_tm_segments_denied then
    raise exception 'cat_leaf_tables_anon_deny_check: anon SELECT unexpectedly succeeded';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
    perform id from public.cat_segments order by id limit 1;
    perform id from public.cat_tm_segments order by id limit 1;
  reset role;
  perform set_config('request.jwt.claims', null, true);

  raise notice 'cat_leaf_tables_anon_deny_check PASS';
end $$;
