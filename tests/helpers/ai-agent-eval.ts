import type { FrameLocator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { catFrame } from "./cat-frame";
import { waitForCatEditorReady } from "./cat-offline-open";

export const PW_PREFIX = "[PW] ai-bridge";

export function uniqueTitle(suffix: string): string {
  return `${PW_PREFIX} ${suffix} ${Date.now()}`;
}

/** 小文字檔 base64（內容：pw-test） */
export const PW_UPLOAD_BASE64 = Buffer.from("pw-test", "utf8").toString("base64");
export const PW_UPLOAD_FILE_NAME = "pw-test.txt";

export async function waitForTmsAgent(page: Page, timeoutMs = 30_000): Promise<void> {
  await page.waitForFunction(
    () => !!(window as unknown as { __tmsAgent?: unknown }).__tmsAgent,
    { timeout: timeoutMs },
  );
}

/** 探測目前登入者是否可寫入 cases（RLS 需 admin 且 env 與 current_env() 一致） */
export async function probeCanCreateCase(page: Page): Promise<{ ok: boolean; error?: string }> {
  await waitForTmsAgent(page);
  await page.waitForLoadState("networkidle").catch(() => {});
  return page.evaluate(async () => {
    const agent = (window as unknown as {
      __lmsAgent: {
        case: {
          create: (i: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
        };
      };
    }).__lmsAgent;
    const title = `[PW] probe ${Date.now()}`;
    const created = await agent.case.create({ title, status: "draft" });
    return { ok: created.ok, error: created.error };
  });
}

/** 探測是否可建立客戶請款 */
export async function probeCanCreateClientInvoice(page: Page): Promise<{ ok: boolean; error?: string }> {
  await waitForTmsAgent(page);
  return page.evaluate(async () => {
    const agent = (window as unknown as {
      __lmsAgent: {
        options: { get: (k: string) => { ok: boolean; data?: { labels?: string[] } } };
        clientInvoice: {
          create: (i: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
        };
      };
    }).__lmsAgent;
    const clientOpts = agent.options.get("client");
    const client = clientOpts.ok && clientOpts.data?.labels?.length ? clientOpts.data.labels[0] : "";
    if (!client) return { ok: false, error: "無可用 client 選項" };
    const created = await agent.clientInvoice.create({
      client,
      title: `[PW] probe ${Date.now()}`,
    });
    return { ok: created.ok, error: created.error };
  });
}

export const LMS_WRITE_SKIP_REASON =
  "無法寫入案件／請款：請確認為 admin，且 env 與 current_env() 一致 — 線上請設 PLAYWRIGHT_ENTER_TEST_MODE=1（進測試模式）；本機請用 localhost 或 @test.local 假人";

/** 測試失敗時附帶已建立的資源 id */
export class PwTestContext {
  caseId?: string;
  feeId?: string;
  invoiceId?: string;
  clientInvoiceId?: string;
  projectName?: string;

  footnote(): string {
    const parts: string[] = [];
    if (this.caseId) parts.push(`caseId=${this.caseId}`);
    if (this.feeId) parts.push(`feeId=${this.feeId}`);
    if (this.invoiceId) parts.push(`invoiceId=${this.invoiceId}`);
    if (this.clientInvoiceId) parts.push(`clientInvoiceId=${this.clientInvoiceId}`);
    if (this.projectName) parts.push(`projectName=${this.projectName}`);
    return parts.length ? `\n[清理提示] ${parts.join(", ")}` : "";
  }
}

export async function waitForCatIframeUserId(frame: FrameLocator, timeoutMs = 30_000): Promise<void> {
  await expect
    .poll(
      async () =>
        frame.locator("body").evaluate(() => {
          const uid = (window as unknown as { _tmsCurrentUserId?: string })._tmsCurrentUserId;
          return !!(uid && String(uid) !== "local");
        }),
      { timeout: timeoutMs },
    )
    .toBe(true);
}

export async function reopenCatFileInIframe(frame: FrameLocator, projectName: string): Promise<FrameLocator> {
  await frame.locator('[data-view="viewProjects"]').click();
  await expect
    .poll(
      async () =>
        frame.locator("#viewProjects").evaluate((el) => !el.classList.contains("hidden")),
      { timeout: 30_000 },
    )
    .toBe(true);

  const project = frame.locator(".resource-name", { hasText: projectName });
  await project.first().waitFor({ state: "visible", timeout: 30_000 });
  await project.first().click();

  const skip = frame.locator("#btnProjectWelcomeSkip");
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
  }

  await frame.locator(".edit-file-btn").first().waitFor({ state: "visible", timeout: 30_000 });
  await frame.locator(".edit-file-btn").first().click();
  await waitForCatEditorReady(frame, 180_000);

  return frame;
}

export async function reopenOfflineCatProjectFile(page: Page, projectName: string): Promise<FrameLocator> {
  await page.goto("/cat/offline/projects");
  const frame = catFrame(page);
  await frame.locator("body").waitFor({ state: "attached", timeout: 30_000 });

  await frame.locator('[data-view="viewProjects"]').click();
  await frame.locator("#viewProjects").waitFor({ state: "visible", timeout: 15_000 });

  const project = frame.locator(".resource-name", { hasText: projectName });
  await project.first().waitFor({ state: "visible", timeout: 30_000 });
  await project.first().click();

  const skip = frame.locator("#btnProjectWelcomeSkip");
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
  }

  await frame.locator(".edit-file-btn").first().waitFor({ state: "visible", timeout: 30_000 });
  await frame.locator(".edit-file-btn").first().click();
  await waitForCatEditorReady(frame, 180_000);

  return frame;
}
