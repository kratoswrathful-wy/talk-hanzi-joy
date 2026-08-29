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
 *
 * PM（假執行長）測項可正常執行。
 *
 * ⚠️ 譯者（假譯者一）測項目前以 test.fixme 停用：
 *   2026-07-03 發現測試模式假人換人（dev-switch-user → verifyOtp）在自動化環境
 *   靜默失效，切換後仍以假執行長（管理員）身分執行，導致「譯者」測項失去意義。
 *   換人流程修復列入主計畫階段三（見 ENGINEERING_IMPROVEMENT_MASTER_PLAN §4 / §W5-3）。
 *   在此之前，W5-3 合併政策的譯者寫入面 RLS 改以 DB 層腳本驗證：
 *   supabase/tests/w5_billing_rls_check.sql（本人 ALLOW／他人 DENY，已通過）。
 *   switchToTestPersona 已加「切換後須為 active persona」斷言，修好換人流程後移除 fixme 即可啟用。
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
            get: (id: string) => Promise<{ ok: boolean; error?: string; data?: { id: string } }>;
          };
        };
      }).__lmsAgent;
      const assigneeOpts = agent.options.get("assignee");
      const translator =
        assigneeOpts.ok && assigneeOpts.data?.labels?.length ? assigneeOpts.data.labels[0] : "";
      if (!translator) return { ok: false, error: "無 assignee 選項" };
      const created = await agent.invoice.create({ translator, title: invTitle });
      if (!created.ok || !created.data) return { ok: false, error: created.error ?? "create failed" };
      const got = await agent.invoice.get(created.data.id);
      return { ok: got.ok && got.data?.id === created.data.id, error: got.error };
    }, title);
    expect(r.ok, r.error ?? "").toBe(true);
  });

  // fixme：依賴假人換人（目前自動化環境靜默失效，見檔頂說明）
  test.fixme("W5-T1-1 — 譯者可載入稿費請款列表", async ({ page }) => {
    await switchToTestPersona(page, "譯者一");
    await page.goto("/invoices");
    await expectListPageReady(page, "稿費請款");
  });

  // fixme：依賴假人換人（目前自動化環境靜默失效，見檔頂說明）
  test.fixme("W5-T1-2 — 譯者可新增自己的請款單（UI）", async ({ page }) => {
    await switchToTestPersona(page, "譯者一");
    await page.goto("/invoices");
    await expectListPageReady(page, "稿費請款");

    const addBtn = page.getByRole("button", { name: "新增請款單" });
    await expect(addBtn).toBeVisible({ timeout: 30_000 });
    await addBtn.click();

    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}/i, { timeout: 60_000 });
    await expect(page.getByText(/已建立請款單|請款/i).first()).toBeVisible({ timeout: 15_000 });
  });

  // 註：invoices SELECT policy 為「同 env 全體已認證可讀」（業務設計：譯者可見請款列表），
  // 故負向驗收針對**寫入面**——合併後的 invoices_insert WITH CHECK 僅允許 admin 或 translator=本人。
  // fixme：依賴假人換人（目前自動化環境靜默失效）；此負向已由 DB 層腳本
  // supabase/tests/w5_billing_rls_check.sql 涵蓋（他人 INSERT = DENY，已通過）。
  test.fixme("W5-T1-3 — 譯者不可為他人建立請款單（RLS WITH CHECK 負向）", async ({ page }) => {
    await switchToTestPersona(page, "譯者一");
    await page.goto("/invoices");
    await expectListPageReady(page, "稿費請款");
    await waitForTmsAgent(page);

    const title = uniqueTitle("w5-neg-other");
    const result = await page.evaluate(async (invTitle) => {
      const agent = (window as unknown as {
        __lmsAgent: {
          options: { get: (k: string) => { ok: boolean; data?: { labels?: string[] } } };
          invoice: {
            create: (i: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; data?: { id: string } }>;
          };
        };
      }).__lmsAgent;
      const assigneeOpts = agent.options.get("assignee");
      const labels = assigneeOpts.ok ? assigneeOpts.data?.labels ?? [] : [];
      // 選一個「非譯者一」的譯者名，作為要嘗試冒名建立的對象。
      const other = labels.find((l) => !l.includes("譯者一"));
      if (!other) return { skip: true, reason: "無非譯者一的 assignee 選項可測負向" };
      const res = await agent.invoice.create({ translator: other, title: invTitle });
      return { skip: false, created: res.ok, error: res.error ?? "" };
    }, title);

    test.skip(result.skip === true, result.reason);
    // RLS WITH CHECK 應阻擋：譯者一無法建立 translator 為他人的請款單。
    expect(result.created, "譯者一不應能為他人建立請款單").toBe(false);
  });
});
