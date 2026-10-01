-- 1A：主管私有欄在回應資料層只給 admin（PM／executive），不依 permission_settings 放行。
-- 計費單位與數量維持全員可見。憑證仍走 get_case_credentials，不經本 view。
-- 本檔只進本機候選；不准自行套用正式庫。

drop view if exists public.cases_visible;
create view public.cases_visible
with (security_invoker=false,security_barrier=true)
as
select
  c.id,
  c.title,
  c.status,
  case when public.is_admin((select auth.uid())) then c.client else '' end client,
  case when public.is_admin((select auth.uid())) then c.contact else '' end contact,
  case when public.is_admin((select auth.uid())) then c.keyword else '' end keyword,
  case when public.is_admin((select auth.uid())) then c.client_po_number else '' end client_po_number,
  case when public.is_admin((select auth.uid()))
    then c.client_case_link else jsonb_build_object('url','','label','') end client_case_link,
  case when public.is_admin((select auth.uid()))
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
  case when public.is_admin((select auth.uid()))
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

comment on view public.cases_visible is
  '1A：憑證空值；客戶／聯絡人／關鍵字／PO／派案／內部備註僅 admin；計費單位與數量不遮。';
