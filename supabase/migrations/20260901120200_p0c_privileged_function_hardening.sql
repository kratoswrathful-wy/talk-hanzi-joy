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

-- Slack Edge-only：撤銷 client 角色 table grants；OAuth state 僅 service_role／Edge
revoke all on table public.slack_oauth_states from anon, authenticated;

-- user_slack_meta：撤銷 client grants 並移除 direct policy；改經 RPC 讀取本人 meta
revoke all on table public.user_slack_meta from anon, authenticated;

drop policy if exists "user_slack_meta_select_own" on public.user_slack_meta;
drop policy if exists "user_slack_meta_delete_own" on public.user_slack_meta;

create or replace function public.get_own_slack_meta()
returns table (user_id uuid, slack_user_id text, slack_team_id text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select m.user_id, m.slack_user_id, m.slack_team_id
  from public.user_slack_meta m
  where m.user_id = auth.uid();
$$;

revoke all on function public.get_own_slack_meta() from public, anon;
grant execute on function public.get_own_slack_meta() to authenticated;

comment on function public.get_own_slack_meta() is
  '回傳目前登入者的 Slack meta；取代 client 直查 user_slack_meta（該表已 revoke client grants）。';

comment on function public.current_env() is
  '回傳目前登入者所屬環境；authenticated/service_role 可 EXECUTE；anon 已 revoke。search_path 見 20200。';
