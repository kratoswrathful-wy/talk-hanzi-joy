-- W10 批次 2：fees_visible 欄位遮罩 view（security_invoker + CASE）
--
-- 背景：RLS 只能管「列」；欄位級遮罩須在此 view 做。批次 1 已把 fees 列級收緊
--       （譯者只見本人非草稿列）；本 view 在其上對「非管理員」遮蔽敏感欄位，
--       確保營收/客戶/內部備註即使透過 API、開發者工具、realtime 重查也看不到。
--
-- 設計：
--   security_invoker = on → 查詢時套用查詢者自身的 RLS（沿用批次 1 fees_select 列級規則）。
--   欄位 CASE WHEN is_admin THEN 原值 ELSE 遮罩值 END。
--   前端「讀取」一律走本 view；「寫入」仍走 fees 原表。
--
-- 譯者白名單欄位（原值）：title、assignee、status、task_items、notes（費用相關備註）、
--   client_info 僅保留 rateConfirmed（費率無誤勾選）、建立者/時間、finalized_*、env。
-- 譯者禁區（遮罩）：
--   internal_note / internal_note_url（內部備註，PM 以上）→ 空字串
--   client_info 營收/客戶整區塊 → 結構保留、敏感值清空（僅留 rateConfirmed）
--   edit_logs → SQL 層過濾，只留白名單欄位條目（歷史營收舊值躺在 JSONB，必須在此擋）
--
-- edit_logs 白名單/黑名單以 field/fieldKey 正則判定（黑名單優先）；預設 deny（不符白名單即丟棄）。
-- TS 端 filterEditLogsFeeDetail 保留為第二層。
--
-- 維護：新增 fees 欄位時務必同步加進本 view，否則讀取端拿不到新欄位。
--       w10_translator_read_check.sql 內含欄位漂移檢查會抓到遺漏。

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

comment on view public.fees_visible is
  'W10：fees 欄位遮罩 view（security_invoker）。讀取走此 view，寫入走 fees 原表。非管理員遮蔽 internal_note/內部備註、client_info 營收客戶區塊（僅留 rateConfirmed）、edit_logs 只留白名單欄位條目。新增 fees 欄位需同步本 view。';
