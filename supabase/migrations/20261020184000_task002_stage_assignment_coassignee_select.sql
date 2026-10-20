-- TASK-002（01:13／1829）：同一檔案的受派者要能讀到該檔全部階段指派。
-- 否則分段審稿完成只鎖「審稿受派者本人」，隔壁譯者仍改得動。
-- 僅隔離驗證；正式庫須另審後 db push。idempotent。

create or replace function private.cat_uid_assigned_to_file(p_file_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(p_file_id is not null and p_uid is not null and (
    exists (
      select 1
      from public.cat_stage_assignments sa
      where sa.file_id = p_file_id
        and sa.assignee_user_id = p_uid
    )
    or exists (
      select 1
      from public.cat_file_assignments fa
      where fa.file_id = p_file_id
        and fa.assignee_user_id = p_uid
        and fa.status is distinct from 'cancelled'
    )
  ), false);
$$;

revoke all on function private.cat_uid_assigned_to_file(uuid, uuid) from public, anon;
grant execute on function private.cat_uid_assigned_to_file(uuid, uuid) to authenticated, service_role;

comment on function private.cat_uid_assigned_to_file(uuid, uuid) is
  'TASK-002：呼叫者是否受派此 CAT 檔（階段或檔案指派）。供 RLS 判斷同檔可見，避免自我參照政策。';

drop policy if exists cat_stage_assignments_select_own_or_admin
  on public.cat_stage_assignments;

create policy cat_stage_assignments_select_own_or_admin
  on public.cat_stage_assignments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.cat_files f
      where f.id = cat_stage_assignments.file_id
        and f.env = public.current_env()
        and (
          public.is_admin((select auth.uid()))
          or cat_stage_assignments.assignee_user_id = (select auth.uid())
          or private.cat_uid_assigned_to_file(
            cat_stage_assignments.file_id,
            (select auth.uid())
          )
        )
    )
  );

comment on policy cat_stage_assignments_select_own_or_admin
  on public.cat_stage_assignments is
  'P0-B SELECT：本人、同檔其他受派者或 admin（同 env）。同檔可見審稿完成範圍才能鎖譯者。突變仍經外層 RPC。';
