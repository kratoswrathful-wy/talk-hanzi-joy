import { test, expect } from "@playwright/test";
import {
  LMS_WRITE_SKIP_REASON,
  probeCanCreateCase,
  uniqueTitle,
  waitForTmsAgent,
} from "./helpers/ai-agent-eval";
import { expectListPageReady, expectOnlineTestMode } from "./helpers/test-mode-persona";

/**
 * W10 批次 2 — PM 讀取回歸（fees 讀取全面搬到 fees_visible）
 *
 * 讀取路徑切到遮罩 view 是全面搬家，PM 端是最大回歸面。本 spec 用 base storageState
 * （真人登入後進測試模式，扮演身分即管理員／執行長，無須換人流程），驗證 PM 端：
 *   - 四張列表載入正常
 *   - 費用詳情：營收內容＋費用內部備註可見（PM 讀 view 未遮）
 *   - 稿費請款詳情：可開啟（含展開費用明細）
 *   - 新增費用單（寫入原表）後重新載入（讀 fees_visible）清單即時反映 → 驗「寫原表、讀 view」來回
 *
 * 前置：setup 已進線上測試模式（env=test）。
 */
test.describe.configure({ mode: "serial" });

test.describe("W10 Phase 2 — PM 讀取回歸（fees_visible）", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/cases");
    await expectOnlineTestMode(page);
  });

  test("W10-PM-1 — 四張列表載入正常", async ({ page }) => {
    await expectListPageReady(page, "案件管理");
    await page.goto("/fees");
    await expectListPageReady(page, "費用管理");
    await page.goto("/invoices");
    await expectListPageReady(page, "稿費請款");
    await page.goto("/client-invoices");
    await expectListPageReady(page, "客戶請款");
  });

  test("W10-PM-2 — 費用詳情：PM 可見營收內容＋費用內部備註", async ({ page }) => {
    await page.goto("/fees");
    await expectListPageReady(page, "費用管理");
    await waitForTmsAgent(page);
    const feeId = await page.evaluate(() => {
      const a = (window as unknown as { __lmsAgent: { fee: { list: (f: Record<string, unknown>) => { ok: boolean; data?: { id: string }[] } } } }).__lmsAgent;
      const r = a.fee.list({});
      return r.ok && r.data && r.data.length ? r.data[0].id : null;
    });
    test.skip(!feeId, "測試環境無費用單可開啟");
    await page.goto(`/fees/${feeId}`);
    // 營收內容（ClientInfoSection，isManager 才渲染）＋費用內部備註（PM+）
    await expect(page.getByText("營收內容").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("費用內部備註").first()).toBeVisible({ timeout: 30_000 });
  });

  test("W10-PM-3 — 稿費請款詳情：PM 可開啟（含費用明細）", async ({ page }) => {
    await page.goto("/invoices");
    await expectListPageReady(page, "稿費請款");
    await waitForTmsAgent(page);
    const invId = await page.evaluate(() => {
      const a = (window as unknown as { __lmsAgent: { invoice: { list: (f: Record<string, unknown>) => { ok: boolean; data?: { id: string }[] } } } }).__lmsAgent;
      const r = a.invoice.list({});
      return r.ok && r.data && r.data.length ? r.data[0].id : null;
    });
    test.skip(!invId, "測試環境無請款單可開啟");
    await page.goto(`/invoices/${invId}`);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/permission denied|權限不足|無法載入/i)).toHaveCount(0);
  });

  test("W10-PM-4 — 新增費用單（寫原表）後讀 view 即時反映", async ({ page }) => {
    await page.goto("/fees");
    await expectListPageReady(page, "費用管理");
    await waitForTmsAgent(page);
    const canWrite = await probeCanCreateCase(page);
    test.skip(!canWrite.ok, `${LMS_WRITE_SKIP_REASON}${canWrite.error ? `（${canWrite.error}）` : ""}`);

    const title = uniqueTitle("w10-pm-fee");
    const r = await page.evaluate(async (feeTitle) => {
      const a = (window as unknown as {
        __lmsAgent: {
          options: { get: (k: string) => { ok: boolean; data?: { labels?: string[] } } };
          fee: { create: (i: Record<string, unknown>) => { ok: boolean; error?: string; data?: { id: string } } | Promise<{ ok: boolean; error?: string; data?: { id: string } }> };
        };
      }).__lmsAgent;
      const opts = a.options.get("assignee");
      const assignee = opts.ok && opts.data?.labels?.length ? opts.data.labels[0] : undefined;
      const created = await a.fee.create(assignee ? { title: feeTitle, assignee } : { title: feeTitle });
      return { ok: created.ok, error: created.error ?? "" };
    }, title);
    expect(r.ok, r.error).toBe(true);

    // 重新載入 → loadFees 走 fees_visible → 剛寫入原表的費用單應出現
    await page.reload();
    await expectListPageReady(page, "費用管理");
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });
  });
});
