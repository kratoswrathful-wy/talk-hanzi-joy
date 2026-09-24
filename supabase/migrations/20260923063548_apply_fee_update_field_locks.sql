-- TASK-001 費用隔離：在既有 apply_fee_update 內補上已確認鎖定規則。
-- 共用隔離實際套用版號為本檔 20260923063548（MCP apply_migration 名稱 apply_fee_update_field_locks）。
-- 不覆寫 20260923033303；角色／環境／版本契約不變。不新增入單唯一限制、留言接口或新表。
-- 規則來源：src/lib/fee-field-locks.ts 與費用頁已確認文案（對帳／費率無誤後不得改金額）。
-- 合法取消勾選仍允許：費率無誤（未入稿費請款且未定案）、對帳／請款完成（未入客戶請款）。sameCase 永不鎖。
-- 無 executive 例外。internal_note_url JSON null 改為明確拒絕，不再觸發欄位 NOT NULL 例外。

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
  v_in_tr boolean;
  v_in_ci boolean;
  v_final boolean;
  v_rate boolean;
  v_recon boolean;
  v_any_lock boolean;
  v_ci_cur jsonb;
  v_ci_patch jsonb;
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

  if p_patch ? 'internal_note_url' and p_patch->'internal_note_url' = 'null'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'invalid_internal_note_url');
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

  select exists (
    select 1 from public.invoice_fees l
    where l.fee_id = p_fee_id and l.env = v_env
  ) into v_in_tr;

  select exists (
    select 1 from public.client_invoice_fees l
    where l.fee_id = p_fee_id and l.env = v_env
  ) into v_in_ci;

  v_ci_cur := coalesce(v_row.client_info, '{}'::jsonb);
  v_final := v_row.status = 'finalized';
  v_rate := coalesce((v_ci_cur->>'rateConfirmed')::boolean, false);
  v_recon := coalesce((v_ci_cur->>'reconciled')::boolean, false);
  v_any_lock := v_final or v_rate or v_recon or v_in_tr or v_in_ci;

  if p_patch ? 'title'
     and (p_patch->>'title') is distinct from v_row.title
     and v_final then
    return jsonb_build_object('ok', false, 'error', 'field_locked', 'field', 'title');
  end if;

  if p_patch ? 'assignee'
     and (p_patch->>'assignee') is distinct from v_row.assignee
     and (v_final or v_rate) then
    return jsonb_build_object('ok', false, 'error', 'field_locked', 'field', 'assignee');
  end if;

  if p_patch ? 'status'
     and (p_patch->>'status') is distinct from v_row.status
     and v_in_tr then
    return jsonb_build_object('ok', false, 'error', 'field_locked', 'field', 'status');
  end if;

  if p_patch ? 'task_items'
     and (p_patch->'task_items') is distinct from v_row.task_items
     and v_rate then
    return jsonb_build_object('ok', false, 'error', 'field_locked', 'field', 'task_items');
  end if;

  if p_patch ? 'internal_note'
     and (p_patch->>'internal_note') is distinct from v_row.internal_note
     and (v_row.internal_note <> '' or v_any_lock) then
    return jsonb_build_object('ok', false, 'error', 'field_locked', 'field', 'internal_note');
  end if;

  if p_patch ? 'client_info' then
    v_ci_patch := p_patch->'client_info';

    if v_ci_patch ? 'rateConfirmed'
       and (v_ci_patch->'rateConfirmed') is distinct from (v_ci_cur->'rateConfirmed')
       and (v_in_tr or v_final) then
      return jsonb_build_object('ok', false, 'error', 'field_locked', 'field', 'rateConfirmed');
    end if;

    if v_ci_patch ? 'reconciled'
       and (v_ci_patch->'reconciled') is distinct from (v_ci_cur->'reconciled')
       and v_in_ci then
      return jsonb_build_object('ok', false, 'error', 'field_locked', 'field', 'reconciled');
    end if;

    if v_ci_patch ? 'invoiced'
       and (v_ci_patch->'invoiced') is distinct from (v_ci_cur->'invoiced')
       and v_in_ci then
      return jsonb_build_object('ok', false, 'error', 'field_locked', 'field', 'invoiced');
    end if;

    if (v_in_ci or v_recon) then
      if v_ci_patch ? 'client'
         and (v_ci_patch->>'client') is distinct from (v_ci_cur->>'client') then
        return jsonb_build_object('ok', false, 'error', 'field_locked', 'field', 'client');
      end if;
      if v_ci_patch ? 'contact'
         and (v_ci_patch->>'contact') is distinct from (v_ci_cur->>'contact') then
        return jsonb_build_object('ok', false, 'error', 'field_locked', 'field', 'contact');
      end if;
      if v_ci_patch ? 'clientCaseId'
         and (v_ci_patch->>'clientCaseId') is distinct from (v_ci_cur->>'clientCaseId') then
        return jsonb_build_object('ok', false, 'error', 'field_locked', 'field', 'clientCaseId');
      end if;
      if v_ci_patch ? 'clientPoNumber'
         and (v_ci_patch->>'clientPoNumber') is distinct from (v_ci_cur->>'clientPoNumber') then
        return jsonb_build_object('ok', false, 'error', 'field_locked', 'field', 'clientPoNumber');
      end if;
      if v_ci_patch ? 'dispatchRoute'
         and (v_ci_patch->>'dispatchRoute') is distinct from (v_ci_cur->>'dispatchRoute') then
        return jsonb_build_object('ok', false, 'error', 'field_locked', 'field', 'dispatchRoute');
      end if;
      if v_ci_patch ? 'clientTaskItems'
         and (v_ci_patch->'clientTaskItems') is distinct from (v_ci_cur->'clientTaskItems') then
        return jsonb_build_object('ok', false, 'error', 'field_locked', 'field', 'clientTaskItems');
      end if;
      if v_ci_patch ? 'clientCaseLink'
         and (v_ci_patch->'clientCaseLink') is distinct from (v_ci_cur->'clientCaseLink') then
        return jsonb_build_object('ok', false, 'error', 'field_locked', 'field', 'clientCaseLink');
      end if;
      if v_ci_patch ? 'isFirstFee'
         and (v_ci_patch->'isFirstFee') is distinct from (v_ci_cur->'isFirstFee') then
        return jsonb_build_object('ok', false, 'error', 'field_locked', 'field', 'isFirstFee');
      end if;
      if v_ci_patch ? 'notFirstFee'
         and (v_ci_patch->'notFirstFee') is distinct from (v_ci_cur->'notFirstFee') then
        return jsonb_build_object('ok', false, 'error', 'field_locked', 'field', 'notFirstFee');
      end if;
    end if;
  end if;

  v_client_info := v_ci_cur;
  if p_patch ? 'client_info' then
    v_client_info := v_client_info || (p_patch->'client_info');
  end if;

  v_status := coalesce(p_patch->>'status', v_row.status);
  v_finalized_by := v_row.finalized_by;
  v_finalized_at := v_row.finalized_at;

  if p_patch ? 'status' and (p_patch->>'status') is distinct from v_row.status then
    v_linked := v_in_tr or v_in_ci;

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
  'TASK-001 隔離：PM／executive 同環境列明欄位更新；client_info 鍵級合併；updated_at 衝突；finalized_* 僅伺服器寫；已確認欄位鎖定不可繞過。edit_logs 僅顯示用、不可信。';
