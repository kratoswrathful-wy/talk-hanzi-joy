-- P0-A4：伺服器控制欄位白名單；registry 位於非 exposed schema。
-- db_column 只作靜態對照文件，絕不拿來組動態 SQL。

create table if not exists private.case_field_acl_registry (
  field_key text primary key,
  permission_key text not null,
  db_column text not null unique,
  value_kind text not null
    check (value_kind in ('text','number','boolean','array','object'))
);
revoke all on private.case_field_acl_registry from public,anon,authenticated;

insert into private.case_field_acl_registry(field_key,permission_key,db_column,value_kind)
values
  ('title','case_detail_title','title','text'),
  ('bodyContent','case_detail_title','body_content','array'),
  ('category','case_detail_category','category','text'),
  ('workType','case_detail_workType','work_type','array'),
  ('workGroups','case_detail_workType','work_groups','array'),
  ('client','case_detail_client','client','text'),
  ('contact','case_detail_contact','contact','text'),
  ('keyword','case_detail_keyword','keyword','text'),
  ('clientPoNumber','case_detail_keyword','client_po_number','text'),
  ('clientCaseLink','case_detail_keyword','client_case_link','object'),
  ('dispatchRoute','case_detail_keyword','dispatch_route','text'),
  ('processNote','case_detail_keyword','process_note','text'),
  ('billingUnit','case_detail_keyword','billing_unit','text'),
  ('unitCount','case_detail_keyword','unit_count','number'),
  ('inquiryNote','case_detail_keyword','inquiry_note','text'),
  ('deliveryMethod','case_detail_keyword','delivery_method','text'),
  ('deliveryMethodFiles','case_detail_keyword','delivery_method_files','array'),
  ('clientReceipt','case_detail_keyword','client_receipt','text'),
  ('clientReceiptFiles','case_detail_keyword','client_receipt_files','array'),
  ('customGuidelinesUrl','case_detail_keyword','custom_guidelines_url','array'),
  ('clientGuidelines','case_detail_keyword','client_guidelines','array'),
  ('commonInfo','case_detail_keyword','common_info','array'),
  ('commonLinks','case_detail_keyword','common_links','array'),
  ('workingFiles','case_detail_keyword','working_files','array'),
  ('sourceFiles','case_detail_keyword','source_files','array'),
  ('seriesReferenceMaterials','case_detail_keyword','series_reference_materials','array'),
  ('caseReferenceMaterials','case_detail_keyword','case_reference_materials','array'),
  ('referenceMaterials','case_detail_keyword','reference_materials','array'),
  ('questionForm','case_detail_keyword','question_form','text'),
  ('translatorFinal','case_detail_keyword','translator_final','array'),
  ('internalReviewFinal','case_detail_keyword','internal_review_final','array'),
  ('trackChanges','case_detail_keyword','track_changes','array'),
  ('internalComments','case_detail_internalComments','internal_comments','array')
on conflict(field_key) do update set
  permission_key=excluded.permission_key,
  db_column=excluded.db_column,
  value_kind=excluded.value_kind;

create or replace function private.case_field_permission_allowed(
  p_permission_key text, p_mode text
) returns boolean language plpgsql stable security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_env text := public.current_env();
  v_role text;
  v_count integer;
  v_config jsonb;
begin
  if v_actor is null or p_mode not in ('view','edit') then return false; end if;
  if public.is_admin(v_actor) then return true; end if;
  select ur.role::text into v_role
  from public.user_roles ur where ur.user_id=v_actor
  order by case ur.role::text when 'executive' then 1 when 'pm' then 2 when 'member' then 3 else 4 end
  limit 1;
  if v_role is null then return false; end if;
  select count(*), min(ps.config::text)::jsonb into v_count,v_config
  from public.permission_settings ps where ps.env=v_env;
  if v_count <> 1 then return false; end if;
  return coalesce((v_config #>> array[
    'module_permissions',v_role,'case_management','items',p_permission_key,p_mode
  ])::boolean,false);
end;
$$;
revoke all on function private.case_field_permission_allowed(text,text)
  from public,anon,authenticated;

create or replace function public.update_case_permitted_fields(
  p_case_id uuid, p_expected_revision bigint, p_changes jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_env text := public.current_env();
  v_case public.cases%rowtype;
  v_role text;
  v_config jsonb;
  v_count integer;
  v_key text;
  v_value jsonb;
  v_registry private.case_field_acl_registry%rowtype;
  v_kind text;
  v_revision bigint;
begin
  if v_actor is null then raise exception using errcode='42501', message='not_authorized'; end if;
  if jsonb_typeof(coalesce(p_changes,'{}'::jsonb)) <> 'object' or p_changes='{}'::jsonb then
    raise exception using errcode='22023', message='changes_must_be_nonempty_object';
  end if;

  select * into v_case from public.cases c
  where c.id=p_case_id and c.env=v_env for update;
  if not found then raise exception using errcode='P0002', message='case_unavailable'; end if;

  select ur.role::text into v_role
  from public.user_roles ur where ur.user_id=v_actor
  order by case ur.role::text when 'executive' then 1 when 'pm' then 2 when 'member' then 3 else 4 end
  limit 1;
  if v_role is null then raise exception using errcode='42501', message='role_required'; end if;
  if not public.is_admin(v_actor) and not exists(
    select 1 from public.case_participants p
    where p.case_id=p_case_id and p.user_id=v_actor
      and p.access_revoked_at is null and p.work_status <> 'cancelled'
  ) then
    raise exception using errcode='42501', message='active_participant_required';
  end if;

  select count(*), min(ps.config::text)::jsonb into v_count,v_config
  from public.permission_settings ps where ps.env=v_env;
  if v_count <> 1 then
    raise exception using errcode='55000', message='permission_settings_ambiguous';
  end if;

  for v_key,v_value in select key,value from jsonb_each(p_changes) loop
    select * into v_registry from private.case_field_acl_registry r where r.field_key=v_key;
    if not found then raise exception using errcode='42501', message='field_not_permitted'; end if;
    v_kind := case when jsonb_typeof(v_value)='string' then 'text' else jsonb_typeof(v_value) end;
    if v_registry.value_kind <> v_kind
      and not(v_registry.value_kind='text' and jsonb_typeof(v_value)='null') then
      raise exception using errcode='22023', message='invalid_field_value_type';
    end if;
    if not public.is_admin(v_actor) and not coalesce((v_config #>> array[
      'module_permissions',v_role,'case_management','items',
      v_registry.permission_key,'edit'
    ])::boolean,false) then
      raise exception using errcode='42501', message='field_not_permitted';
    end if;
  end loop;

  if v_case.revision <> p_expected_revision then
    raise exception using errcode='40001', message='case_revision_conflict';
  end if;

  -- 固定欄位更新；禁止使用 registry.db_column 組動態 SQL。
  update public.cases c set
    title=case when p_changes?'title' then coalesce(p_changes->>'title','') else c.title end,
    body_content=case when p_changes?'bodyContent' then p_changes->'bodyContent' else c.body_content end,
    category=case when p_changes?'category' then coalesce(p_changes->>'category','') else c.category end,
    work_type=case when p_changes?'workType' then p_changes->'workType' else c.work_type end,
    work_groups=case when p_changes?'workGroups' then p_changes->'workGroups' else c.work_groups end,
    client=case when p_changes?'client' then coalesce(p_changes->>'client','') else c.client end,
    contact=case when p_changes?'contact' then coalesce(p_changes->>'contact','') else c.contact end,
    keyword=case when p_changes?'keyword' then coalesce(p_changes->>'keyword','') else c.keyword end,
    client_po_number=case when p_changes?'clientPoNumber' then coalesce(p_changes->>'clientPoNumber','') else c.client_po_number end,
    client_case_link=case when p_changes?'clientCaseLink' then p_changes->'clientCaseLink' else c.client_case_link end,
    dispatch_route=case when p_changes?'dispatchRoute' then p_changes->>'dispatchRoute' else c.dispatch_route end,
    process_note=case when p_changes?'processNote' then coalesce(p_changes->>'processNote','') else c.process_note end,
    billing_unit=case when p_changes?'billingUnit' then coalesce(p_changes->>'billingUnit','') else c.billing_unit end,
    unit_count=case when p_changes?'unitCount' then (p_changes->>'unitCount')::numeric else c.unit_count end,
    inquiry_note=case when p_changes?'inquiryNote' then coalesce(p_changes->>'inquiryNote','') else c.inquiry_note end,
    delivery_method=case when p_changes?'deliveryMethod' then coalesce(p_changes->>'deliveryMethod','') else c.delivery_method end,
    delivery_method_files=case when p_changes?'deliveryMethodFiles' then p_changes->'deliveryMethodFiles' else c.delivery_method_files end,
    client_receipt=case when p_changes?'clientReceipt' then coalesce(p_changes->>'clientReceipt','') else c.client_receipt end,
    client_receipt_files=case when p_changes?'clientReceiptFiles' then p_changes->'clientReceiptFiles' else c.client_receipt_files end,
    custom_guidelines_url=case when p_changes?'customGuidelinesUrl' then p_changes->'customGuidelinesUrl' else c.custom_guidelines_url end,
    client_guidelines=case when p_changes?'clientGuidelines' then p_changes->'clientGuidelines' else c.client_guidelines end,
    common_info=case when p_changes?'commonInfo' then p_changes->'commonInfo' else c.common_info end,
    common_links=case when p_changes?'commonLinks' then p_changes->'commonLinks' else c.common_links end,
    working_files=case when p_changes?'workingFiles' then p_changes->'workingFiles' else c.working_files end,
    source_files=case when p_changes?'sourceFiles' then p_changes->'sourceFiles' else c.source_files end,
    series_reference_materials=case when p_changes?'seriesReferenceMaterials' then p_changes->'seriesReferenceMaterials' else c.series_reference_materials end,
    case_reference_materials=case when p_changes?'caseReferenceMaterials' then p_changes->'caseReferenceMaterials' else c.case_reference_materials end,
    reference_materials=case when p_changes?'referenceMaterials' then p_changes->'referenceMaterials' else c.reference_materials end,
    question_form=case when p_changes?'questionForm' then coalesce(p_changes->>'questionForm','') else c.question_form end,
    translator_final=case when p_changes?'translatorFinal' then p_changes->'translatorFinal' else c.translator_final end,
    internal_review_final=case when p_changes?'internalReviewFinal' then p_changes->'internalReviewFinal' else c.internal_review_final end,
    track_changes=case when p_changes?'trackChanges' then p_changes->'trackChanges' else c.track_changes end,
    internal_comments=case when p_changes?'internalComments' then p_changes->'internalComments' else c.internal_comments end,
    updated_at=now()
  where c.id=p_case_id and c.env=v_env and c.revision=p_expected_revision
  returning c.revision into v_revision;
  if not found then raise exception using errcode='40001', message='case_revision_conflict'; end if;
  perform private.record_case_mutation(
    p_case_id,v_env,v_actor,'update_case_permitted_fields',
    array(select jsonb_object_keys(p_changes)),p_expected_revision,v_revision
  );
  return jsonb_build_object('caseId',p_case_id,'revision',v_revision);
end;
$$;

revoke all on function public.update_case_permitted_fields(uuid,bigint,jsonb)
  from public,anon;
grant execute on function public.update_case_permitted_fields(uuid,bigint,jsonb)
  to authenticated,service_role;

comment on table private.case_field_acl_registry is
  '靜態欄位鍵、permission item 與型別 registry；db_column 不得用於動態 SQL。';