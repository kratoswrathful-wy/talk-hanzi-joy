-- W10 工項 C 退回補修（2026-07-19）：堵住 PostgREST 直讀 public.fees 基表繞過遮罩
--
-- 問題：譯者 Bearer 呼叫 GET /rest/v1/fees?select=* 仍 200 且回傳完整 client_info／edit_logs。
-- 原因：fees_select 仍允許本人非草稿列級讀取；前端走 fees_visible 無法阻止基表 API。
--
-- 修法：
--   1) fees SELECT 僅 is_admin（寫入政策不變；UPDATE 所需 SELECT 僅 admin 需要）
--   2) fees_visible 改 security_invoker=false（以 view owner 讀基表，繞過呼叫者對 fees 的 RLS），
--      並在 view 內嵌入原列級條件＋欄位遮罩；譯者讀取一律走此 view
--
-- 注意：auth.uid()／current_env()／is_admin() 仍取「工作階段」JWT，非 owner 身分。

-- ── 1) 基表 SELECT：僅 PM／執行長 ──
drop policy if exists fees_select on public.fees;
create policy fees_select on public.fees
  for select
  using (
    is_admin((select auth.uid()))
    and env = current_env()
  );

-- ── 2) 重建 fees_visible：security definer 行為＋列過濾＋欄位遮罩 ──
drop view if exists public.fees_visible;

create view public.fees_visible
with (security_invoker = false)
as
select
  f.id,
  f.title,
  f.assignee,
  f.status,
  f.internal_note,
  f.internal_note_url,
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
              '(標題|title|譯者|assignee|狀態|status|任務類型|taskType|計費單位|billingUnit|單位數|unitCount|單價|unitPrice|新增任務|刪除任務|備註|note|相關案件|relatedCase|internalNote|小計|總額)'
        and coalesce(e ->> 'fieldKey', e ->> 'field', '') !~
              '(客戶|client|聯絡人|contact|報價|營收|revenue|利潤|profit|關鍵字|keyword|ECI|eci|PO|對帳|reconcil|請款完成|invoiced|派案|dispatch|同一案件|費用群組|案號|caseId|案件單連結|內部備註|internalComments|費率|rateConfirmed)'
    ), '[]'::jsonb)
  end as edit_logs,
  f.edit_log_phases,
  f.created_by,
  f.created_at,
  f.updated_at,
  f.finalized_by,
  f.finalized_at,
  f.env
from public.fees f
where f.env = current_env()
  and (
    is_admin((select auth.uid()))
    or (
      f.assignee = (select p.display_name from public.profiles p where p.id = (select auth.uid()))
      and f.status <> 'draft'
    )
  );

-- 明確回收 anon；authenticated 只准讀 view（基表靠 RLS 擋非 admin）
revoke all on public.fees_visible from public, anon;
grant select on public.fees_visible to authenticated;
grant select on public.fees_visible to service_role;

comment on view public.fees_visible is
  'W10：fees 遮罩 view（security_invoker=false）。列級條件內嵌於 WHERE；非 admin 遮罩 client_info／edit_logs；internal_note＝相關案件。基表 fees SELECT 僅 admin——禁止 PostgREST 直讀繞過。';

comment on policy fees_select on public.fees is
  'W10 C 退回：非 admin 不得 SELECT fees 基表；譯者讀取走 fees_visible。';
