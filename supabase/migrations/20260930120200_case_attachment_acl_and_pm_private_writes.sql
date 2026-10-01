-- 1A 寫入守門＋1B 附件：主管私有／基本欄僅 admin 可寫。
-- 完稿三欄：同環境已登入可加，只能刪自己上傳的；準則／參考／原文僅 admin 可改。
-- 新增一律蓋 uploadedBy=目前帳號。移除案件連結不刪 Storage 物件。
-- 本檔只進本機候選；不准自行套用正式庫。

create or replace function private.case_file_item_key(p_item jsonb)
returns text language sql immutable set search_path = pg_catalog
as $$
  select coalesce(p_item->>'name','') || E'\n' || coalesce(p_item->>'url','');
$$;
revoke all on function private.case_file_item_key(jsonb) from public,anon,authenticated;

create or replace function private.apply_case_file_list_change(
  p_current jsonb,
  p_incoming jsonb,
  p_actor uuid,
  p_admin boolean,
  p_member_may_write boolean
) returns jsonb
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  v_current jsonb := case when jsonb_typeof(p_current)='array' then p_current else '[]'::jsonb end;
  v_incoming jsonb := case when jsonb_typeof(p_incoming)='array' then p_incoming else '[]'::jsonb end;
  v_item jsonb;
  v_key text;
  v_owner text;
  v_next jsonb := '[]'::jsonb;
  v_incoming_keys text[];
begin
  if p_actor is null then
    raise exception using errcode='42501', message='not_authorized';
  end if;

  select coalesce(array_agg(private.case_file_item_key(value)), '{}')
    into v_incoming_keys
  from jsonb_array_elements(v_incoming) value;

  if not p_admin and not p_member_may_write then
    if v_current <> v_incoming then
      raise exception using errcode='42501', message='field_not_permitted';
    end if;
    return v_current;
  end if;

  if not p_admin then
    for v_item in select value from jsonb_array_elements(v_current) value
    loop
      v_key := private.case_file_item_key(v_item);
      if not (v_key = any(v_incoming_keys)) then
        v_owner := v_item->>'uploadedBy';
        if v_owner is null or v_owner <> p_actor::text then
          raise exception using errcode='42501', message='file_not_owned';
        end if;
      end if;
    end loop;
  end if;

  for v_item in select value from jsonb_array_elements(v_current) value
  loop
    v_key := private.case_file_item_key(v_item);
    if v_key = any(v_incoming_keys) then
      v_next := v_next || jsonb_build_array(v_item);
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(v_incoming) value
  loop
    v_key := private.case_file_item_key(v_item);
    if v_key <> '' and not exists (
      select 1 from jsonb_array_elements(v_next) n where private.case_file_item_key(n.value)=v_key
    ) then
      v_next := v_next || jsonb_build_array(jsonb_set(v_item,'{uploadedBy}',to_jsonb(p_actor::text),true));
    end if;
  end loop;

  return v_next;
end;
$$;
revoke all on function private.apply_case_file_list_change(jsonb,jsonb,uuid,boolean,boolean)
  from public,anon,authenticated;

update private.case_field_acl_registry
set permission_key = 'case_detail_guidelinesFiles'
where field_key in (
  'clientGuidelines','seriesReferenceMaterials','caseReferenceMaterials',
  'sourceFiles','customGuidelinesUrl','commonInfo'
);

update private.case_field_acl_registry
set permission_key = 'case_detail_finalFiles'
where field_key in ('translatorFinal','internalReviewFinal','trackChanges');

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
  v_admin boolean;
  v_finals_only boolean;
  v_changes jsonb := coalesce(p_changes,'{}'::jsonb);
begin
  if v_actor is null then raise exception using errcode='42501', message='not_authorized'; end if;
  if jsonb_typeof(v_changes) <> 'object' or v_changes='{}'::jsonb then
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
  v_admin := public.is_admin(v_actor);

  select not exists (
    select 1 from jsonb_object_keys(v_changes) k
    where k not in ('translatorFinal','internalReviewFinal','trackChanges')
  ) into v_finals_only;

  -- 純完稿：同環境已登入即可，不再要求受派。其他寫入維持受派。
  if not v_admin and not v_finals_only then
    if not exists(
      select 1 from public.case_participants p
      where p.case_id=p_case_id and p.user_id=v_actor
        and p.access_revoked_at is null and p.work_status <> 'cancelled'
    ) then
      raise exception using errcode='42501', message='active_participant_required';
    end if;
  end if;

  if not v_finals_only then
    select count(*), min(ps.config::text)::jsonb into v_count,v_config
    from public.permission_settings ps where ps.env=v_env;
    if v_count <> 1 then
      raise exception using errcode='55000', message='permission_settings_ambiguous';
    end if;
  end if;

  for v_key,v_value in select key,value from jsonb_each(v_changes) loop
    select * into v_registry from private.case_field_acl_registry r where r.field_key=v_key;
    if not found then raise exception using errcode='42501', message='field_not_permitted'; end if;
    v_kind := case when jsonb_typeof(v_value)='string' then 'text' else jsonb_typeof(v_value) end;
    if v_registry.value_kind <> v_kind
      and not(v_registry.value_kind='text' and jsonb_typeof(v_value)='null') then
      raise exception using errcode='22023', message='invalid_field_value_type';
    end if;

    if v_key in (
      'client','contact','keyword','clientPoNumber','clientCaseLink','dispatchRoute','internalComments',
      'title','bodyContent','category','workType','workGroups','billingUnit','unitCount'
    ) and not v_admin then
      raise exception using errcode='42501', message='field_not_permitted';
    end if;

    if v_key in (
      'clientGuidelines','seriesReferenceMaterials','caseReferenceMaterials',
      'sourceFiles','customGuidelinesUrl','commonInfo'
    ) then
      if not v_admin then
        raise exception using errcode='42501', message='field_not_permitted';
      end if;
    elsif v_key in ('translatorFinal','internalReviewFinal','trackChanges') then
      v_changes := jsonb_set(
        v_changes,
        array[v_key],
        private.apply_case_file_list_change(
          case v_key
            when 'translatorFinal' then v_case.translator_final
            when 'internalReviewFinal' then v_case.internal_review_final
            else v_case.track_changes
          end,
          v_value,
          v_actor,
          v_admin,
          true
        ),
        true
      );
    elsif not v_admin then
      if not coalesce((v_config #>> array[
        'module_permissions',v_role,'case_management','items',
        v_registry.permission_key,'edit'
      ])::boolean,false) then
        raise exception using errcode='42501', message='field_not_permitted';
      end if;
    end if;
  end loop;

  if v_case.revision <> p_expected_revision then
    raise exception using errcode='40001', message='case_revision_conflict';
  end if;

  update public.cases c set
    title=case when v_changes?'title' then coalesce(v_changes->>'title','') else c.title end,
    body_content=case when v_changes?'bodyContent' then v_changes->'bodyContent' else c.body_content end,
    category=case when v_changes?'category' then coalesce(v_changes->>'category','') else c.category end,
    work_type=case when v_changes?'workType' then v_changes->'workType' else c.work_type end,
    work_groups=case when v_changes?'workGroups' then v_changes->'workGroups' else c.work_groups end,
    client=case when v_changes?'client' then coalesce(v_changes->>'client','') else c.client end,
    contact=case when v_changes?'contact' then coalesce(v_changes->>'contact','') else c.contact end,
    keyword=case when v_changes?'keyword' then coalesce(v_changes->>'keyword','') else c.keyword end,
    client_po_number=case when v_changes?'clientPoNumber' then coalesce(v_changes->>'clientPoNumber','') else c.client_po_number end,
    client_case_link=case when v_changes?'clientCaseLink' then v_changes->'clientCaseLink' else c.client_case_link end,
    dispatch_route=case when v_changes?'dispatchRoute' then v_changes->>'dispatchRoute' else c.dispatch_route end,
    process_note=case when v_changes?'processNote' then coalesce(v_changes->>'processNote','') else c.process_note end,
    billing_unit=case when v_changes?'billingUnit' then coalesce(v_changes->>'billingUnit','') else c.billing_unit end,
    unit_count=case when v_changes?'unitCount' then (v_changes->>'unitCount')::numeric else c.unit_count end,
    inquiry_note=case when v_changes?'inquiryNote' then coalesce(v_changes->>'inquiryNote','') else c.inquiry_note end,
    delivery_method=case when v_changes?'deliveryMethod' then coalesce(v_changes->>'deliveryMethod','') else c.delivery_method end,
    delivery_method_files=case when v_changes?'deliveryMethodFiles' then v_changes->'deliveryMethodFiles' else c.delivery_method_files end,
    client_receipt=case when v_changes?'clientReceipt' then coalesce(v_changes->>'clientReceipt','') else c.client_receipt end,
    client_receipt_files=case when v_changes?'clientReceiptFiles' then v_changes->'clientReceiptFiles' else c.client_receipt_files end,
    custom_guidelines_url=case when v_changes?'customGuidelinesUrl' then v_changes->'customGuidelinesUrl' else c.custom_guidelines_url end,
    client_guidelines=case when v_changes?'clientGuidelines' then v_changes->'clientGuidelines' else c.client_guidelines end,
    common_info=case when v_changes?'commonInfo' then v_changes->'commonInfo' else c.common_info end,
    common_links=case when v_changes?'commonLinks' then v_changes->'commonLinks' else c.common_links end,
    working_files=case when v_changes?'workingFiles' then v_changes->'workingFiles' else c.working_files end,
    source_files=case when v_changes?'sourceFiles' then v_changes->'sourceFiles' else c.source_files end,
    series_reference_materials=case when v_changes?'seriesReferenceMaterials' then v_changes->'seriesReferenceMaterials' else c.series_reference_materials end,
    case_reference_materials=case when v_changes?'caseReferenceMaterials' then v_changes->'caseReferenceMaterials' else c.case_reference_materials end,
    reference_materials=case when v_changes?'referenceMaterials' then v_changes->'referenceMaterials' else c.reference_materials end,
    question_form=case when v_changes?'questionForm' then coalesce(v_changes->>'questionForm','') else c.question_form end,
    translator_final=case when v_changes?'translatorFinal' then v_changes->'translatorFinal' else c.translator_final end,
    internal_review_final=case when v_changes?'internalReviewFinal' then v_changes->'internalReviewFinal' else c.internal_review_final end,
    track_changes=case when v_changes?'trackChanges' then v_changes->'trackChanges' else c.track_changes end,
    internal_comments=case when v_changes?'internalComments' then v_changes->'internalComments' else c.internal_comments end,
    updated_at=now()
  where c.id=p_case_id and c.env=v_env and c.revision=p_expected_revision
  returning c.revision into v_revision;
  if not found then raise exception using errcode='40001', message='case_revision_conflict'; end if;
  perform private.record_case_mutation(
    p_case_id,v_env,v_actor,'update_case_permitted_fields',
    array(select jsonb_object_keys(v_changes)),p_expected_revision,v_revision
  );
  return jsonb_build_object('caseId',p_case_id,'revision',v_revision);
end;
$$;

revoke all on function public.update_case_permitted_fields(uuid,bigint,jsonb)
  from public,anon;
grant execute on function public.update_case_permitted_fields(uuid,bigint,jsonb)
  to authenticated,service_role;

comment on function public.update_case_permitted_fields(uuid,bigint,jsonb) is
  '1A/1B：主管私有與基本欄僅 admin；完稿三欄可合併上傳並只刪自己的檔；準則／原文僅 admin。';
