-- P0-B ACL harden（續）：PM-only upsert、狀態 allowlist／transition、assignee 驗證、
-- 關閉 file／view assignment 直寫、apply_case_update unknown key／updated_at。
-- 本機／隔離庫草稿；NOT deployable until verified。idempotent。
--
-- ── Status transition table（選定規則；寫入註解供覆核）─────────────────────
-- Legal allowlists（對齊既有 CHECK）：
--   file／view assignment status : assigned | in_progress | completed | cancelled
--   stage workflow_status        : assigned | in_progress | completed
--   file workflow stage status   : pending | active | completed
--
-- Non-admin（assignee 本人）僅允許正向：
--   assigned → in_progress
--   in_progress → completed
--   （禁止 cancelled；禁止跳階；禁止回退）
-- Admin：可設 allowlist 內任意合法值（含 cancelled／跳階／回退）。
-- cat_pm_update_file_workflow_stage_status 本就 admin-only；僅強制 allowlist。

-- ── 0) 共用 helper ───────────────────────────────────────────────────────────
create or replace function private.p0b_assert_status_transition(
  p_kind text,
  p_from text,
  p_to text,
  p_is_admin boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_from text := nullif(trim(coalesce(p_from, '')), '');
  v_to text := nullif(trim(coalesce(p_to, '')), '');
  v_legal boolean := false;
  v_ok boolean := false;
begin
  if v_to is null then
    raise exception using errcode = '22023', message = 'invalid_status';
  end if;

  if p_kind in ('file_asg', 'view_asg') then
    v_legal := v_to in ('assigned', 'in_progress', 'completed', 'cancelled');
  elsif p_kind = 'stage_wf' then
    v_legal := v_to in ('assigned', 'in_progress', 'completed');
  elsif p_kind = 'file_wf' then
    v_legal := v_to in ('pending', 'active', 'completed');
  else
    raise exception using errcode = '22023', message = 'invalid_status_kind';
  end if;

  if not v_legal then
    raise exception using errcode = '22023', message = 'invalid_status';
  end if;

  -- 同值視為 no-op 允許（呼叫端可選擇略過 UPDATE）
  if v_from is not distinct from v_to then
    return;
  end if;

  if coalesce(p_is_admin, false) then
    return;
  end if;

  -- Non-admin transitions
  if p_kind in ('file_asg', 'view_asg', 'stage_wf') then
    v_ok := (v_from = 'assigned' and v_to = 'in_progress')
         or (v_from = 'in_progress' and v_to = 'completed');
  elsif p_kind = 'file_wf' then
    -- 此路徑僅 admin 呼叫；理論上不會走到 non-admin
    v_ok := false;
  end if;

  if not v_ok then
    raise exception using errcode = '22023', message = 'invalid_status_transition';
  end if;
end;
$$;

revoke all on function private.p0b_assert_status_transition(text, text, text, boolean)
  from public, anon, authenticated;

create or replace function private.p0b_require_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_env text := public.current_env();
begin
  -- 必須存在於 profiles，且與呼叫者 current_env() 一致（is_test ↔ test／production）
  if p_user_id is null
     or not exists (
       select 1
       from public.profiles pr
       where pr.id = p_user_id
         and (
           (v_env = 'test' and pr.is_test is true)
           or (v_env is distinct from 'test' and coalesce(pr.is_test, false) is not true)
         )
     )
  then
    raise exception using errcode = '22023', message = 'invalid_assignee';
  end if;
end;
$$;

revoke all on function private.p0b_require_profile(uuid)
  from public, anon, authenticated;

create or replace function private.p0b_require_admin_view(p_view_id uuid)
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
  if p_view_id is null
     or not exists (
       select 1
       from public.cat_views v
       join public.cat_projects p on p.id = v.project_id
       where v.id = p_view_id
         and p.env = v_env
     ) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
end;
$$;

revoke all on function private.p0b_require_admin_view(uuid)
  from public, anon, authenticated;

-- ── 1) 指派狀態 RPC：allowlist + transition ─────────────────────────────────
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
  v_from text;
  v_to text := trim(coalesce(p_status, ''));
  v_is_admin boolean;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if p_assignment_id is null or nullif(v_to, '') is null then
    raise exception using errcode = '22023', message = 'invalid_status_payload';
  end if;

  select a.assignee_user_id, a.file_id, a.status
    into v_assignee, v_file_id, v_from
  from public.cat_file_assignments a
  join public.cat_files f on f.id = a.file_id
  where a.id = p_assignment_id
    and f.env = v_env
  for update of a;

  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  v_is_admin := public.is_admin(v_uid);
  if v_assignee is distinct from v_uid and not v_is_admin then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  perform private.p0b_assert_status_transition('file_asg', v_from, v_to, v_is_admin);

  update public.cat_file_assignments
  set status = v_to,
      updated_at = now()
  where id = p_assignment_id;

  return jsonb_build_object('ok', true, 'id', p_assignment_id, 'status', v_to);
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
  v_from text;
  v_to text := trim(coalesce(p_status, ''));
  v_is_admin boolean;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if p_assignment_id is null or nullif(v_to, '') is null then
    raise exception using errcode = '22023', message = 'invalid_status_payload';
  end if;

  select a.assignee_user_id, a.status
    into v_assignee, v_from
  from public.cat_view_assignments a
  join public.cat_views v on v.id = a.view_id
  join public.cat_projects p on p.id = v.project_id
  where a.id = p_assignment_id
    and p.env = v_env
  for update of a;

  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  v_is_admin := public.is_admin(v_uid);
  if v_assignee is distinct from v_uid and not v_is_admin then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  perform private.p0b_assert_status_transition('view_asg', v_from, v_to, v_is_admin);

  update public.cat_view_assignments
  set status = v_to,
      updated_at = now()
  where id = p_assignment_id;

  return jsonb_build_object('ok', true, 'id', p_assignment_id, 'status', v_to);
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
  v_to text := trim(coalesce(p_workflow_status, ''));
  v_is_admin boolean;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if p_assignment_id is null or nullif(v_to, '') is null then
    raise exception using errcode = '22023', message = 'invalid_status_payload';
  end if;

  select sa.* into v_row
  from public.cat_stage_assignments sa
  join public.cat_files f on f.id = sa.file_id
  where sa.id = p_assignment_id
    and f.env = v_env
  for update of sa;

  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  v_is_admin := public.is_admin(v_uid);
  if v_row.assignee_user_id is distinct from v_uid and not v_is_admin then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  perform private.p0b_assert_status_transition(
    'stage_wf', v_row.workflow_status, v_to, v_is_admin
  );

  update public.cat_stage_assignments
  set workflow_status = v_to,
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
  v_to text := trim(coalesce(p_status, ''));
begin
  if v_uid is null or not public.is_admin(v_uid) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if p_stage_id is null or nullif(v_to, '') is null then
    raise exception using errcode = '22023', message = 'invalid_status_payload';
  end if;

  select s.* into v_row
  from public.cat_file_workflow_stages s
  join public.cat_files f on f.id = s.file_id
  where s.id = p_stage_id
    and f.env = v_env
  for update of s;

  if not found then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  -- admin-only：allowlist 內任意合法值
  perform private.p0b_assert_status_transition(
    'file_wf', v_row.status, v_to, true
  );

  update public.cat_file_workflow_stages
  set status = v_to,
      updated_at = now()
  where id = p_stage_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.cat_update_file_assignment_status(uuid, text)
  from public, anon;
revoke all on function public.cat_update_view_assignment_status(uuid, text)
  from public, anon;
revoke all on function public.cat_update_stage_assignment_workflow_status(uuid, text)
  from public, anon;
revoke all on function public.cat_pm_update_file_workflow_stage_status(uuid, text)
  from public, anon;
grant execute on function public.cat_update_file_assignment_status(uuid, text)
  to authenticated, service_role;
grant execute on function public.cat_update_view_assignment_status(uuid, text)
  to authenticated, service_role;
grant execute on function public.cat_update_stage_assignment_workflow_status(uuid, text)
  to authenticated, service_role;
grant execute on function public.cat_pm_update_file_workflow_stage_status(uuid, text)
  to authenticated, service_role;

-- ── 2) Stage upsert：僅 PM／執行長；成員不得自指派 ─────────────────────────
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
  v_stage_id uuid;
  v_wf text := trim(coalesce(p_workflow_status, 'assigned'));
begin
  perform private.p0b_require_admin_file(p_file_id);
  perform private.p0b_require_profile(p_assignee_user_id);

  if nullif(v_wf, '') is null
     or v_wf not in ('assigned', 'in_progress', 'completed') then
    raise exception using errcode = '22023', message = 'invalid_status';
  end if;

  perform public.cat_upsert_translate_stage_assignment(
    p_file_id,
    p_assignee_user_id,
    p_collab_row_id,
    p_view_id,
    p_scope_label,
    p_line_start,
    p_line_end,
    v_wf,
    coalesce(p_allow_downgrade, false)
  );

  if p_assigned_by is not null then
    perform private.p0b_require_profile(p_assigned_by);
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
  v_stage_id uuid;
  v_wf text := trim(coalesce(p_workflow_status, 'assigned'));
begin
  perform private.p0b_require_admin_file(p_file_id);
  perform private.p0b_require_profile(p_assignee_user_id);

  if nullif(v_wf, '') is null
     or v_wf not in ('assigned', 'in_progress', 'completed') then
    raise exception using errcode = '22023', message = 'invalid_status';
  end if;

  perform public.cat_upsert_review_stage_assignment(
    p_file_id,
    p_assignee_user_id,
    p_collab_row_id,
    p_view_id,
    p_scope_label,
    p_line_start,
    p_line_end,
    v_wf,
    coalesce(p_allow_downgrade, false)
  );

  if p_assigned_by is not null then
    perform private.p0b_require_profile(p_assigned_by);
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

revoke all on function public.cat_pm_upsert_translate_stage_assignment(
  uuid, uuid, text, uuid, text, integer, integer, text, boolean, uuid
) from public, anon;
revoke all on function public.cat_pm_upsert_review_stage_assignment(
  uuid, uuid, text, uuid, text, integer, integer, text, boolean, uuid
) from public, anon;
grant execute on function public.cat_pm_upsert_translate_stage_assignment(
  uuid, uuid, text, uuid, text, integer, integer, text, boolean, uuid
) to authenticated, service_role;
grant execute on function public.cat_pm_upsert_review_stage_assignment(
  uuid, uuid, text, uuid, text, integer, integer, text, boolean, uuid
) to authenticated, service_role;

comment on function public.cat_pm_upsert_translate_stage_assignment(
  uuid, uuid, text, uuid, text, integer, integer, text, boolean, uuid
) is
  'P0-B harden：僅 admin 同 env 可 upsert；成員狀態變更請走 cat_update_stage_assignment_workflow_status。';
comment on function public.cat_pm_upsert_review_stage_assignment(
  uuid, uuid, text, uuid, text, integer, integer, text, boolean, uuid
) is
  'P0-B harden：僅 admin 同 env 可 upsert；成員狀態變更請走 cat_update_stage_assignment_workflow_status。';

-- ── 3) cat_pm_assign_file：profiles 存在＋同 env 檔 ──────────────────────────
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

  -- 拒絕陣列內 null／缺 profiles
  if exists (
    select 1 from unnest(p_assignee_user_ids) as t(x) where x is null
  ) then
    raise exception using errcode = '22023', message = 'invalid_assignee';
  end if;

  for v_assignee in
    select distinct x
    from unnest(p_assignee_user_ids) as t(x)
  loop
    perform private.p0b_require_profile(v_assignee);

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

revoke all on function public.cat_pm_assign_file(uuid, uuid[])
  from public, anon;
grant execute on function public.cat_pm_assign_file(uuid, uuid[])
  to authenticated, service_role;

comment on function public.cat_pm_assign_file(uuid, uuid[]) is
  'P0-B harden：PM 整檔指派；assignee 必須存在於 profiles；檔案須同 current_env()。';

-- ── 4) 關閉 file／view assignment 直寫 DML ───────────────────────────────────
drop policy if exists cat_file_assignments_admin_write
  on public.cat_file_assignments;
drop policy if exists cat_view_assignments_admin_write
  on public.cat_view_assignments;

revoke insert, update, delete on public.cat_file_assignments from authenticated;
revoke insert, update, delete on public.cat_view_assignments from authenticated;
grant select on public.cat_file_assignments to authenticated;
grant select on public.cat_view_assignments to authenticated;

comment on policy cat_file_assignments_select_own_or_admin
  on public.cat_file_assignments is
  'P0-B harden：僅 SELECT；突變經 cat_pm_assign_file／cat_update_file_assignment_status 等 RPC。';
comment on policy cat_view_assignments_select_own_or_admin
  on public.cat_view_assignments is
  'P0-B harden：僅 SELECT；突變經 cat_pm_assign_view／cat_update_view_assignment_status 等 RPC。';

-- cases：UPDATE 改走 apply_case_update（SECURITY DEFINER）；收回 authenticated UPDATE 權限。
-- 保留 INSERT／DELETE 權限＋既有 admin policy（case-store 仍直寫建立／刪除）。
revoke update on public.cases from authenticated;

-- ── 5) View 指派薄 RPC（取代 PostgREST upsert／update）──────────────────────
create or replace function public.cat_pm_assign_view(
  p_view_id uuid,
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
  v_ids uuid[] := '{}';
  v_id uuid;
begin
  perform private.p0b_require_admin_view(p_view_id);
  if p_assignee_user_ids is null or cardinality(p_assignee_user_ids) = 0 then
    raise exception using errcode = '22023', message = 'invalid_assignee_list';
  end if;
  if exists (
    select 1 from unnest(p_assignee_user_ids) as t(x) where x is null
  ) then
    raise exception using errcode = '22023', message = 'invalid_assignee';
  end if;

  for v_assignee in
    select distinct x from unnest(p_assignee_user_ids) as t(x)
  loop
    perform private.p0b_require_profile(v_assignee);

    insert into public.cat_view_assignments (
      view_id, assignee_user_id, assigned_by, status, assigned_at, updated_at
    ) values (
      p_view_id, v_assignee, v_uid, 'assigned', now(), now()
    )
    on conflict (view_id, assignee_user_id) do update
      set status = 'assigned',
          assigned_by = excluded.assigned_by,
          updated_at = now()
    returning id into v_id;

    v_ids := array_append(v_ids, v_id);
    v_written := v_written + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'viewId', p_view_id,
    'written', v_written,
    'ids', to_jsonb(v_ids)
  );
end;
$$;

create or replace function public.cat_pm_unassign_view(
  p_view_id uuid,
  p_assignee_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform private.p0b_require_admin_view(p_view_id);
  if p_assignee_user_id is null then
    raise exception using errcode = '22023', message = 'invalid_assignee';
  end if;

  update public.cat_view_assignments
  set status = 'cancelled',
      updated_at = now()
  where view_id = p_view_id
    and assignee_user_id = p_assignee_user_id;

  return jsonb_build_object(
    'ok', true,
    'viewId', p_view_id,
    'assigneeUserId', p_assignee_user_id
  );
end;
$$;

revoke all on function public.cat_pm_assign_view(uuid, uuid[])
  from public, anon;
revoke all on function public.cat_pm_unassign_view(uuid, uuid)
  from public, anon;
grant execute on function public.cat_pm_assign_view(uuid, uuid[])
  to authenticated, service_role;
grant execute on function public.cat_pm_unassign_view(uuid, uuid)
  to authenticated, service_role;

comment on function public.cat_pm_assign_view(uuid, uuid[]) is
  'P0-B harden：PM 句段集指派；assignee 須在 profiles；view 同 current_env()。';
comment on function public.cat_pm_unassign_view(uuid, uuid) is
  'P0-B harden：PM 句段集取消指派（status=cancelled）。';

-- ── 6) apply_case_update：剝除 updated_at、拒絕未知鍵 ───────────────────────
create or replace function public.apply_case_update(
  p_case_id uuid,
  p_patch jsonb,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_env text := public.current_env();
  v_row public.cases%rowtype;
  v_patch public.cases%rowtype;
  v_patch_clean jsonb;
  v_updated_at timestamptz;
  v_revision bigint;
  v_unknown text;
begin
  if v_uid is null or not public.is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  if p_expected_revision is null or p_expected_revision < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_revision');
  end if;

  if p_patch is null or p_patch = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'empty_patch');
  end if;

  -- 禁止經 patch 竄改身份／環境／版號／時間戳／憑證／工具敏感鍵
  v_patch_clean := p_patch
    - 'id'
    - 'env'
    - 'created_at'
    - 'created_by'
    - 'revision'
    - 'updated_at'
    - 'login_account'
    - 'login_password'
    - 'login_url'
    - 'other_login_info'
    - 'tools'
    - 'question_tools'
    - 'tool_field_values';

  if v_patch_clean = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'empty_patch_after_filter');
  end if;

  -- 未知鍵：不突變、不 bump revision
  select k into v_unknown
  from jsonb_object_keys(v_patch_clean) as t(k)
  where k not in (
    'billing_unit',
    'body_content',
    'case_reference_materials',
    'cat_tool_enabled',
    'category',
    'change_log_enabled_at',
    'client',
    'client_case_link',
    'client_guidelines',
    'client_po_number',
    'client_question_form',
    'client_receipt',
    'client_receipt_files',
    'collab_count',
    'collab_rows',
    'comments',
    'common_info',
    'common_links',
    'contact',
    'custom_guidelines_url',
    'decline_records',
    'delivery_method',
    'delivery_method_files',
    'dispatch_route',
    'edit_logs',
    'execution_tool',
    'fee_entry',
    'icon_url',
    'inquiry_note',
    'inquiry_slack_records',
    'internal_comments',
    'internal_note_form',
    'internal_records',
    'internal_review_final',
    'keyword',
    'multi_collab',
    'online_tool_filename',
    'online_tool_project',
    'process_note',
    'question_form',
    'reference_materials',
    'review_deadline',
    'review_rows',
    'reviewer',
    'series_reference_materials',
    'source_files',
    'status',
    'task_status',
    'title',
    'track_changes',
    'translation_deadline',
    'translator',
    'translator_final',
    'unit_count',
    'work_groups',
    'work_type',
    'working_files'
  )
  limit 1;

  if v_unknown is not null then
    return jsonb_build_object('ok', false, 'error', 'unknown_patch_key');
  end if;

  select * into v_row
  from public.cases c
  where c.id = p_case_id
    and c.env = v_env
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  if v_row.revision is distinct from p_expected_revision then
    return jsonb_build_object('ok', false, 'error', 'stale_revision');
  end if;

  v_patch := jsonb_populate_record(v_row, v_patch_clean);

  update public.cases c set
    billing_unit = v_patch.billing_unit,
    body_content = v_patch.body_content,
    case_reference_materials = v_patch.case_reference_materials,
    cat_tool_enabled = v_patch.cat_tool_enabled,
    category = v_patch.category,
    change_log_enabled_at = v_patch.change_log_enabled_at,
    client = v_patch.client,
    client_case_link = v_patch.client_case_link,
    client_guidelines = v_patch.client_guidelines,
    client_po_number = v_patch.client_po_number,
    client_question_form = v_patch.client_question_form,
    client_receipt = v_patch.client_receipt,
    client_receipt_files = v_patch.client_receipt_files,
    collab_count = v_patch.collab_count,
    collab_rows = v_patch.collab_rows,
    comments = v_patch.comments,
    common_info = v_patch.common_info,
    common_links = v_patch.common_links,
    contact = v_patch.contact,
    custom_guidelines_url = v_patch.custom_guidelines_url,
    decline_records = v_patch.decline_records,
    delivery_method = v_patch.delivery_method,
    delivery_method_files = v_patch.delivery_method_files,
    dispatch_route = v_patch.dispatch_route,
    edit_logs = v_patch.edit_logs,
    execution_tool = v_patch.execution_tool,
    fee_entry = v_patch.fee_entry,
    icon_url = v_patch.icon_url,
    inquiry_note = v_patch.inquiry_note,
    inquiry_slack_records = v_patch.inquiry_slack_records,
    internal_comments = v_patch.internal_comments,
    internal_note_form = v_patch.internal_note_form,
    internal_records = v_patch.internal_records,
    internal_review_final = v_patch.internal_review_final,
    keyword = v_patch.keyword,
    multi_collab = v_patch.multi_collab,
    online_tool_filename = v_patch.online_tool_filename,
    online_tool_project = v_patch.online_tool_project,
    process_note = v_patch.process_note,
    question_form = v_patch.question_form,
    reference_materials = v_patch.reference_materials,
    review_deadline = v_patch.review_deadline,
    review_rows = v_patch.review_rows,
    reviewer = v_patch.reviewer,
    series_reference_materials = v_patch.series_reference_materials,
    source_files = v_patch.source_files,
    status = v_patch.status,
    task_status = v_patch.task_status,
    title = v_patch.title,
    track_changes = v_patch.track_changes,
    translation_deadline = v_patch.translation_deadline,
    translator = v_patch.translator,
    translator_final = v_patch.translator_final,
    unit_count = v_patch.unit_count,
    updated_at = now(),
    work_groups = v_patch.work_groups,
    work_type = v_patch.work_type,
    working_files = v_patch.working_files
  where c.id = p_case_id
    and c.revision = p_expected_revision
    and c.env = v_env
  returning c.updated_at, c.revision into v_updated_at, v_revision;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'stale_revision');
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', p_case_id,
    'updated_at', v_updated_at,
    'revision', v_revision
  );
end;
$$;

revoke all on function public.apply_case_update(uuid, jsonb, bigint)
  from public, anon;
grant execute on function public.apply_case_update(uuid, jsonb, bigint)
  to authenticated, service_role;

comment on function public.apply_case_update(uuid, jsonb, bigint) is
  'P0-B harden：admin-only；剝除 updated_at／憑證／工具鍵；未知鍵回 unknown_patch_key 且不突變；updated_at 一律 now()。';
