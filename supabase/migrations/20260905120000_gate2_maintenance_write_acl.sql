-- Gate 2：維護寫入存取控制（預設關閉）
-- 啟用後：僅 allowlist 內的 auth.uid() 可通過受保護寫入 RPC；不取代 is_admin／env／revision／participant。
-- 管理僅能經 Postgres／service_role 呼叫 private.*；無前端可填欄位。
-- Idempotent：可重複套用於已包過的函式。

create schema if not exists private;

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

-- 動態包裝：rename public.fn → private.fn_impl，再建 wrapper 先 assert 再轉呼叫
create or replace function private.install_maintenance_write_wrapper(p_name text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_oid oid;
  v_identity text;
  v_ret text;
  v_prokind "char";
  v_nargs int;
  v_argnames text[];
  v_argtype_oids oid[];
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
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = v_impl_name
  ) then
    null;
  else
    select p.oid into v_oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = p_name
    order by p.oid
    limit 1;

    if v_oid is null then
      raise notice 'install_maintenance_write_wrapper: skip missing public.%', p_name;
      return;
    end if;

    v_identity := pg_get_function_identity_arguments(v_oid);
    execute format('alter function public.%I(%s) set schema private', p_name, v_identity);
    execute format('alter function private.%I(%s) rename to %I', p_name, v_identity, v_impl_name);
  end if;

  select p.oid,
         pg_get_function_identity_arguments(p.oid),
         pg_get_function_result(p.oid),
         pg_get_function_arguments(p.oid),
         p.pronargs,
         p.proargnames,
         p.proargtypes::oid[],
         p.prokind,
         p.prosecdef,
         p.proretset
    into v_oid, v_identity, v_ret, v_params, v_nargs, v_argnames, v_argtype_oids,
         v_prokind, v_prosecdef, v_proretset
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = v_impl_name
  order by p.oid
  limit 1;

  if v_oid is null then
    raise exception 'impl missing for %', p_name;
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

  execute format('revoke all on function public.%I(%s) from public, anon', p_name, v_identity);
  execute format(
    'grant execute on function public.%I(%s) to authenticated, service_role',
    p_name,
    v_identity
  );
end;
$$;

revoke all on function private.install_maintenance_write_wrapper(text) from public, anon, authenticated;
grant execute on function private.install_maintenance_write_wrapper(text) to service_role;

select private.install_maintenance_write_wrapper('pm_update_case_assignments');
select private.install_maintenance_write_wrapper('apply_case_update');
select private.install_maintenance_write_wrapper('update_case_permitted_fields');
select private.install_maintenance_write_wrapper('update_case_credentials');
select private.install_maintenance_write_wrapper('accept_public_inquiry_case');
select private.install_maintenance_write_wrapper('decline_public_inquiry_case');
select private.install_maintenance_write_wrapper('accept_inquiry_collab_row');
select private.install_maintenance_write_wrapper('complete_case_collab_row');
select private.install_maintenance_write_wrapper('complete_case_translation');
select private.install_maintenance_write_wrapper('complete_case_review_row');
select private.install_maintenance_write_wrapper('admin_create_case');
select private.install_maintenance_write_wrapper('admin_delete_case');
select private.install_maintenance_write_wrapper('lms_sync_cat_file_assignments_for_case');
select private.install_maintenance_write_wrapper('lms_sync_cat_workflow_for_case');
select private.install_maintenance_write_wrapper('sync_cat_file_assignments_for_case');
select private.install_maintenance_write_wrapper('sync_cat_workflow_assignments_for_case');
select private.install_maintenance_write_wrapper('apply_cat_segment_target_update');
select private.install_maintenance_write_wrapper('apply_cat_segments_patch_batch');
select private.install_maintenance_write_wrapper('cat_pm_assign_file');
select private.install_maintenance_write_wrapper('cat_pm_unassign_file');
select private.install_maintenance_write_wrapper('cat_pm_assign_view');
select private.install_maintenance_write_wrapper('cat_pm_unassign_view');
select private.install_maintenance_write_wrapper('revoke_case_participant_access');
