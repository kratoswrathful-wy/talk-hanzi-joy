-- 工項 2（2026-07-20）：譯者案件寫入改走 SECURITY DEFINER RPC
--
-- 根因：工項 D 將 cases 基表 SELECT 收為僅 admin 後，PostgreSQL RLS 下
-- UPDATE（含 WHERE）亦需能 SELECT 到該列；譯者直寫 PostgREST `.from('cases').update()`
-- 會靜默 UPDATE 0 列（無 4xx），導致承接／任務完成／協作勾選等狀態流程失效。
--
-- 作法：提供 apply_case_update(p_case_id, p_patch)；前端／CAT 同步一律經此 RPC。
-- 基表 SELECT 仍僅 admin；敏感七欄非 admin 於 RPC 內剝除（trigger 為第二道防線）。
-- idempotent。

create or replace function public.apply_case_update(
  p_case_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.cases%rowtype;
  v_patch public.cases%rowtype;
  v_updated_at timestamptz;
  v_patch_clean jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_patch is null or p_patch = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'empty_patch');
  end if;

  -- 禁止經 patch 竄改身份／環境鍵
  v_patch_clean := p_patch
    - 'id'
    - 'env'
    - 'created_at'
    - 'created_by';

  -- 非 admin：剝除七敏感欄（與 cases_block_sensitive_column_update 對齊）
  if not is_admin(v_uid) then
    v_patch_clean := v_patch_clean
      - 'client'
      - 'contact'
      - 'keyword'
      - 'client_po_number'
      - 'client_case_link'
      - 'dispatch_route'
      - 'internal_comments';
  end if;

  if v_patch_clean = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'empty_patch_after_filter');
  end if;

  select * into v_row
  from public.cases
  where id = p_case_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_row.env is distinct from current_env() then
    return jsonb_build_object('ok', false, 'error', 'env_mismatch');
  end if;

  -- 缺鍵保留原列；有鍵則覆寫（含顯式 null）
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
    login_account = v_patch.login_account,
    login_password = v_patch.login_password,
    multi_collab = v_patch.multi_collab,
    online_tool_filename = v_patch.online_tool_filename,
    online_tool_project = v_patch.online_tool_project,
    other_login_info = v_patch.other_login_info,
    process_note = v_patch.process_note,
    question_form = v_patch.question_form,
    question_tools = v_patch.question_tools,
    reference_materials = v_patch.reference_materials,
    review_deadline = v_patch.review_deadline,
    review_rows = v_patch.review_rows,
    reviewer = v_patch.reviewer,
    series_reference_materials = v_patch.series_reference_materials,
    source_files = v_patch.source_files,
    status = v_patch.status,
    task_status = v_patch.task_status,
    title = v_patch.title,
    tool_field_values = v_patch.tool_field_values,
    tools = v_patch.tools,
    track_changes = v_patch.track_changes,
    translation_deadline = v_patch.translation_deadline,
    translator = v_patch.translator,
    translator_final = v_patch.translator_final,
    unit_count = v_patch.unit_count,
    updated_at = coalesce(v_patch.updated_at, now()),
    work_groups = v_patch.work_groups,
    work_type = v_patch.work_type,
    working_files = v_patch.working_files
  where c.id = p_case_id
  returning c.updated_at into v_updated_at;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'update_failed');
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', p_case_id,
    'updated_at', v_updated_at
  );
end;
$$;

revoke all on function public.apply_case_update(uuid, jsonb) from public, anon;
grant execute on function public.apply_case_update(uuid, jsonb) to authenticated;
grant execute on function public.apply_case_update(uuid, jsonb) to service_role;

comment on function public.apply_case_update(uuid, jsonb) is
  '工項 2：案件欄位寫入（SECURITY DEFINER）。繞過基表 SELECT 收權導致的譯者 UPDATE 0 列；非 admin 剝除七敏感欄。';
