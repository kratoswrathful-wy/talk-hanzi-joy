import { test, expect } from "@playwright/test";
import {
  expectListPageReady,
  expectOnlineTestMode,
  switchToTestPersona,
} from "./helpers/test-mode-persona";

/**
 * W10 批次 2＋3 — 譯者端遮罩／唯讀驗收（fees_visible 欄位遮罩＋費用模組純讀者）
 *
 * 換人流程（dev-switch-user → verifyOtp）2026-07-05 已修復：
 *   根因為 consumeTokenAndReload 在 verifyOtp 前呼叫 signOut()，而 GoTrue 的
 *   POST /logout?scope=local 會在「伺服器端」撤銷目前這張 session（local=僅目前這張）。
 *   測試模式中多個 Playwright context 共用同一張假執行長 session，任一 context 一旦
 *   signOut，其餘 context 的 token 就在伺服器端失效，換人時 dev-switch-user 內的
 *   getUser 回 401 → 換人失敗卻仍以原身分執行（誤判通過）。移除該 signOut 後，
 *   verifyOtp 會直接覆寫本機 session（實測不撤銷簽發者 session），換人穩定成功。
 *   （fix/dev-switch-user-persona-verify；診斷證據見同分支開發紀錄）
 *   switchToTestPersona 已內含「切換後須為 active persona」斷言（testing.mdc §6）。
 *   DB 層另有腳本佐證：supabase/tests/w10_fees_visible_mask_check.sql（14 項全 PASS）、
 *   supabase/tests/w10_fees_write_check.sql（7 項全 PASS）。
 *
 * 規格：docs/ENGINEERING_IMPROVEMENT_MASTER_PLAN_2026-07.md §9.2 / §9.3
 */
test.describe.configure({ mode: "serial" });

test.describe("W10 Phase 2 — 譯者端遮罩（fees_visible）", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/cases");
    await expectOnlineTestMode(page);
  });

  // 已由 DB 層腳本涵蓋；換人流程 2026-07-05 修復後改為實跑
  test("W10-T-1 — 譯者費用詳情：無營收內容、無費用內部備註", async ({ page }) => {
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
    // F1（2026-07-04 裁決）：譯者視角變更紀錄「區塊」必須存在（內容為 fees_visible
    // 白名單條目；空清單顯示「尚無可顯示的變更紀錄」），且條目不含營收／客戶欄位
    const editLogSection = page.getByTestId("fee-edit-log-section");
    await expect(editLogSection).toHaveCount(1);
    await expect(editLogSection.getByText("變更紀錄", { exact: true })).toBeVisible();
    await expect(editLogSection.getByText(/營收|利潤|客戶|報價|聯絡人|對帳|請款完成|派案|費率/)).toHaveCount(0);
  });

  // 換人流程 2026-07-05 修復後改為實跑
  test("W10-T-2 — 譯者直開他人／草稿費用單 URL 被擋", async ({ page }) => {
    await switchToTestPersona(page, "譯者一");
    // 需由管理員側預先提供一個「非本人或草稿」的 feeId 作為固定 fixture（換人流程修好後補）。
    const foreignFeeId = process.env.W10_FOREIGN_FEE_ID;
    test.skip(!foreignFeeId, "缺少他人/草稿 feeId fixture（換人流程修復後補）");
    await page.goto(`/fees/${foreignFeeId}`);
    // 遮罩 view + 列級 RLS：store 無該筆 → 詳情頁應為找不到／導回，不得顯示內容
    await expect(page.getByText("營收內容")).toHaveCount(0);
  });

  // DB 層由 w10_fees_write_check.sql 涵蓋（7 項全 PASS）；換人流程 2026-07-05 修復後改為實跑
  test("W10-T-3 — 譯者費用詳情：純讀者（無寫入控件、無刪除欄、無客戶請款狀態）", async ({ page }) => {
    await switchToTestPersona(page, "譯者一"); // 內含 active persona 斷言
    await page.goto("/fees");
    await expectListPageReady(page, "費用管理");

    // 清單頁：不得出現「新增費用」等寫入類工具列按鈕
    await expect(page.getByRole("button", { name: /新增費用/ })).toHaveCount(0);

    const feeId = await page.evaluate(() => {
      const a = (window as unknown as { __lmsAgent: { fee: { list: (f: Record<string, unknown>) => { ok: boolean; data?: { id: string }[] } } } }).__lmsAgent;
      const r = a.fee.list({});
      return r.ok && r.data && r.data.length ? r.data[0].id : null;
    });
    test.skip(!feeId, "譯者無本人非草稿費用單可開啟（需先備 fixture）");

    await page.goto(`/fees/${feeId}`);
    // 右上角動作列四顆寫入鈕不得出現
    await expect(page.getByRole("button", { name: /複製本頁/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^新增費用$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^刪除$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /開立稿費條/ })).toHaveCount(0);
    // 稿費內容：無「＋新增項目」「費率無誤」、任務表無「刪除」欄標頭
    await expect(page.getByRole("button", { name: /新增項目/ })).toHaveCount(0);
    await expect(page.getByText("費率無誤")).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "刪除" })).toHaveCount(0);
    // 客戶請款狀態欄位整塊隱藏（避免「標籤在、值恆為尚未請款」殘影）
    await expect(page.getByText("客戶請款狀態")).toHaveCount(0);
    // 任務項目輸入為唯讀（disabled）
    const unitPriceInputs = page.locator('input[inputmode="decimal"]');
    const n = await unitPriceInputs.count();
    for (let i = 0; i < n; i++) {
      await expect(unitPriceInputs.nth(i)).toBeDisabled();
    }
    // 「收錄至稿費請款單」為譯者正當功能，保留（不強制存在，視 fixture 狀態）
  });
});
