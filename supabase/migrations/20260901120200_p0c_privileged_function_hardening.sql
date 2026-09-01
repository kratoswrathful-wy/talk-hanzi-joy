-- P0-C 補丁 2：privileged definer 函式 Advisor WARN 部署前收斂（idempotent）。
--   - 副作用／寫入／憑證／admin RPC：REVOKE public/anon EXECUTE
--   - legacy search_path=public 之 definer：改 pg_catalog, public（過渡；完整 pg_catalog 需函式重寫）

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname ~ '^(cat_|apply_|admin_|accept_|decline_|complete_case|get_case|update_case|lms_sync|revoke_case|sync_cat|ensure_cat|release_cat|apply_cat)'
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
  end loop;
end $$;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) cfg
        where cfg = 'search_path=public'
           or cfg like 'search_path=public,%'
      )
  loop
    execute format('alter function %s set search_path = pg_catalog, public', r.sig);
  end loop;
end $$;

revoke all on function public.current_env() from anon;

comment on function public.current_env() is
  '回傳目前登入者所屬環境；authenticated/service_role 可 EXECUTE；anon 已 revoke。search_path 見 20200。';
