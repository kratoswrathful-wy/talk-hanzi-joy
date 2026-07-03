import { test, expect } from "@playwright/test";
import {
  expectListPageReady,
  expectOnlineTestMode,
  switchToTestPersona,
} from "./helpers/test-mode-persona";

/**
 * W10 批次 2 — 譯者端遮罩驗收（fees_visible 欄位遮罩）
 *
 * ⚠️ 全數 test.fixme：依賴測試模式「換人」（dev-switch-user → verifyOtp），
 *   2026-07-03 起在自動化環境靜默失效（切換後仍以假執行長／管理員身分執行），
 *   會使「譯者」遮罩驗收失去意義。修復列入主計畫階段三。
 *   在此之前，譯者端遮罩以 DB 層腳本 supabase/tests/w10_fees_visible_mask_check.sql
 *   驗證（14 項全 PASS：client_info/internal_note/edit_logs 遮罩、rateConfirmed/task_items 保留），
 *   並由執行長手動切換抽查。switchToTestPersona 已內含「切換後須為 active persona」斷言
 *   （testing.mdc §6：斷言前先驗證當前生效身分），換人流程修好後移除 fixme 即可啟用。
 *
 * 規格：docs/ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md §9.2
 */
test.describe.configure({ mode: "serial" });

test.describe("W10 Phase 2 — 譯者端遮罩（fees_visible）", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/cases");
    await expectOnlineTestMode(page);
  });

  // fixme：依賴假人換人（見檔頂說明）；已由 DB 層腳本涵蓋
  test.fixme("W10-T-1 — 譯者費用詳情：無營收內容、無費用內部備註", async ({ page }) => {
    await switchToTestPersona(page, "譯者一"); // 內含 active persona 斷言
    await page.goto("/fees");
    await expectListPageReady(page, "費用管理");

    const feeId = await page.evaluate(() => {
      const a = (window as unknown as { __lmsAgent: { fee: { list: (f: Record<string, unknown>) => { ok: boolean; data?: { id: string }[] } } } }).__lmsAgent;
      const r = a.fee.list({});
      return r.ok && r.data && r.data.length ? r.data[0].id : null;
    });
    test.skip(!feeId, "譯者無本人非草稿費用單可開啟（需先備 fixture）");

    await page.goto(`/fees/${feeId}`);
    // 遮罩：營收內容區塊與費用內部備註不得出現
    await expect(page.getByText("營收內容")).toHaveCount(0);
    await expect(page.getByText("費用內部備註")).toHaveCount(0);
    // 遮罩：變更紀錄不得出現金額／營收／客戶字樣
    await expect(page.getByText(/營收|利潤|客戶報價/)).toHaveCount(0);
  });

  // fixme：依賴假人換人（見檔頂說明）
  test.fixme("W10-T-2 — 譯者直開他人／草稿費用單 URL 被擋", async ({ page }) => {
    await switchToTestPersona(page, "譯者一");
    // 需由管理員側預先提供一個「非本人或草稿」的 feeId 作為固定 fixture（換人流程修好後補）。
    const foreignFeeId = process.env.W10_FOREIGN_FEE_ID;
    test.skip(!foreignFeeId, "缺少他人/草稿 feeId fixture（換人流程修復後補）");
    await page.goto(`/fees/${foreignFeeId}`);
    // 遮罩 view + 列級 RLS：store 無該筆 → 詳情頁應為找不到／導回，不得顯示內容
    await expect(page.getByText("營收內容")).toHaveCount(0);
  });
});
