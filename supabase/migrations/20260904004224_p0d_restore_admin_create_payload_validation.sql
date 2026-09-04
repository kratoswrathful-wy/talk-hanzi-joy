-- P0-D 補丁：還原 admin_create_case payload 完整驗證契約（additive）。
-- 合併 P0-C 欄位／status／型別檢查 ＋ P0-D translator_user_id／reviewer_user_id。
-- 錯誤碼維持 P0-D：forbidden_payload_key／unknown_payload_key／invalid_*_user_id。
-- 另：production 非法 status 筆數為 0 時加入 cases.status CHECK（NOT VALID → VALIDATE）。

create or replace function private.p0_admin_create_validate_payload(p_payload jsonb)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_key text;
  v_forbidden text[] := array[
    'id', 'env', 'created_at', 'created_by', 'revision', 'updated_at',
    'login_account', 'login_password', 'login_url', 'other_login_info',
    'tools', 'question_tools', 'tool_field_values'
  ];
  v_allowed text[] := array[
    'billing_unit', 'body_content', 'case_reference_materials', 'cat_tool_enabled',
    'category', 'change_log_enabled_at', 'client', 'client_case_link', 'client_guidelines',
    'client_po_number', 'client_question_form', 'client_receipt', 'client_receipt_files',
    'collab_count', 'collab_rows', 'comments', 'common_info', 'common_links', 'contact',
    'custom_guidelines_url', 'decline_records', 'delivery_method', 'delivery_method_files',
    'dispatch_route', 'edit_logs', 'execution_tool', 'fee_entry', 'icon_url', 'inquiry_note',
    'inquiry_slack_records', 'internal_comments', 'internal_note_form', 'internal_records',
    'internal_review_final', 'keyword', 'multi_collab', 'online_tool_filename',
    'online_tool_project', 'process_note', 'question_form', 'reference_materials',
    'review_deadline', 'review_rows', 'reviewer', 'series_reference_materials',
    'source_files', 'status', 'task_status', 'title', 'track_changes',
    'translation_deadline', 'translator', 'translator_final', 'translator_user_id',
    'reviewer_user_id', 'unit_count', 'work_groups', 'work_type', 'working_files'
  ];
  v_text_keys text[] := array[
    'billing_unit', 'category', 'client', 'client_po_number', 'client_receipt', 'contact',
    'delivery_method', 'dispatch_route', 'execution_tool', 'fee_entry', 'icon_url',
    'inquiry_note', 'keyword', 'online_tool_filename', 'online_tool_project', 'process_note',
    'question_form', 'reviewer', 'status', 'task_status', 'title'
  ];
  v_json_array_keys text[] := array[
    'collab_rows', 'common_info', 'decline_records', 'edit_logs', 'inquiry_slack_records',
    'internal_records', 'internal_review_final', 'reference_materials', 'review_rows',
    'source_files', 'translator', 'translator_final', 'work_groups', 'work_type', 'working_files'
  ];
  v_json_nullable_keys text[] := array[
    'body_content', 'case_reference_materials', 'client_case_link', 'client_guidelines',
    'client_receipt_files', 'comments', 'common_links', 'custom_guidelines_url',
    'delivery_method_files', 'internal_comments', 'series_reference_materials', 'track_changes'
  ];
  v_bool_keys text[] := array[
    'cat_tool_enabled', 'client_question_form', 'internal_note_form', 'multi_collab'
  ];
  v_num_keys text[] := array['collab_count', 'unit_count'];
  v_ts_keys text[] := array[
    'change_log_enabled_at', 'review_deadline', 'translation_deadline'
  ];
  v_statuses text[] := array[
    'draft', 'inquiry', 'dispatched', 'task_completed', 'delivered', 'feedback',
    'feedback_completed'
  ];
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return 'invalid_payload';
  end if;

  if p_payload = '{}'::jsonb then
    return 'empty_payload';
  end if;

  select k into v_key
  from jsonb_object_keys(p_payload) k
  where k = any(v_forbidden)
  limit 1;
  if v_key is not null then
    return 'forbidden_payload_key';
  end if;

  select k into v_key
  from jsonb_object_keys(p_payload) k
  where not (k = any(v_allowed))
  limit 1;
  if v_key is not null then
    return 'unknown_payload_key';
  end if;

  foreach v_key in array v_text_keys loop
    if p_payload ? v_key
       and jsonb_typeof(p_payload->v_key) not in ('string', 'null') then
      return 'invalid_field_type';
    end if;
  end loop;

  if p_payload ? 'title'
     and p_payload->>'title' is not null
     and length(p_payload->>'title') > 500 then
    return 'invalid_field_length';
  end if;

  if p_payload ? 'status' then
    if jsonb_typeof(p_payload->'status') <> 'string'
       or not (p_payload->>'status' = any(v_statuses)) then
      return 'invalid_status';
    end if;
  end if;

  foreach v_key in array v_bool_keys loop
    if p_payload ? v_key
       and jsonb_typeof(p_payload->v_key) not in ('boolean', 'null') then
      return 'invalid_field_type';
    end if;
  end loop;

  foreach v_key in array v_num_keys loop
    if p_payload ? v_key
       and jsonb_typeof(p_payload->v_key) not in ('number', 'null') then
      return 'invalid_field_type';
    end if;
  end loop;

  foreach v_key in array v_json_array_keys loop
    if p_payload ? v_key
       and jsonb_typeof(p_payload->v_key) not in ('array', 'null') then
      return 'invalid_field_type';
    end if;
  end loop;

  foreach v_key in array v_json_nullable_keys loop
    if p_payload ? v_key
       and jsonb_typeof(p_payload->v_key) not in ('object', 'array', 'string', 'null') then
      return 'invalid_field_type';
    end if;
  end loop;

  foreach v_key in array v_ts_keys loop
    if p_payload ? v_key and jsonb_typeof(p_payload->v_key) = 'string' then
      begin
        perform (p_payload->>v_key)::timestamptz;
      exception
        when others then
          return 'invalid_field_type';
      end;
    elsif p_payload ? v_key
       and jsonb_typeof(p_payload->v_key) not in ('null') then
      return 'invalid_field_type';
    end if;
  end loop;

  if p_payload ? 'translator_user_id'
    and not private.p0_is_valid_uuid(p_payload->>'translator_user_id')
  then
    return 'invalid_translator_user_id';
  end if;

  if p_payload ? 'reviewer_user_id'
    and not private.p0_is_valid_uuid(p_payload->>'reviewer_user_id')
  then
    return 'invalid_reviewer_user_id';
  end if;

  return null;
end;
$$;

revoke all on function private.p0_admin_create_validate_payload(jsonb)
  from public, anon, authenticated;

comment on function private.p0_admin_create_validate_payload(jsonb) is
  'P0-D 補丁：合併 P0-C 完整欄位／status／型別檢查與 P0-D UUID allowlist；錯誤碼維持 *_payload_key。';

-- cases.status CHECK（production 非法狀態 = 0；catalog 安全處理已存在）
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'cases'
      and c.conname = 'cases_status_allowed_check'
  ) then
    alter table public.cases
      add constraint cases_status_allowed_check
      check (
        status in (
          'draft',
          'inquiry',
          'dispatched',
          'task_completed',
          'delivered',
          'feedback',
          'feedback_completed'
        )
      ) not valid;
  end if;
end $$;

alter table public.cases validate constraint cases_status_allowed_check;
