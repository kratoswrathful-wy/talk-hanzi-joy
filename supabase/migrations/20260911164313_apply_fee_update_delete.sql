-- TASK-001 費用隔離：管理端列明欄位更新／刪除。
-- 不 GRANT fees SELECT；不讓 fees_visible 可寫。只套隔離庫，非正式發布。

create or replace function public.apply_fee_update(
  p_fee_id uuid,
  p_patch jsonb,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_env text := public.current_env();
  v_row public.fees%rowtype;
  v_unknown text;
  v_ci_unknown text;
  v_client_info jsonb;
  v_status text;
  v_finalized_by uuid;
  v_finalized_at timestamptz;
  v_linked boolean;
  v_updated int;
begin
  if v_uid is null or not public.is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  if p_expected_updated_at is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_updated_at');
  end if;

  if p_patch is null or p_patch = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'empty_patch');
  end if;

  if p_patch ? 'id'
     or p_patch ? 'env'
     or p_patch ? 'created_by'
     or p_patch ? 'created_at'
     or p_patch ? 'updated_at'
     or p_patch ? 'finalized_by'
     or p_patch ? 'finalized_at' then
    return jsonb_build_object('ok', false, 'error', 'server_owned_key');
  end if;

  select k into v_unknown
  from jsonb_object_keys(p_patch) as t(k)
  where k not in (
    'title',
    'assignee',
    'status',
    'internal_note',
    'internal_note_url',
    'task_items',
    'client_info',
    'notes',
    'edit_logs'
  )
  limit 1;

  if v_unknown is not null then
    return jsonb_build_object('ok', false, 'error', 'unknown_patch_key');
  end if;

  if p_patch ? 'status' then
    v_status := p_patch->>'status';
    if v_status is null or v_status not in ('draft', 'finalized') then
      return jsonb_build_object('ok', false, 'error', 'invalid_status');
    end if;
  end if;

  if p_patch ? 'task_items' and jsonb_typeof(p_patch->'task_items') <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_task_items');
  end if;

  if p_patch ? 'notes' and jsonb_typeof(p_patch->'notes') <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_notes');
  end if;

  if p_patch ? 'edit_logs' and jsonb_typeof(p_patch->'edit_logs') <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_edit_logs');
  end if;

  if p_patch ? 'client_info' then
    if jsonb_typeof(p_patch->'client_info') <> 'object' then
      return jsonb_build_object('ok', false, 'error', 'invalid_client_info');
    end if;
    select k into v_ci_unknown
    from jsonb_object_keys(p_patch->'client_info') as t(k)
    where k not in (
      'clientTaskItems',
      'sameCase',
      'isFirstFee',
      'notFirstFee',
      'client',
      'contact',
      'clientCaseId',
      'eciKeywords',
      'clientPoNumber',
      'clientCaseLink',
      'dispatchRoute',
      'reconciled',
      'rateConfirmed',
      'invoiced'
    )
    limit 1;
    if v_ci_unknown is not null then
      return jsonb_build_object('ok', false, 'error', 'unknown_client_info_key');
    end if;
  end if;

  select * into v_row
  from public.fees f
  where f.id = p_fee_id
    and f.env = v_env
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  if v_row.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('ok', false, 'error', 'stale_updated_at');
  end if;

  v_client_info := coalesce(v_row.client_info, '{}'::jsonb);
  if p_patch ? 'client_info' then
    v_client_info := v_client_info || (p_patch->'client_info');
  end if;

  v_status := coalesce(p_patch->>'status', v_row.status);
  v_finalized_by := v_row.finalized_by;
  v_finalized_at := v_row.finalized_at;

  if p_patch ? 'status' and (p_patch->>'status') is distinct from v_row.status then
    select exists (
      select 1 from public.invoice_fees l
      where l.fee_id = p_fee_id and l.env = v_env
    ) or exists (
      select 1 from public.client_invoice_fees l
      where l.fee_id = p_fee_id and l.env = v_env
    ) into v_linked;

    if v_row.status = 'finalized' and p_patch->>'status' = 'draft' and v_linked then
      return jsonb_build_object('ok', false, 'error', 'fee_linked_cannot_revert');
    end if;

    if p_patch->>'status' = 'finalized' then
      v_finalized_by := v_uid;
      v_finalized_at := now();
    elsif p_patch->>'status' = 'draft' then
      v_finalized_by := null;
      v_finalized_at := null;
    end if;
  end if;

  update public.fees f set
    title = case when p_patch ? 'title' then coalesce(p_patch->>'title', '') else f.title end,
    assignee = case when p_patch ? 'assignee' then coalesce(p_patch->>'assignee', '') else f.assignee end,
    status = v_status,
    internal_note = case when p_patch ? 'internal_note' then coalesce(p_patch->>'internal_note', '') else f.internal_note end,
    internal_note_url = case
      when not (p_patch ? 'internal_note_url') then f.internal_note_url
      when p_patch->'internal_note_url' = 'null'::jsonb then null
      else p_patch->>'internal_note_url'
    end,
    task_items = case when p_patch ? 'task_items' then p_patch->'task_items' else f.task_items end,
    client_info = v_client_info,
    notes = case when p_patch ? 'notes' then p_patch->'notes' else f.notes end,
    edit_logs = case when p_patch ? 'edit_logs' then p_patch->'edit_logs' else f.edit_logs end,
    finalized_by = v_finalized_by,
    finalized_at = v_finalized_at
  where f.id = p_fee_id
    and f.env = v_env
    and f.updated_at is not distinct from p_expected_updated_at;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    return jsonb_build_object('ok', false, 'error', 'stale_updated_at');
  end if;

  select * into v_row
  from public.fees f
  where f.id = p_fee_id
    and f.env = v_env;

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'updated_at', v_row.updated_at,
    'status', v_row.status
  );
end;
$$;

revoke all on function public.apply_fee_update(uuid, jsonb, timestamptz)
  from public, anon;
grant execute on function public.apply_fee_update(uuid, jsonb, timestamptz)
  to authenticated, service_role;

comment on function public.apply_fee_update(uuid, jsonb, timestamptz) is
  'TASK-001 隔離：PM／executive 同環境列明欄位更新；client_info 鍵級合併；updated_at 衝突；finalized_* 僅伺服器寫。edit_logs 僅顯示用、不可信。';

create or replace function public.apply_fee_delete(
  p_fee_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_env text := public.current_env();
  v_row public.fees%rowtype;
  v_linked boolean;
  v_deleted int;
begin
  if v_uid is null or not public.is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  if p_expected_updated_at is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_updated_at');
  end if;

  select * into v_row
  from public.fees f
  where f.id = p_fee_id
    and f.env = v_env
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  if v_row.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('ok', false, 'error', 'stale_updated_at');
  end if;

  if v_row.status is distinct from 'draft' then
    return jsonb_build_object('ok', false, 'error', 'fee_not_deletable');
  end if;

  select exists (
    select 1 from public.invoice_fees l
    where l.fee_id = p_fee_id and l.env = v_env
  ) or exists (
    select 1 from public.client_invoice_fees l
    where l.fee_id = p_fee_id and l.env = v_env
  ) into v_linked;

  if v_linked then
    return jsonb_build_object('ok', false, 'error', 'fee_linked_cannot_delete');
  end if;

  delete from public.fees f
  where f.id = p_fee_id
    and f.env = v_env
    and f.status = 'draft'
    and f.updated_at is not distinct from p_expected_updated_at;

  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    return jsonb_build_object('ok', false, 'error', 'delete_unconfirmed');
  end if;

  return jsonb_build_object('ok', true, 'id', p_fee_id, 'deleted', true);
end;
$$;

revoke all on function public.apply_fee_delete(uuid, timestamptz)
  from public, anon;
grant execute on function public.apply_fee_delete(uuid, timestamptz)
  to authenticated, service_role;

comment on function public.apply_fee_delete(uuid, timestamptz) is
  'TASK-001 隔離：僅草稿且無實際請款關聯才刪；讀失敗不得猜成功。不 cascade。';
