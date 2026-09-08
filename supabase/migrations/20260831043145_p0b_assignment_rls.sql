-- P0-B3：workflow／stage 指派表僅 SELECT；突變改走 P0-B2 外層 RPC。
-- 同步收緊 file／view assignments：assignee 不得直寫 UPDATE。
-- 本機／隔離庫草稿；NOT deployable until verified。idempotent。

-- ── 1) cat_file_workflow_stages：僅 SELECT ────────────────────────────────────
drop policy if exists "cat_file_workflow_stages_rw_authenticated"
  on public.cat_file_workflow_stages;
drop policy if exists cat_file_workflow_stages_select_own_or_admin
  on public.cat_file_workflow_stages;

create policy cat_file_workflow_stages_select_own_or_admin
  on public.cat_file_workflow_stages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.cat_files f
      where f.id = cat_file_workflow_stages.file_id
        and f.env = public.current_env()
        and (
          public.is_admin((select auth.uid()))
          or exists (
            select 1 from public.cat_file_assignments fa
            where fa.file_id = f.id
              and fa.assignee_user_id = (select auth.uid())
              and fa.status is distinct from 'cancelled'
          )
          or exists (
            select 1 from public.cat_stage_assignments sa
            where sa.file_id = f.id
              and sa.assignee_user_id = (select auth.uid())
          )
        )
    )
  );

revoke insert, update, delete on public.cat_file_workflow_stages from authenticated;
grant select on public.cat_file_workflow_stages to authenticated;

-- ── 2) cat_stage_assignments：僅 SELECT ───────────────────────────────────────
drop policy if exists "cat_stage_assignments_rw_authenticated"
  on public.cat_stage_assignments;
drop policy if exists cat_stage_assignments_select_own_or_admin
  on public.cat_stage_assignments;

create policy cat_stage_assignments_select_own_or_admin
  on public.cat_stage_assignments
  for select
  to authenticated
  using (
    (
      assignee_user_id = (select auth.uid())
      and exists (
        select 1 from public.cat_files f
        where f.id = cat_stage_assignments.file_id
          and f.env = public.current_env()
      )
    )
    or (
      public.is_admin((select auth.uid()))
      and exists (
        select 1 from public.cat_files f
        where f.id = cat_stage_assignments.file_id
          and f.env = public.current_env()
      )
    )
  );

revoke insert, update, delete on public.cat_stage_assignments from authenticated;
grant select on public.cat_stage_assignments to authenticated;

-- ── 3) cat_file_assignments：assignee 不得直寫；admin 同 env 可管理 ──────────
drop policy if exists "cat_file_assignments_update_own_status"
  on public.cat_file_assignments;
drop policy if exists "cat_file_assignments_self_insert"
  on public.cat_file_assignments;
drop policy if exists "cat_file_assignments_manage_admin"
  on public.cat_file_assignments;
drop policy if exists "cat_file_assignments_read_own"
  on public.cat_file_assignments;
drop policy if exists cat_file_assignments_select_own_or_admin
  on public.cat_file_assignments;
drop policy if exists cat_file_assignments_admin_write
  on public.cat_file_assignments;

create policy cat_file_assignments_select_own_or_admin
  on public.cat_file_assignments
  for select
  to authenticated
  using (
    (
      assignee_user_id = (select auth.uid())
      and exists (
        select 1 from public.cat_files f
        where f.id = cat_file_assignments.file_id
          and f.env = public.current_env()
      )
    )
    or (
      public.is_admin((select auth.uid()))
      and exists (
        select 1 from public.cat_files f
        where f.id = cat_file_assignments.file_id
          and f.env = public.current_env()
      )
    )
  );

-- PM 仍可經 PostgREST 管理（db.assignView 等路徑尚未全部外層化時的過渡）；
-- assignee 無 INSERT/UPDATE/DELETE。狀態變更請走 cat_update_file_assignment_status。
create policy cat_file_assignments_admin_write
  on public.cat_file_assignments
  for all
  to authenticated
  using (
    public.is_admin((select auth.uid()))
    and exists (
      select 1 from public.cat_files f
      where f.id = cat_file_assignments.file_id
        and f.env = public.current_env()
    )
  )
  with check (
    public.is_admin((select auth.uid()))
    and exists (
      select 1 from public.cat_files f
      where f.id = cat_file_assignments.file_id
        and f.env = public.current_env()
    )
  );

-- ── 4) cat_view_assignments：assignee 不得直寫 ───────────────────────────────
drop policy if exists "cat_view_assignments_update_own_status"
  on public.cat_view_assignments;
drop policy if exists "cat_view_assignments_manage_admin"
  on public.cat_view_assignments;
drop policy if exists "cat_view_assignments_read_own"
  on public.cat_view_assignments;
drop policy if exists cat_view_assignments_select_own_or_admin
  on public.cat_view_assignments;
drop policy if exists cat_view_assignments_admin_write
  on public.cat_view_assignments;

create policy cat_view_assignments_select_own_or_admin
  on public.cat_view_assignments
  for select
  to authenticated
  using (
    (
      assignee_user_id = (select auth.uid())
      and exists (
        select 1
        from public.cat_views v
        join public.cat_projects p on p.id = v.project_id
        where v.id = cat_view_assignments.view_id
          and p.env = public.current_env()
      )
    )
    or (
      public.is_admin((select auth.uid()))
      and exists (
        select 1
        from public.cat_views v
        join public.cat_projects p on p.id = v.project_id
        where v.id = cat_view_assignments.view_id
          and p.env = public.current_env()
      )
    )
  );

create policy cat_view_assignments_admin_write
  on public.cat_view_assignments
  for all
  to authenticated
  using (
    public.is_admin((select auth.uid()))
    and exists (
      select 1
      from public.cat_views v
      join public.cat_projects p on p.id = v.project_id
      where v.id = cat_view_assignments.view_id
        and p.env = public.current_env()
    )
  )
  with check (
    public.is_admin((select auth.uid()))
    and exists (
      select 1
      from public.cat_views v
      join public.cat_projects p on p.id = v.project_id
      where v.id = cat_view_assignments.view_id
        and p.env = public.current_env()
    )
  );

comment on policy cat_file_workflow_stages_select_own_or_admin
  on public.cat_file_workflow_stages is
  'P0-B：僅 SELECT；突變經 cat_pm_update_file_workflow_stage_status 等 RPC。';
comment on policy cat_stage_assignments_select_own_or_admin
  on public.cat_stage_assignments is
  'P0-B：僅 SELECT（本人或 admin 同 env）；突變經外層 RPC。';
comment on policy cat_file_assignments_select_own_or_admin
  on public.cat_file_assignments is
  'P0-B：assignee／admin 可讀；assignee 不得 UPDATE（狀態走 RPC）。';
comment on policy cat_view_assignments_select_own_or_admin
  on public.cat_view_assignments is
  'P0-B：assignee／admin 可讀；assignee 不得 UPDATE（狀態走 RPC）。';
