-- Gate 2：維護寫入存取控制（預設關閉）
-- 啟用後：僅 allowlist 內的 auth.uid() 可通過受保護寫入 RPC；不取代 is_admin／env／revision／participant。
-- 管理僅能經 Postgres／service_role 呼叫 private.*；無前端可填欄位。
-- Idempotent：可重複套用於已包過的函式。

create schema if not exists private;

-- 不在此一律 GRANT USAGE／EXECUTE 給 authenticated；由 install wrapper 依原 ACL 與 INVOKER 需求處理。

create table if not exists private.maintenance_access_control (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

insert into private.maintenance_access_control (id, enabled)
values (1, false)
on conflict (id) do nothing;

create table if not exists private.maintenance_operator_allowlist (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text null,
  created_at timestamptz not null default now()
);

revoke all on table private.maintenance_access_control from public, anon, authenticated;
revoke all on table private.maintenance_operator_allowlist from public, anon, authenticated;
grant select, insert, update, delete on table private.maintenance_access_control to service_role;
grant select, insert, update, delete on table private.maintenance_operator_allowlist to service_role;

create or replace function private.maintenance_is_enabled()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    (select c.enabled from private.maintenance_access_control c where c.id = 1),
    false
  );
$$;

revoke all on function private.maintenance_is_enabled() from public, anon, authenticated;
grant execute on function private.maintenance_is_enabled() to service_role;

create or replace function private.assert_maintenance_write_allowed()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not private.maintenance_is_enabled() then
    return;
  end if;
  if v_uid is null then
    raise exception 'maintenance_write_denied'
      using errcode = '42501',
            hint = 'maintenance mode on; auth.uid() required and must be allowlisted';
  end if;
  if not exists (
    select 1
    from private.maintenance_operator_allowlist a
    where a.user_id = v_uid
  ) then
    raise exception 'maintenance_write_denied'
      using errcode = '42501',
            hint = 'maintenance mode on; caller not on operator allowlist';
  end if;
end;
$$;

revoke all on function private.assert_maintenance_write_allowed() from public, anon;
-- INVOKER wrapper（如 CAT 句段）以呼叫者身分執行 assert，需授予 execute；assert 本身只做允許名單檢查
grant execute on function private.assert_maintenance_write_allowed() to authenticated, service_role, postgres;

create or replace function private.maintenance_set_enabled(p_enabled boolean, p_actor uuid default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into private.maintenance_access_control (id, enabled, updated_at, updated_by)
  values (1, coalesce(p_enabled, false), now(), p_actor)
  on conflict (id) do update
    set enabled = excluded.enabled,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
end;
$$;

create or replace function private.maintenance_allowlist_add(p_user_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_user_id is null then
    raise exception 'invalid_user_id';
  end if;
  insert into private.maintenance_operator_allowlist (user_id, note)
  values (p_user_id, p_note)
  on conflict (user_id) do update set note = excluded.note;
end;
$$;

create or replace function private.maintenance_allowlist_remove(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  delete from private.maintenance_operator_allowlist where user_id = p_user_id;
end;
$$;

revoke all on function private.maintenance_set_enabled(boolean, uuid) from public, anon, authenticated;
revoke all on function private.maintenance_allowlist_add(uuid, text) from public, anon, authenticated;
revoke all on function private.maintenance_allowlist_remove(uuid) from public, anon, authenticated;
grant execute on function private.maintenance_set_enabled(boolean, uuid) to service_role;
grant execute on function private.maintenance_allowlist_add(uuid, text) to service_role;
grant execute on function private.maintenance_allowlist_remove(uuid) to service_role;

create or replace function public.maintenance_write_gate()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_enabled boolean := private.maintenance_is_enabled();
  v_uid uuid := (select auth.uid());
  v_allowed boolean;
begin
  if not v_enabled then
    return jsonb_build_object('ok', true, 'enabled', false, 'allowed', true);
  end if;
  v_allowed := v_uid is not null and exists (
    select 1 from private.maintenance_operator_allowlist a where a.user_id = v_uid
  );
  return jsonb_build_object(
    'ok', v_allowed,
    'enabled', true,
    'allowed', v_allowed,
    'error', case when v_allowed then null else 'maintenance_write_denied' end
  );
end;
$$;

revoke all on function public.maintenance_write_gate() from public, anon;
grant execute on function public.maintenance_write_gate() to authenticated, service_role;

comment on function public.maintenance_write_gate() is
  '維護寫入閘門狀態；enabled=false 時一律 allowed。不取代角色／env／revision 授權。';

-- Edge callback（無 JWT）以 service_role 核對 state 對應 user 是否可寫
create or replace function public.maintenance_actor_allowed_for_service(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not private.maintenance_is_enabled() then
    return true;
  end if;
  if p_user_id is null then
    return false;
  end if;
  return exists (
    select 1 from private.maintenance_operator_allowlist a where a.user_id = p_user_id
  );
end;
$$;

revoke all on function public.maintenance_actor_allowed_for_service(uuid) from public, anon, authenticated;
grant execute on function public.maintenance_actor_allowed_for_service(uuid) to service_role;

comment on function public.maintenance_actor_allowed_for_service(uuid) is
  '僅 service_role：維護啟用時檢查指定 user_id 是否在 allowlist（供 Slack OAuth callback）。';

-- 動態包裝：以完整 identity args 定位；保留原 EXECUTE 受眾；缺入口則失敗。
-- p_identity_args 須與 pg_get_function_identity_arguments 完全一致（例如 'uuid, bigint, jsonb'）。
create or replace function private.install_maintenance_write_wrapper(
  p_name text,
  p_identity_args text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_public_oid oid;
  v_impl_oid oid;
  v_oid oid;
  v_identity text;
  v_ret text;
  v_prokind "char";
  v_nargs int;
  v_argnames text[];
  v_i int;
  v_params text := '';
  v_args text := '';
  v_sql text;
  v_impl_name text := p_name || '_impl';
  v_aname text;
  v_prosecdef boolean;
  v_proretset boolean;
  v_security text;
  v_body text;
  v_grant_authenticated boolean := false;
  v_grant_service_role boolean := false;
  v_acl_source oid;
begin
  if p_name is null or length(trim(p_name)) = 0 or p_identity_args is null then
    raise exception 'install_maintenance_write_wrapper: invalid name/identity';
  end if;

  select p.oid into v_impl_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = v_impl_name
    and pg_get_function_identity_arguments(p.oid) = p_identity_args;

  select p.oid into v_public_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = p_name
    and pg_get_function_identity_arguments(p.oid) = p_identity_args;

  if v_impl_oid is null then
    if v_public_oid is null then
      raise exception
        'install_maintenance_write_wrapper: required function public.% (%) missing',
        p_name,
        p_identity_args;
    end if;

    -- 在 rename 前快照 public 入口的 EXECUTE 受眾（不得事後一律重開）
    v_grant_authenticated := has_function_privilege('authenticated', v_public_oid, 'EXECUTE');
    v_grant_service_role := has_function_privilege('service_role', v_public_oid, 'EXECUTE');

    execute format(
      'alter function public.%I(%s) set schema private',
      p_name,
      p_identity_args
    );
    execute format(
      'alter function private.%I(%s) rename to %I',
      p_name,
      p_identity_args,
      v_impl_name
    );

    select p.oid into v_impl_oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = v_impl_name
      and pg_get_function_identity_arguments(p.oid) = p_identity_args;
  else
    -- 已包裝：以現有 public wrapper（若在）的 ACL 為準；否則保留「authenticated 無、service_role 有」的安全預設僅當無法讀取時失敗
    if v_public_oid is not null then
      v_acl_source := v_public_oid;
    else
      raise exception
        'install_maintenance_write_wrapper: impl exists but public.% (%) missing — refuse silent recreate',
        p_name,
        p_identity_args;
    end if;
    v_grant_authenticated := has_function_privilege('authenticated', v_acl_source, 'EXECUTE');
    v_grant_service_role := has_function_privilege('service_role', v_acl_source, 'EXECUTE');
  end if;

  if v_impl_oid is null then
    raise exception
      'install_maintenance_write_wrapper: impl missing for %.%',
      p_name,
      p_identity_args;
  end if;

  select p.oid,
         pg_get_function_identity_arguments(p.oid),
         pg_get_function_result(p.oid),
         pg_get_function_arguments(p.oid),
         p.pronargs,
         p.proargnames,
         p.prokind,
         p.prosecdef,
         p.proretset
    into v_oid, v_identity, v_ret, v_params, v_nargs, v_argnames,
         v_prokind, v_prosecdef, v_proretset
  from pg_proc p
  where p.oid = v_impl_oid;

  if v_identity is distinct from p_identity_args then
    raise exception 'identity mismatch for %: expected %, got %',
      p_name, p_identity_args, v_identity;
  end if;

  v_args := '';
  for v_i in 1..coalesce(v_nargs, 0) loop
    if v_i > 1 then
      v_args := v_args || ', ';
    end if;
    v_aname := null;
    if v_argnames is not null and v_i <= coalesce(array_length(v_argnames, 1), 0) then
      v_aname := v_argnames[v_i];
    end if;
    if v_aname is null or v_aname = '' then
      v_aname := 'p' || (v_i - 1)::text;
    end if;
    v_args := v_args || format('%I', v_aname);
  end loop;

  v_security := case when v_prosecdef then 'security definer' else 'security invoker' end;

  if v_prokind = 'p' then
    v_body := format(
      'begin
         perform private.assert_maintenance_write_allowed();
         call private.%I(%s);
       end',
      v_impl_name, v_args
    );
    v_sql := format(
      'create or replace procedure public.%I(%s)
       language plpgsql
       %s
       set search_path = pg_catalog
       as $body$
       %s
       $body$',
      p_name, v_params, v_security, v_body
    );
  elsif v_proretset then
    v_body := format(
      'begin
         perform private.assert_maintenance_write_allowed();
         return query select * from private.%I(%s);
       end',
      v_impl_name, v_args
    );
    v_sql := format(
      'create or replace function public.%I(%s)
       returns %s
       language plpgsql
       %s
       set search_path = pg_catalog
       as $body$
       %s
       $body$',
      p_name, v_params, v_ret, v_security, v_body
    );
  elsif v_ret = 'void' then
    v_body := format(
      'begin
         perform private.assert_maintenance_write_allowed();
         perform private.%I(%s);
       end',
      v_impl_name, v_args
    );
    v_sql := format(
      'create or replace function public.%I(%s)
       returns void
       language plpgsql
       %s
       set search_path = pg_catalog
       as $body$
       %s
       $body$',
      p_name, v_params, v_security, v_body
    );
  else
    v_body := format(
      'begin
         perform private.assert_maintenance_write_allowed();
         return private.%I(%s);
       end',
      v_impl_name, v_args
    );
    v_sql := format(
      'create or replace function public.%I(%s)
       returns %s
       language plpgsql
       %s
       set search_path = pg_catalog
       as $body$
       %s
       $body$',
      p_name, v_params, v_ret, v_security, v_body
    );
  end if;

  execute v_sql;

  -- 還原 public wrapper 的呼叫權限（不一律開放 authenticated）
  execute format(
    'revoke all on function public.%I(%s) from public, anon, authenticated, service_role',
    p_name,
    v_identity
  );
  if v_grant_authenticated then
    execute format(
      'grant execute on function public.%I(%s) to authenticated',
      p_name,
      v_identity
    );
  end if;
  if v_grant_service_role then
    execute format(
      'grant execute on function public.%I(%s) to service_role',
      p_name,
      v_identity
    );
  end if;

  -- private.*_impl：撤銷一般角色直呼，避免繞過 wrapper 的維護 assert
  execute format(
    'revoke all on function private.%I(%s) from public, anon, authenticated, service_role',
    v_impl_name,
    v_identity
  );
  if not v_prosecdef then
    -- INVOKER wrapper 以呼叫者身分執行 impl，需對原有 EXECUTE 受眾授權 + schema USAGE
    execute 'grant usage on schema private to service_role';
    if v_grant_authenticated then
      execute 'grant usage on schema private to authenticated';
      execute format(
        'grant execute on function private.%I(%s) to authenticated',
        v_impl_name,
        v_identity
      );
    end if;
    if v_grant_service_role then
      execute format(
        'grant execute on function private.%I(%s) to service_role',
        v_impl_name,
        v_identity
      );
    end if;
  end if;
  -- SECURITY DEFINER wrapper：僅函式擁有者可呼叫 impl（不授予 authenticated／service_role）
end;
$$;

revoke all on function private.install_maintenance_write_wrapper(text, text)
  from public, anon, authenticated;
grant execute on function private.install_maintenance_write_wrapper(text, text)
  to service_role;

-- 必要入口：缺一即失敗（完整 identity args）
select private.install_maintenance_write_wrapper(
  'pm_update_case_assignments', 'uuid, bigint, jsonb'
);
select private.install_maintenance_write_wrapper(
  'apply_case_update', 'uuid, jsonb, bigint'
);
select private.install_maintenance_write_wrapper(
  'update_case_permitted_fields', 'uuid, bigint, jsonb'
);
select private.install_maintenance_write_wrapper(
  'update_case_credentials', 'uuid, bigint, jsonb'
);
select private.install_maintenance_write_wrapper(
  'accept_public_inquiry_case', 'uuid, bigint'
);
select private.install_maintenance_write_wrapper(
  'decline_public_inquiry_case', 'uuid, bigint, jsonb'
);
select private.install_maintenance_write_wrapper(
  'accept_inquiry_collab_row', 'uuid, text, bigint'
);
select private.install_maintenance_write_wrapper(
  'complete_case_collab_row', 'uuid, text, bigint'
);
select private.install_maintenance_write_wrapper(
  'complete_case_translation', 'uuid, bigint'
);
select private.install_maintenance_write_wrapper(
  'complete_case_review_row', 'uuid, text, bigint'
);
select private.install_maintenance_write_wrapper(
  'admin_create_case', 'uuid, jsonb'
);
select private.install_maintenance_write_wrapper(
  'admin_delete_case', 'uuid, bigint'
);
select private.install_maintenance_write_wrapper(
  'lms_sync_cat_file_assignments_for_case', 'uuid'
);
select private.install_maintenance_write_wrapper(
  'lms_sync_cat_workflow_for_case', 'uuid'
);
select private.install_maintenance_write_wrapper(
  'sync_cat_file_assignments_for_case', 'uuid'
);
select private.install_maintenance_write_wrapper(
  'sync_cat_workflow_assignments_for_case', 'uuid'
);
select private.install_maintenance_write_wrapper(
  'apply_cat_segment_target_update', 'uuid, text, bigint, jsonb'
);
select private.install_maintenance_write_wrapper(
  'apply_cat_segments_patch_batch', 'jsonb'
);
select private.install_maintenance_write_wrapper(
  'cat_pm_assign_file', 'uuid, uuid[]'
);
select private.install_maintenance_write_wrapper(
  'cat_pm_unassign_file', 'uuid, uuid'
);
select private.install_maintenance_write_wrapper(
  'cat_pm_assign_view', 'uuid, uuid[]'
);
select private.install_maintenance_write_wrapper(
  'cat_pm_unassign_view', 'uuid, uuid'
);
select private.install_maintenance_write_wrapper(
  'revoke_case_participant_access', 'uuid, uuid, text, bigint'
);