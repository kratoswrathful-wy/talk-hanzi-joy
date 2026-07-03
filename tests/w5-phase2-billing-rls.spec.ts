import { test, expect } from "@playwright/test";
import {
  LMS_WRITE_SKIP_REASON,
  probeCanCreateCase,
  uniqueTitle,
  waitForTmsAgent,
} from "./helpers/ai-agent-eval";
import {
  expectListPageReady,
  expectOnlineTestMode,
  switchToTestPersona,
} from "./helpers/test-mode-persona";

/**
 * W5 階段二驗收：billing RLS（invoice_fees / invoices 合併 policy 後）
 * 雙角色 smoke — PM（假執行長）＋譯者（假譯者一）。
 *
 * 前置：PLAYWRIGHT_ENTER_TEST_MODE=1、setup 已進測試模式（env=test）。
 */
test.describe.configure({ mode: "serial" });

test.describe("W5 Phase 2 — billing RLS（Playwright）", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/cases");
    await expectOnlineTestMode(page);
  });

  test("W5-PM-1 — PM 可載入案件／費用／稿費請款／客戶請款列表", async ({ page }) => {
    await expectListPageReady(page, "案件管理");

    await page.goto("/fees");
    await expectListPageReady(page, "費用管理");

    await page.goto("/invoices");
    await expectListPageReady(page, "稿費請款");

    await page.goto("/client-invoices");
    await expectListPageReady(page, "客戶請款");
  });

  test("W5-PM-2 — PM 可建立譯者請款（__lmsAgent invoice.create）", async ({ page }) => {
    await waitForTmsAgent(page);
    const canWrite = await probeCanCreateCase(page);
    test.skip(!canWrite.ok, `${LMS_WRITE_SKIP_REASON}${canWrite.error ? `（${canWrite.error}）` : ""}`);

    const title = uniqueTitle("w5-pm-invoice");
    const r = await page.evaluate(async (invTitle) => {
      const agent = (window as unknown as {
        __lmsAgent: {
          options: { get: (k: string) => { ok: boolean; data?: { labels?: string[] } } };
          invoice: {
            create: (i: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; data?: { id: string } }>;
            get: (id: string) => { ok: boolean; error?: string; data?: { id: string } };
          };
        };
      }).__lmsAgent;
      const assigneeOpts = agent.options.get("assignee");
      const translator =
        assigneeOpts.ok && assigneeOpts.data?.labels?.length ? assigneeOpts.data.labels[0] : "";
      if (!translator) return { ok: false, error: "無 assignee 選項" };
      const created = await agent.invoice.create({ translator, title: invTitle });
      if (!created.ok || !created.data) return { ok: false, error: created.error ?? "create failed" };
      const got = agent.invoice.get(created.data.id);
      return { ok: got.ok && got.data?.id === created.data.id, error: got.error };
    }, title);
    expect(r.ok, r.error ?? "").toBe(true);
  });

  test("W5-T1-1 — 譯者可載入稿費請款列表", async ({ page }) => {
    await switchToTestPersona(page, "譯者一");
    await page.goto("/invoices");
    await expectListPageReady(page, "稿費請款");
  });

  test("W5-T1-2 — 譯者可新增自己的請款單（UI）", async ({ page }) => {
    await switchToTestPersona(page, "譯者一");
    await page.goto("/invoices");
    await expectListPageReady(page, "稿費請款");

    const addBtn = page.getByRole("button", { name: "新增請款單" });
    await expect(addBtn).toBeVisible({ timeout: 30_000 });
    await addBtn.click();

    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}/i, { timeout: 60_000 });
    await expect(page.getByText(/已建立請款單|請款/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
