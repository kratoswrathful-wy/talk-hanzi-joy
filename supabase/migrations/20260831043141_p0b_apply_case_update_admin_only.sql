-- P0-B1：apply_case_update 僅 PM／執行長 + expected revision；收緊 cases UPDATE RLS。
-- 本機／隔離庫草稿；NOT deployable until verified。idempotent。

-- ── 1) cases UPDATE：僅 admin 同 env（勿還原 authenticated 全表 CRUD）──────────
drop policy if exists "Anyone authenticated can update cases" on public.cases;
drop policy if exists cases_update on public.cases;
create policy cases_update on public.cases
  for update
  to authenticated
  using (
    public.is_admin((select auth.uid()))
    and env = public.current_env()
  )
  with check (
    public.is_admin((select auth.uid()))
    and env = public.current_env()
  );

comment on policy cases_update on public.cases is
  'P0-B：基表 UPDATE 僅 admin 同 env；成員寫入走動作 RPC／permitted fields。';

-- ── 2) 替換 apply_case_update：3 參數、admin-only、optimistic revision ────────
drop function if exists public.apply_case_update(uuid, jsonb);
drop function if exists public.apply_case_update(uuid, jsonb, bigint);

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
begin
  -- 統一對外錯誤，避免洩漏案件是否存在
  if v_uid is null or not public.is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  if p_expected_revision is null or p_expected_revision < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_revision');
  end if;

  if p_patch is null or p_patch = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'empty_patch');
  end if;

  -- 禁止經 patch 竄改身份／環境／版號／憑證／工具敏感鍵（憑證走 update_case_credentials）
  v_patch_clean := p_patch
    - 'id'
    - 'env'
    - 'created_at'
    - 'created_by'
    - 'revision'
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
    updated_at = coalesce(v_patch.updated_at, now()),
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

  -- revision 由 P0-A trigger cases_bump_revision_trg 遞增；此處不手動 bump
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
  'P0-B：PM／執行長案件欄位寫入（SECURITY DEFINER）。需 p_expected_revision；剝除憑證／工具鍵；revision 由 trigger 遞增。';
