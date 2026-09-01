-- P0-C 補丁 2：security_barrier view 須 grant authenticated EXECUTE 私有 helper；
-- admin_create_case 補 jsonb_populate 後 NOT NULL 預設。

grant execute on function private.public_tool_structure(jsonb) to authenticated;
grant execute on function private.case_field_permission_allowed(text, text) to authenticated;

create or replace function public.admin_create_case(
  p_case_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_env text := public.current_env();
  v_clean jsonb;
  v_row public.cases%rowtype;
begin
  if v_uid is null or not public.is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;
  if p_case_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_case_id');
  end if;
  if p_payload is null or p_payload = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'empty_payload');
  end if;

  v_clean := coalesce(p_payload, '{}'::jsonb)
    - 'id' - 'env' - 'created_at' - 'created_by' - 'revision' - 'updated_at'
    - 'login_account' - 'login_password' - 'login_url' - 'other_login_info'
    - 'tools' - 'question_tools' - 'tool_field_values';

  v_row := jsonb_populate_record(
    null::public.cases,
    v_clean || jsonb_build_object(
      'id', p_case_id,
      'env', v_env,
      'created_by', v_uid
    )
  );

  v_row.title := coalesce(v_row.title, '');
  v_row.category := coalesce(v_row.category, '');
  v_row.work_type := coalesce(v_row.work_type, '[]'::jsonb);
  v_row.process_note := coalesce(v_row.process_note, '');
  v_row.billing_unit := coalesce(v_row.billing_unit, '');
  v_row.unit_count := coalesce(v_row.unit_count, 0);
  v_row.inquiry_note := coalesce(v_row.inquiry_note, '');
  v_row.reviewer := coalesce(v_row.reviewer, '');
  v_row.task_status := coalesce(v_row.task_status, '');
  v_row.execution_tool := coalesce(v_row.execution_tool, '');
  v_row.delivery_method := coalesce(v_row.delivery_method, '');
  v_row.client_receipt := coalesce(v_row.client_receipt, '');
  v_row.custom_guidelines_url := coalesce(v_row.custom_guidelines_url, '');
  v_row.client_guidelines := coalesce(v_row.client_guidelines, '');
  v_row.other_login_info := coalesce(v_row.other_login_info, '');
  v_row.login_account := coalesce(v_row.login_account, '');
  v_row.login_password := coalesce(v_row.login_password, '');
  v_row.online_tool_project := coalesce(v_row.online_tool_project, '');
  v_row.online_tool_filename := coalesce(v_row.online_tool_filename, '');
  v_row.question_form := coalesce(v_row.question_form, '');
  v_row.track_changes := coalesce(v_row.track_changes, '');
  v_row.fee_entry := coalesce(v_row.fee_entry, '');
  v_row.client := coalesce(v_row.client, '');
  v_row.contact := coalesce(v_row.contact, '');
  v_row.keyword := coalesce(v_row.keyword, '');
  v_row.status := coalesce(v_row.status, 'draft');
  v_row.common_info := coalesce(v_row.common_info, '[]'::jsonb);
  v_row.working_files := coalesce(v_row.working_files, '[]'::jsonb);
  v_row.source_files := coalesce(v_row.source_files, '[]'::jsonb);
  v_row.reference_materials := coalesce(v_row.reference_materials, '[]'::jsonb);
  v_row.translator_final := coalesce(v_row.translator_final, '[]'::jsonb);
  v_row.internal_review_final := coalesce(v_row.internal_review_final, '[]'::jsonb);
  v_row.internal_records := coalesce(v_row.internal_records, '[]'::jsonb);
  v_row.translator := coalesce(v_row.translator, '[]'::jsonb);
  v_row.internal_note_form := coalesce(v_row.internal_note_form, false);
  v_row.client_question_form := coalesce(v_row.client_question_form, false);

  insert into public.cases
  select (v_row).*;

  perform private.record_case_mutation(
    p_case_id, v_env, v_uid, 'admin_create_case',
    array['create'], 0, 0
  );

  return jsonb_build_object(
    'ok', true,
    'id', p_case_id,
    'revision', 0
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'case_already_exists');
  when others then
    return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

revoke all on function public.admin_create_case(uuid, jsonb) from public, anon;
grant execute on function public.admin_create_case(uuid, jsonb)
  to authenticated, service_role;

comment on function public.admin_create_case(uuid, jsonb) is
  'P0-C：僅 PM／執行長同 env 建案；憑證鍵剝除；jsonb_populate 後補 NOT NULL 預設；寫入 case_mutation_audit。';
