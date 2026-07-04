-- W10 批次 3：fees 寫入僅 PM/執行長（入庫防漂移）+ fees_visible 移除 rateConfirmed
--
-- 背景：擁有者裁定「譯者在費用模組為純讀者」。盤點結果：
--   1. fees 的 INSERT/UPDATE/DELETE 現況**已**是 is_admin-only（譯者本就無法寫）；
--      但這三條政策先前以 ad hoc（非 migration）套用，repo 未記錄 → 依架構規則 §7 補入庫。
--      本段為 idempotent 重建（行為與現況等價，DROP IF EXISTS 後重建）。
--   2. 全前端無「譯者 session 寫 fees」路徑（fee-store 為唯一寫入者；cat-wf-lms-sync /
--      任務完成連動皆不寫 fees），故收緊不會弄壞系統連動。
--   3. rateConfirmed（費率無誤）為 PM 動作、譯者不再看得到 → 從 fees_visible 白名單移除，
--      非管理員一律清空（原批次 2 曾保留，此處撤回）。
--
-- 維持 W5 準則：auth.uid() 一律 (select auth.uid()) 包裹；每表每 cmd 單一 permissive policy。

-- ── fees 寫入政策：僅 PM/執行長（idempotent 重建，行為等價現況）──
drop policy if exists fees_insert on public.fees;
create policy fees_insert on public.fees
  for insert
  with check ( is_admin((select auth.uid())) and env = current_env() );

drop policy if exists fees_update on public.fees;
create policy fees_update on public.fees
  for update
  using ( is_admin((select auth.uid())) and env = current_env() );

drop policy if exists fees_delete on public.fees;
create policy fees_delete on public.fees
  for delete
  using ( is_admin((select auth.uid())) and env = current_env() );

-- ── fees_visible：移除 rateConfirmed 白名單（非管理員一律清空 client_info 敏感值）──
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
      'rateConfirmed', false,
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
              '(標題|title|譯者|assignee|狀態|status|任務類型|taskType|計費單位|billingUnit|單位數|unitCount|單價|unitPrice|新增任務|刪除任務|備註|note|相關案件|relatedCase|小計|總額)'
        and coalesce(e ->> 'fieldKey', e ->> 'field', '') !~
              '(客戶|client|聯絡人|contact|報價|營收|revenue|利潤|profit|關鍵字|keyword|ECI|eci|PO|對帳|reconcil|請款完成|invoiced|派案|dispatch|同一案件|費用群組|案號|caseId|案件單連結|內部備註|internalNote|費率|rateConfirmed)'
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
  'W10：fees 欄位遮罩 view（security_invoker）。讀取走此 view，寫入走 fees 原表。非管理員遮蔽 internal_note/內部備註、client_info 營收客戶區塊（含 rateConfirmed，批次3 起一律清空）、edit_logs 只留白名單欄位條目（排除費率）。新增 fees 欄位需同步本 view。';
