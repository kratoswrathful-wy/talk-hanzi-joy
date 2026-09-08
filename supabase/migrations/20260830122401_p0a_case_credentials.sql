-- P0-A5：一般案件讀取只回傳空憑證；工具 JSON 以 allowlist 重建。

create or replace function private.public_tool_structure(p_tools jsonb)
returns jsonb language sql immutable security definer set search_path = pg_catalog
as $$
  select case when jsonb_typeof(p_tools) <> 'array' then '[]'::jsonb
  else coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',case when jsonb_typeof(item.value->'id')='string' then item.value->'id' end,
      'tool',case when jsonb_typeof(item.value->'tool')='string' then item.value->'tool' end,
      'fieldValues','{}'::jsonb,
      'fields',case when jsonb_typeof(item.value->'fields')='array' then (
        select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id',case when jsonb_typeof(field.value->'id')='string' then field.value->'id' end,
          'label',case when jsonb_typeof(field.value->'label')='string' then field.value->'label' end,
          'type',case when field.value->>'type' in ('text','file') then field.value->'type' end
        )) order by field.ordinality),'[]'::jsonb)
        from jsonb_array_elements(item.value->'fields') with ordinality field(value,ordinality)
      ) end
    )) order by item.ordinality)
    from jsonb_array_elements(p_tools) with ordinality item(value,ordinality)
    where jsonb_typeof(item.value)='object'
  ),'[]'::jsonb) end;
$$;
revoke all on function private.public_tool_structure(jsonb)
  from public,anon,authenticated;

drop view if exists public.cases_visible;
create view public.cases_visible
with (security_invoker=false,security_barrier=true)
as
select
  c.id,
  c.title,
  c.status,
  case when private.case_field_permission_allowed('case_detail_client','view') then c.client else '' end client,
  case when private.case_field_permission_allowed('case_detail_contact','view') then c.contact else '' end contact,
  case when private.case_field_permission_allowed('case_detail_keyword','view') then c.keyword else '' end keyword,
  case when private.case_field_permission_allowed('case_detail_keyword','view') then c.client_po_number else '' end client_po_number,
  case when private.case_field_permission_allowed('case_detail_keyword','view')
    then c.client_case_link else jsonb_build_object('url','','label','') end client_case_link,
  case when private.case_field_permission_allowed('case_detail_keyword','view')
    then c.dispatch_route else null end dispatch_route,
  c.category,
  c.work_type,
  c.work_groups,
  c.process_note,
  c.billing_unit,
  c.unit_count,
  c.inquiry_note,
  c.translator,
  c.translation_deadline,
  c.reviewer,
  c.review_deadline,
  c.execution_tool,
  '{}'::jsonb tool_field_values,
  c.cat_tool_enabled,
  private.public_tool_structure(c.tools) tools,
  private.public_tool_structure(c.question_tools) question_tools,
  c.delivery_method,
  c.delivery_method_files,
  c.client_receipt,
  c.client_receipt_files,
  c.custom_guidelines_url,
  c.client_guidelines,
  c.common_info,
  c.common_links,
  c.internal_note_form,
  c.client_question_form,
  c.working_files,
  ''::text other_login_info,
  ''::text login_account,
  ''::text login_password,
  c.online_tool_project,
  c.online_tool_filename,
  c.source_files,
  c.series_reference_materials,
  c.case_reference_materials,
  c.reference_materials,
  c.question_form,
  c.translator_final,
  c.internal_review_final,
  c.track_changes,
  c.fee_entry,
  c.internal_records,
  c.comments,
  case when private.case_field_permission_allowed('case_detail_internalComments','view')
    then c.internal_comments else '[]'::jsonb end internal_comments,
  c.body_content,
  c.multi_collab,
  c.collab_count,
  c.collab_rows,
  c.review_rows,
  c.decline_records,
  c.icon_url,
  c.created_by,
  c.created_at,
  c.inquiry_slack_records,
  c.updated_at,
  case when public.is_admin((select auth.uid())) then c.edit_logs
    else coalesce((
      select jsonb_agg(e)
      from jsonb_array_elements(c.edit_logs) e
      where coalesce(e->>'fieldKey',e->>'field','') !~*
        '(客戶|client|聯絡人|contact|關鍵字|keyword|客戶\s*PO|clientPo|client_po|派案|dispatch|案件單連結|clientCaseLink|client_case_link|內部備註|internalComments|internal_comments|帳號|密碼|login|password|toolField|工具欄位)'
    ),'[]'::jsonb) end edit_logs,
  c.change_log_enabled_at,
  c.task_status,
  c.env,
  c.revision
from public.cases c
where c.env=public.current_env();

alter view public.cases_visible owner to postgres;
revoke all on public.cases_visible from public,anon;
grant select on public.cases_visible to authenticated,service_role;

-- security-definer view 的 owner 需要基表權限；Data API 角色不得直接繞過 view。
revoke select on public.cases from anon,authenticated;
grant select on public.cases to service_role;

create or replace function public.get_case_credentials(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_env text := public.current_env();
  v_result jsonb;
begin
  if v_actor is null then raise exception using errcode='42501', message='not_authorized'; end if;
  if not public.is_admin(v_actor) and not exists(
    select 1 from public.case_participants p
    join public.cases c on c.id=p.case_id
    where p.case_id=p_case_id and p.user_id=v_actor
      and p.access_revoked_at is null and p.work_status <> 'cancelled'
      and c.env=v_env
  ) then
    raise exception using errcode='42501', message='credential_access_denied';
  end if;
  select jsonb_build_object(
    'caseId',c.id,'revision',c.revision,
    'loginAccount',c.login_account,'loginPassword',c.login_password,
    'otherLoginInfo',c.other_login_info,'toolFieldValues',c.tool_field_values,
    'tools',c.tools,'questionTools',c.question_tools
  ) into v_result
  from public.cases c where c.id=p_case_id and c.env=v_env;
  if v_result is null then raise exception using errcode='P0002', message='case_unavailable'; end if;
  return v_result;
end;
$$;

create or replace function public.update_case_credentials(
  p_case_id uuid, p_expected_revision bigint, p_credentials jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_env text := public.current_env();
  v_case public.cases%rowtype;
  v_revision bigint;
begin
  if v_actor is null or not public.is_admin(v_actor) then
    raise exception using errcode='42501', message='not_authorized';
  end if;
  if jsonb_typeof(coalesce(p_credentials,'{}'::jsonb)) <> 'object'
    or p_credentials='{}'::jsonb
    or exists(select 1 from jsonb_object_keys(p_credentials) k where k not in(
      'loginAccount','loginPassword','otherLoginInfo','toolFieldValues','tools','questionTools'
    )) then
    raise exception using errcode='22023', message='invalid_credentials_payload';
  end if;
  if (p_credentials?'loginAccount' and jsonb_typeof(p_credentials->'loginAccount') not in('string','null'))
    or (p_credentials?'loginPassword' and jsonb_typeof(p_credentials->'loginPassword') not in('string','null'))
    or (p_credentials?'otherLoginInfo' and jsonb_typeof(p_credentials->'otherLoginInfo') not in('string','null'))
    or (p_credentials?'toolFieldValues' and jsonb_typeof(p_credentials->'toolFieldValues') <> 'object')
    or (p_credentials?'tools' and jsonb_typeof(p_credentials->'tools') <> 'array')
    or (p_credentials?'questionTools' and jsonb_typeof(p_credentials->'questionTools') not in('array','null')) then
    raise exception using errcode='22023', message='invalid_credentials_payload';
  end if;
  select * into v_case from public.cases c
  where c.id=p_case_id and c.env=v_env for update;
  if not found then raise exception using errcode='P0002', message='case_unavailable'; end if;
  if v_case.revision <> p_expected_revision then
    raise exception using errcode='40001', message='case_revision_conflict';
  end if;
  update public.cases c set
    login_account=case when p_credentials?'loginAccount' then coalesce(p_credentials->>'loginAccount','') else c.login_account end,
    login_password=case when p_credentials?'loginPassword' then coalesce(p_credentials->>'loginPassword','') else c.login_password end,
    other_login_info=case when p_credentials?'otherLoginInfo' then coalesce(p_credentials->>'otherLoginInfo','') else c.other_login_info end,
    tool_field_values=case when p_credentials?'toolFieldValues' then p_credentials->'toolFieldValues' else c.tool_field_values end,
    tools=case when p_credentials?'tools' then p_credentials->'tools' else c.tools end,
    question_tools=case when p_credentials?'questionTools' then p_credentials->'questionTools' else c.question_tools end,
    updated_at=now()
  where c.id=p_case_id and c.env=v_env and c.revision=p_expected_revision
  returning c.revision into v_revision;
  if not found then raise exception using errcode='40001', message='case_revision_conflict'; end if;
  perform private.record_case_mutation(
    p_case_id,v_env,v_actor,'update_case_credentials',
    array(select jsonb_object_keys(p_credentials)),p_expected_revision,v_revision
  );
  return jsonb_build_object('caseId',p_case_id,'revision',v_revision);
end;
$$;

revoke all on function public.get_case_credentials(uuid) from public,anon;
revoke all on function public.update_case_credentials(uuid,bigint,jsonb) from public,anon;
grant execute on function public.get_case_credentials(uuid) to authenticated,service_role;
grant execute on function public.update_case_credentials(uuid,bigint,jsonb) to authenticated,service_role;

comment on view public.cases_visible is
  'P0-A：憑證一律空值，tool JSON 只保留 allowlist 結構；security-definer owner=postgres。';
comment on function public.get_case_credentials(uuid) is
  '僅 admin 或未撤權 participant 可讀單一案件憑證；撤權不追回已傳送到裝置的資料。';