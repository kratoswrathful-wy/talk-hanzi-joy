-- W10 批次 1：譯者讀取列級收緊（invoices / invoice_fees / fees）
--
-- 擁有者 2026-07-03 裁定「譯者可見他人請款/費用」為錯誤，須收緊。
-- 原政策：三張表 SELECT 皆為「同 env 全體已認證可讀」。
-- 新政策（每表單一 permissive SELECT policy，不製造重疊）：
--   env = current_env() AND ( PM/執行長(is_admin) OR 本人 )
--   本人判定：沿用 display_name（與現有寫入政策一致，最小變更）。
--   fees 另加「草稿條款」：稿費開立狀態 status = 'draft' 者，即使 assignee 是本人也不可見。
--
-- 維持 W5 準則：auth.uid() 一律 (select auth.uid()) 包裹。
-- 欄位級遮罩（營收/客戶欄位、內部備註、變更紀錄過濾）屬批次 2，另案。
-- idempotent：DROP POLICY IF EXISTS 後重建。

-- ── invoices ──
drop policy if exists "Authenticated users can read invoices" on public.invoices;
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select
  using (
    (env = current_env())
    and (
      is_admin((select auth.uid()))
      or translator = (select display_name from public.profiles where id = (select auth.uid()))
    )
  );

-- ── invoice_fees ──（透過所屬 invoice 的 translator 判定本人）
drop policy if exists "Authenticated users can read invoice_fees" on public.invoice_fees;
drop policy if exists invoice_fees_select on public.invoice_fees;
create policy invoice_fees_select on public.invoice_fees
  for select
  using (
    (env = current_env())
    and (
      is_admin((select auth.uid()))
      or exists (
        select 1 from public.invoices i
        where i.id = invoice_fees.invoice_id
          and i.translator = (select display_name from public.profiles where id = (select auth.uid()))
      )
    )
  );

-- ── fees ──（本人 assignee 且非草稿）
drop policy if exists "Authenticated users can read fees" on public.fees;
drop policy if exists fees_select on public.fees;
create policy fees_select on public.fees
  for select
  using (
    (env = current_env())
    and (
      is_admin((select auth.uid()))
      or (
        assignee = (select display_name from public.profiles where id = (select auth.uid()))
        and status <> 'draft'
      )
    )
  );
