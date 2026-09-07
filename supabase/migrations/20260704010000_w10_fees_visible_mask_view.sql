-- W10 批次 2：fees_visible 欄位遮罩 view（security_invoker + CASE）
-- Scheme A：SQL token 對齊正式庫 schema_migrations.statements。

drop view if exists public.fees_visible;
create view public.fees_visible
with (security_invoker = on)
as
select
  f.id,
  f.title,
  f.assignee,
  f.status,
  case when is_admin((select auth.uid())) then f.internal_note else ''::text end as internal_note,
  case when is_admin((select auth.uid())) then f.internal_note_url else ''::text end as internal_note_url,
  f.task_items,
  case
    when is_admin((select auth.uid())) then f.client_info
    else jsonb_build_object(
      'clientTaskItems', '[]'::jsonb,
      'sameCase', false,
      'isFirstFee', false,
      'notFirstFee', false,
      'client', '',
      'contact', '',
      'clientCaseId', '',
      'eciKeywords', '',
      'clientPoNumber', '',
      'clientCaseLink', jsonb_build_object('url', '', 'label', ''),
      'dispatchRoute', '',
      'reconciled', false,
      'rateConfirmed', coalesce(f.client_info -> 'rateConfirmed', 'false'::jsonb),
      'invoiced', false
    )
  end as client_info,
  f.notes,
  case
    when is_admin((select auth.uid())) then f.edit_logs
    else coalesce((
      select jsonb_agg(e)
      from jsonb_array_elements(f.edit_logs) e
      where coalesce(e ->> 'fieldKey', e ->> 'field', '') ~
              '(標題|title|譯者|assignee|狀態|status|任務類型|taskType|計費單位|billingUnit|單位數|unitCount|單價|unitPrice|新增任務|刪除任務|費率|rateConfirmed|備註|note|相關案件|relatedCase|小計|總額)'
        and coalesce(e ->> 'fieldKey', e ->> 'field', '') !~
              '(客戶|client|聯絡人|contact|報價|營收|revenue|利潤|profit|關鍵字|keyword|ECI|eci|PO|對帳|reconcil|請款完成|invoiced|派案|dispatch|同一案件|費用群組|案號|caseId|案件單連結|內部備註|internalNote)'
    ), '[]'::jsonb)
  end as edit_logs,
  f.edit_log_phases,
  f.created_by,
  f.created_at,
  f.updated_at,
  f.finalized_by,
  f.finalized_at,
  f.env
from public.fees f;

grant select on public.fees_visible to authenticated;

comment on view public.fees_visible is 'W10：fees 欄位遮罩 view（security_invoker）。讀取走此 view，寫入走 fees 原表。非管理員遮蔽 internal_note、client_info 營收客戶區塊（僅留 rateConfirmed）、edit_logs 只留白名單欄位條目。新增 fees 欄位需同步本 view。';
