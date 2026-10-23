-- TASK-002（2026-10-23）：同一共用列可同時有翻譯與審稿指派。
-- 舊唯一索引 collab_row_id 只能留一筆，審稿寫入又依列號不分階段查找，
-- 會把翻譯指派吃掉。隔離驗收 F 因此沒有翻譯指派、案件頁不回退。
-- 僅隔離驗證；正式庫須另審後 db push。idempotent。

drop index if exists public.cat_stage_assignments_collab_row_uidx;

create unique index if not exists cat_stage_assignments_collab_row_stage_uidx
  on public.cat_stage_assignments (collab_row_id, file_workflow_stage_id)
  where collab_row_id is not null;

create or replace function public.cat_upsert_review_stage_assignment(
  p_file_id uuid,
  p_assignee_user_id uuid,
  p_collab_row_id text,
  p_view_id uuid,
  p_scope_label text,
  p_line_start integer,
  p_line_end integer,
  p_workflow_status text,
  p_allow_downgrade boolean default false
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_review_stage_id uuid;
  v_existing_id uuid;
  v_existing_status text;
  v_stage_status text;
  v_effective text;
  v_collab_row_id text;
begin
  if p_file_id is null or p_assignee_user_id is null then
    return;
  end if;

  perform public.ensure_cat_file_workflow_stages(p_file_id);

  select id, status into v_review_stage_id, v_stage_status
  from public.cat_file_workflow_stages
  where file_id = p_file_id and stage_kind = 'review'
  limit 1;

  if v_review_stage_id is null then
    return;
  end if;

  v_collab_row_id := nullif(trim(coalesce(p_collab_row_id, '')), '');

  if v_collab_row_id is not null then
    select id, workflow_status into v_existing_id, v_existing_status
    from public.cat_stage_assignments
    where collab_row_id = v_collab_row_id
      and file_workflow_stage_id = v_review_stage_id
    limit 1;
  else
    select id, workflow_status into v_existing_id, v_existing_status
    from public.cat_stage_assignments
    where file_id = p_file_id
      and file_workflow_stage_id = v_review_stage_id
      and assignee_user_id = p_assignee_user_id
      and collab_row_id is null
      and coalesce(view_id::text, '') = coalesce(p_view_id::text, '')
      and coalesce(line_start, -1) = coalesce(p_line_start, -1)
      and coalesce(line_end, -1) = coalesce(p_line_end, -1)
    limit 1;
  end if;

  v_effective := public.cat_resolve_effective_upsert_workflow_status(
    v_stage_status,
    v_existing_status,
    coalesce(nullif(trim(p_workflow_status), ''), 'assigned'),
    p_allow_downgrade
  );

  if v_existing_id is not null then
    update public.cat_stage_assignments
    set assignee_user_id = p_assignee_user_id,
        view_id = p_view_id,
        file_workflow_stage_id = v_review_stage_id,
        scope_label = nullif(trim(coalesce(p_scope_label, '')), ''),
        line_start = p_line_start,
        line_end = p_line_end,
        workflow_status = v_effective,
        collab_row_id = v_collab_row_id,
        updated_at = now()
    where id = v_existing_id;
  else
    insert into public.cat_stage_assignments (
      file_id, view_id, file_workflow_stage_id, assignee_user_id,
      line_start, line_end, scope_label, workflow_status, collab_row_id,
      assigned_at, updated_at
    ) values (
      p_file_id, p_view_id, v_review_stage_id, p_assignee_user_id,
      p_line_start, p_line_end, nullif(trim(coalesce(p_scope_label, '')), ''),
      v_effective, v_collab_row_id, now(), now()
    );
  end if;
end;
$$;

comment on function public.cat_upsert_review_stage_assignment(uuid, uuid, text, uuid, text, integer, integer, text, boolean) is
  'TASK-002：審稿指派只找審稿階段；與翻譯指派可共用同一列編號';

revoke all on function public.cat_upsert_review_stage_assignment(uuid, uuid, text, uuid, text, integer, integer, text, boolean) from public, anon;
grant execute on function public.cat_upsert_review_stage_assignment(uuid, uuid, text, uuid, text, integer, integer, text, boolean) to authenticated, service_role;
