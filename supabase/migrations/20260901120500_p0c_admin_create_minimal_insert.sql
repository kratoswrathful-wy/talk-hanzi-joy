-- P0-C 補丁 5：admin_create_case 改最小 INSERT，未指定欄位走表 DEFAULT。

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

  insert into public.cases (
    id,
    env,
    created_by,
    title,
    status,
    client,
    category
  )
  values (
    p_case_id,
    v_env,
    v_uid,
    coalesce(nullif(trim(v_clean->>'title'), ''), ''),
    coalesce(nullif(trim(v_clean->>'status'), ''), 'draft'),
    coalesce(nullif(trim(v_clean->>'client'), ''), ''),
    coalesce(nullif(trim(v_clean->>'category'), ''), '')
  );

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
  'P0-C：僅 PM／執行長同 env 建案；最小 INSERT＋表 DEFAULT；憑證鍵剝除；寫 audit。';
