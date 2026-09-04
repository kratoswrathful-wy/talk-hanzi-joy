-- P0-B2：撤回內層 workflow／指派 helper 的 authenticated EXECUTE；改經外層 ACL RPC。
-- 本機／隔離庫草稿；NOT deployable until verified。idempotent。

-- ── 1) REVOKE 內層 helper（含 overload 若存在）────────────────────────────────
revoke all on function public.sync_cat_workflow_assignments_for_case(uuid)
  from public, anon, authenticated;
revoke all on function public.sync_cat_file_assignments_for_case(uuid)
  from public, anon, authenticated;
revoke all on function public.cat_upsert_translate_stage_assignment(
  uuid, uuid, text, uuid, text, integer, integer, text, boolean
) from public, anon, authenticated;
revoke all on function public.cat_upsert_review_stage_assignment(
  uuid, uuid, text, uuid, text, integer, integer, text, boolean
) from public, anon, authenticated;
revoke all on function public.cat_revert_workflow_stages_for_case(uuid)
  from public, anon, authenticated;

-- 舊簽名相容（若仍存在）
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'cat_upsert_translate_stage_assignment'
      and pg_get_function_identity_arguments(p.oid)
        = 'uuid, uuid, text, uuid, text, integer, integer, text'
  ) then
    execute 'revoke all on function public.cat_upsert_translate_stage_assignment(uuid, uuid, text, uuid, text, integer, integer, text) from public, anon, authenticated';
  end if;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'cat_upsert_review_stage_assignment'
      and pg_get_function_identity_arguments(p.oid)
        = 'uuid, uuid, text, uuid, text, integer, integer, text'
  ) then
    execute 'revoke all on function public.cat_upsert_review_stage_assignment(uuid, uuid, text, uuid, text, integer, integer, text) from public, anon, authenticated';
  end if;
end $$;

-- service_role 仍可直呼內層（維運／後台）
grant execute on function public.sync_cat_workflow_assignments_for_case(uuid)
  to service_role;
grant execute on function public.sync_cat_file_assignments_for_case(uuid)
  to service_role;
grant execute on function public.cat_upsert_translate_stage_assignment(
  uuid, uuid, text, uuid, text, integer, integer, text, boolean
) to service_role;
grant execute on function public.cat_upsert_review_stage_assignment(
  uuid, uuid, text, uuid, text, integer, integer, text, boolean
) to service_role;
grant execute on function public.cat_revert_workflow_stages_for_case(uuid)
  to service_role;

-- ── 2) 共用：案件同 env + admin ───────────────────────────────────────────────
create or replace function private.p0b_require_admin_case(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_env text := public.current_env();
begin
  if v_uid is null or not public.is_admin(v_uid) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if p_case_id is null
     or not exists (
       select 1 from public.cases c
       where c.id = p_case_id and c.env = v_env
     ) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
end;
$$;

revoke all on function private.p0b_require_admin_case(uuid)
  from public, anon, authenticated;

create or replace function private.p0b_require_admin_file(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_env text := public.current_env();
begin
  if v_uid is null or not public.is_admin(v_uid) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if p_file_id is null
     or not exists (
       select 1 from public.cat_files f
       where f.id = p_file_id and f.env = v_env
     ) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
end;
$$;

revoke all on function private.p0b_require_admin_file(uuid)
  from public, anon, authenticated;

-- ── 3) LMS sync 外層 ──────────────────────────────────────────────────────────
create or replace function public.lms_sync_cat_workflow_for_case(p_case_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform private.p0b_require_admin_case(p_case_id);
  return public.sync_cat_workflow_assignments_for_case(p_case_id);
end;
$$;

create or replace function public.lms_sync_cat_file_assignments_for_case(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform private.p0b_require_admin_case(p_case_id);
  perform public.sync_cat_file_assignments_for_case(p_case_id);
end;
$$;

revoke all on function public.lms_sync_cat_workflow_for_case(uuid)
  from public, anon;
revoke all on function public.lms_sync_cat_file_assignments_for_case(uuid)
  from public, anon;
grant execute on function public.lms_sync_cat_workflow_for_case(uuid)
  to authenticated, service_role;
grant execute on function public.lms_sync_cat_file_assignments_for_case(uuid)
  to authenticated, service_role;

-- ── 4) 指派狀態（assignee 本人或 admin）─────────────────────────────────────
create or replace function public.cat_update_file_assignment_status(
  p_assignment_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_env text := public.current_env();
  v_assignee uuid;
  v_file_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if p_assignment_id is null or nullif(trim(coalesce(p_status, '')), '') is null then
    raise exception using errcode = '22023', message = 'invalid_status_payload';
  end if;

  select a.assignee_user_id, a.file_id
    into v_assignee, v_file_id
  from public.cat_file_assignments a
  join public.cat_files f on f.id = a.file_id
  where a.id = p_assignment_id
    and f.env = v_env;

  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if v_assignee is distinct from v_uid and not public.is_admin(v_uid) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  update public.cat_file_assignments
  set status = trim(p_status),
      updated_at = now()
  where id = p_assignment_id;

  return jsonb_build_object('ok', true, 'id', p_assignment_id, 'status', trim(p_status));
end;
$$;

create or replace function public.cat_update_view_assignment_status(
  p_assignment_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_env text := public.current_env();
  v_assignee uuid;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if p_assignment_id is null or nullif(trim(coalesce(p_status, '')), '') is null then
    raise exception using errcode = '22023', message = 'invalid_status_payload';
  end if;

  select a.assignee_user_id
    into v_assignee
  from public.cat_view_assignments a
  join public.cat_views v on v.id = a.view_id
  join public.cat_projects p on p.id = v.project_id
  where a.id = p_assignment_id
    and p.env = v_env;

  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if v_assignee is distinct from v_uid and not public.is_admin(v_uid) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  update public.cat_view_assignments
  set status = trim(p_status),
      updated_at = now()
  where id = p_assignment_id;

  return jsonb_build_object('ok', true, 'id', p_assignment_id, 'status', trim(p_status));
end;
$$;

revoke all on function public.cat_update_file_assignment_status(uuid, text)
  from public, anon;
revoke all on function public.cat_update_view_assignment_status(uuid, text)
  from public, anon;
grant execute on function public.cat_update_file_assignment_status(uuid, text)
  to authenticated, service_role;
grant execute on function public.cat_update_view_assignment_status(uuid, text)
  to authenticated, service_role;

-- ── 5) PM 整檔指派／取消 ──────────────────────────────────────────────────────
create or replace function public.cat_pm_assign_file(
  p_file_id uuid,
  p_assignee_user_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_assignee uuid;
  v_written int := 0;
begin
  perform private.p0b_require_admin_file(p_file_id);
  if p_assignee_user_ids is null or cardinality(p_assignee_user_ids) = 0 then
    raise exception using errcode = '22023', message = 'invalid_assignee_list';
  end if;

  for v_assignee in
    select distinct x
    from unnest(p_assignee_user_ids) as t(x)
    where x is not null
  loop
    insert into public.cat_file_assignments (
      file_id, assignee_user_id, assigned_by, status, assigned_at, updated_at
    ) values (
      p_file_id, v_assignee, v_uid, 'assigned', now(), now()
    )
    on conflict (file_id, assignee_user_id) do update
      set status = 'assigned',
          assigned_by = excluded.assigned_by,
          updated_at = now();

    perform public.cat_upsert_translate_stage_assignment(
      p_file_id,
      v_assignee,
      null,
      null,
      null,
      null,
      null,
      'assigned',
      false
    );
    v_written := v_written + 1;
  end loop;

  return jsonb_build_object('ok', true, 'fileId', p_file_id, 'written', v_written);
end;
$$;

create or replace function public.cat_pm_unassign_file(
  p_file_id uuid,
  p_assignee_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_stage_id uuid;
begin
  perform private.p0b_require_admin_file(p_file_id);
  if p_assignee_user_id is null then
    raise exception using errcode = '22023', message = 'invalid_assignee';
  end if;

  delete from public.cat_file_assignments
  where file_id = p_file_id
    and assignee_user_id = p_assignee_user_id;

  select s.id into v_stage_id
  from public.cat_file_workflow_stages s
  where s.file_id = p_file_id
    and s.stage_kind = 'translate'
  limit 1;

  if v_stage_id is not null then
    delete from public.cat_stage_assignments
    where file_id = p_file_id
      and file_workflow_stage_id = v_stage_id
      and assignee_user_id = p_assignee_user_id
      and line_start is null
      and line_end is null
      and view_id is null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'fileId', p_file_id,
    'assigneeUserId', p_assignee_user_id
  );
end;
$$;

revoke all on function public.cat_pm_assign_file(uuid, uuid[])
  from public, anon;
revoke all on function public.cat_pm_unassign_file(uuid, uuid)
  from public, anon;
grant execute on function public.cat_pm_assign_file(uuid, uuid[])
  to authenticated, service_role;
grant execute on function public.cat_pm_unassign_file(uuid, uuid)
  to authenticated, service_role;

-- ── 6) PM／本人 upsert stage + 狀態更新（供 cat-cloud-rpc）──────────────────
create or replace function public.cat_pm_upsert_translate_stage_assignment(
  p_file_id uuid,
  p_assignee_user_id uuid,
  p_collab_row_id text default null,
  p_view_id uuid default null,
  p_scope_label text default null,
  p_line_start integer default null,
  p_line_end integer default null,
  p_workflow_status text default 'assigned',
  p_allow_downgrade boolean default false,
  p_assigned_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_env text := public.current_env();
  v_stage_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if p_file_id is null or p_assignee_user_id is null
     or not exists (
       select 1 from public.cat_files f
       where f.id = p_file_id and f.env = v_env
     ) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if not public.is_admin(v_uid) and p_assignee_user_id is distinct from v_uid then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  perform public.cat_upsert_translate_stage_assignment(
    p_file_id,
    p_assignee_user_id,
    p_collab_row_id,
    p_view_id,
    p_scope_label,
    p_line_start,
    p_line_end,
    p_workflow_status,
    coalesce(p_allow_downgrade, false)
  );

  if p_assigned_by is not null and public.is_admin(v_uid) then
    select s.id into v_stage_id
    from public.cat_file_workflow_stages s
    where s.file_id = p_file_id and s.stage_kind = 'translate'
    limit 1;
    if v_stage_id is not null then
      update public.cat_stage_assignments sa
      set assigned_by = p_assigned_by,
          updated_at = now()
      where sa.file_id = p_file_id
        and sa.file_workflow_stage_id = v_stage_id
        and sa.assignee_user_id = p_assignee_user_id
        and coalesce(sa.line_start, -1) = coalesce(p_line_start, -1)
        and coalesce(sa.line_end, -1) = coalesce(p_line_end, -1);
    end if;
  end if;
end;
$$;

create or replace function public.cat_pm_upsert_review_stage_assignment(
  p_file_id uuid,
  p_assignee_user_id uuid,
  p_collab_row_id text default null,
  p_view_id uuid default null,
  p_scope_label text default null,
  p_line_start integer default null,
  p_line_end integer default null,
  p_workflow_status text default 'assigned',
  p_allow_downgrade boolean default false,
  p_assigned_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_env text := public.current_env();
  v_stage_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if p_file_id is null or p_assignee_user_id is null
     or not exists (
       select 1 from public.cat_files f
       where f.id = p_file_id and f.env = v_env
     ) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if not public.is_admin(v_uid) and p_assignee_user_id is distinct from v_uid then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  perform public.cat_upsert_review_stage_assignment(
    p_file_id,
    p_assignee_user_id,
    p_collab_row_id,
    p_view_id,
    p_scope_label,
    p_line_start,
    p_line_end,
    p_workflow_status,
    coalesce(p_allow_downgrade, false)
  );

  if p_assigned_by is not null and public.is_admin(v_uid) then
    select s.id into v_stage_id
    from public.cat_file_workflow_stages s
    where s.file_id = p_file_id and s.stage_kind = 'review'
    limit 1;
    if v_stage_id is not null then
      update public.cat_stage_assignments sa
      set assigned_by = p_assigned_by,
          updated_at = now()
      where sa.file_id = p_file_id
        and sa.file_workflow_stage_id = v_stage_id
        and sa.assignee_user_id = p_assignee_user_id
        and coalesce(sa.line_start, -1) = coalesce(p_line_start, -1)
        and coalesce(sa.line_end, -1) = coalesce(p_line_end, -1);
    end if;
  end if;
end;
$$;

create or replace function public.cat_update_stage_assignment_workflow_status(
  p_assignment_id uuid,
  p_workflow_status text
)
returns public.cat_stage_assignments
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_env text := public.current_env();
  v_row public.cat_stage_assignments%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if p_assignment_id is null or nullif(trim(coalesce(p_workflow_status, '')), '') is null then
    raise exception using errcode = '22023', message = 'invalid_status_payload';
  end if;

  select sa.* into v_row
  from public.cat_stage_assignments sa
  join public.cat_files f on f.id = sa.file_id
  where sa.id = p_assignment_id
    and f.env = v_env
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if v_row.assignee_user_id is distinct from v_uid and not public.is_admin(v_uid) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  update public.cat_stage_assignments
  set workflow_status = trim(p_workflow_status),
      updated_at = now()
  where id = p_assignment_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.cat_pm_update_file_workflow_stage_status(
  p_stage_id uuid,
  p_status text
)
returns public.cat_file_workflow_stages
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_env text := public.current_env();
  v_row public.cat_file_workflow_stages%rowtype;
begin
  if v_uid is null or not public.is_admin(v_uid) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if p_stage_id is null or nullif(trim(coalesce(p_status, '')), '') is null then
    raise exception using errcode = '22023', message = 'invalid_status_payload';
  end if;

  select s.* into v_row
  from public.cat_file_workflow_stages s
  join public.cat_files f on f.id = s.file_id
  where s.id = p_stage_id
    and f.env = v_env
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  update public.cat_file_workflow_stages
  set status = trim(p_status),
      updated_at = now()
  where id = p_stage_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.cat_pm_upsert_translate_stage_assignment(
  uuid, uuid, text, uuid, text, integer, integer, text, boolean, uuid
) from public, anon;
revoke all on function public.cat_pm_upsert_review_stage_assignment(
  uuid, uuid, text, uuid, text, integer, integer, text, boolean, uuid
) from public, anon;
revoke all on function public.cat_update_stage_assignment_workflow_status(uuid, text)
  from public, anon;
revoke all on function public.cat_pm_update_file_workflow_stage_status(uuid, text)
  from public, anon;

grant execute on function public.cat_pm_upsert_translate_stage_assignment(
  uuid, uuid, text, uuid, text, integer, integer, text, boolean, uuid
) to authenticated, service_role;
grant execute on function public.cat_pm_upsert_review_stage_assignment(
  uuid, uuid, text, uuid, text, integer, integer, text, boolean, uuid
) to authenticated, service_role;
grant execute on function public.cat_update_stage_assignment_workflow_status(uuid, text)
  to authenticated, service_role;
grant execute on function public.cat_pm_update_file_workflow_stage_status(uuid, text)
  to authenticated, service_role;

comment on function public.lms_sync_cat_workflow_for_case(uuid) is
  'P0-B：外層 ACL；僅 admin 同 env 可觸發 sync_cat_workflow_assignments_for_case。';
comment on function public.lms_sync_cat_file_assignments_for_case(uuid) is
  'P0-B：外層 ACL；僅 admin 同 env 可觸發 sync_cat_file_assignments_for_case。';
comment on function public.cat_pm_assign_file(uuid, uuid[]) is
  'P0-B：PM 整檔指派（file_assignments + translate stage）。';
comment on function public.cat_pm_unassign_file(uuid, uuid) is
  'P0-B：PM 整檔取消指派（file_assignments + whole-file stage row）。';
