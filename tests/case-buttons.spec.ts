import { test, expect, type Page } from "@playwright/test";
import { expectTestModePersonaUiReady } from "./helpers/test-mode-persona";
import { accessToken, localApi, readAudit, readCaseState, restClient } from "./helpers/isolated-api";

/**
 * 新增案件＋任務完成：實際按鈕 → 後端讀回。
 * 只在隔離 Supabase 啟用：PLAYWRIGHT_CASE_BUTTONS_UI=1
 * 測試模式／localhost 本身不等於後端隔離。
 */
const ENABLED = process.env.PLAYWRIGHT_CASE_BUTTONS_UI === "1";
const describeButtons = ENABLED ? test.describe : test.describe.skip;

type AgentResult<T> = { ok: boolean; data?: T; error?: string };

function trackCreateCaseIds(page: Page) {
  const ids: string[] = [];
  page.on("request", (req) => {
    if (!req.url().includes("/rpc/admin_create_case")) return;
    try {
      const body = req.postDataJSON() as { p_case_id?: string };
      if (body?.p_case_id) ids.push(body.p_case_id);
    } catch {
      /* ignore */
    }
  });
  return {
    ids,
    uniqueCount: () => new Set(ids).size,
  };
}

async function waitAgent(page: Page) {
  await page.waitForFunction(() => !!(window as unknown as { __lmsAgent?: unknown }).__lmsAgent, null, {
    timeout: 60_000,
  });
}

async function createDispatchedViaAgent(
  page: Page,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  await page.goto("/cases");
  await expectTestModePersonaUiReady(page);
  await waitAgent(page);
  const created = await page.evaluate(
    async ({ caseTitle, more }) => {
      const agent = (window as unknown as {
        __lmsAgent: {
          case: { create: (i: Record<string, unknown>) => Promise<AgentResult<{ id: string }>> };
        };
      }).__lmsAgent;
      return agent.case.create({ title: caseTitle, status: "dispatched", ...more });
    },
    { caseTitle: title, more: extra },
  );
  expect(created.ok, created.error).toBe(true);
  return created.data!.id;
}

describeButtons("案件按鈕（隔離操作驗收）", () => {
  test.describe.configure({ mode: "default" });

  test("列表新增：按鈕送出、建案、導航且後端讀回同一識別", async ({ page }) => {
    const tracked = trackCreateCaseIds(page);
    await page.goto("/cases");
    await expectTestModePersonaUiReady(page);
    const createBtn = page.getByTestId("create-case-button").first();
    await expect(createBtn).toBeEnabled();
    await createBtn.click();
    await page.waitForURL(/\/cases\/[0-9a-f-]{36}/, { timeout: 60_000 });
    const id = page.url().match(/\/cases\/([^/?#]+)/)?.[1];
    expect(id).toBeTruthy();
    expect(tracked.ids).toContain(id);
    expect(tracked.uniqueCount()).toBe(1);
    const rest = restClient(page.request, await accessToken(page));
    await expect.poll(() => readCaseState(rest, id!)).toMatchObject({ id });
  });

  test("詳情新增：同樣送出並導航，不換第二個識別", async ({ page }) => {
    const seedId = await createDispatchedViaAgent(
      page,
      `[AI驗收] 按鈕詳情種子 ${Date.now().toString(36)}`,
    );
    const tracked = trackCreateCaseIds(page);
    await page.goto(`/cases/${seedId}`);
    await expectTestModePersonaUiReady(page);
    await expect(page.getByTestId("create-case-button").first()).toBeEnabled();
    await page.getByTestId("create-case-button").first().click();
    await page.waitForURL((url) => {
      const m = url.pathname.match(/^\/cases\/([^/]+)/);
      return !!m && m[1] !== seedId;
    }, { timeout: 60_000 });
    const id = page.url().match(/\/cases\/([^/?#]+)/)?.[1];
    expect(id).toBeTruthy();
    expect(id).not.toBe(seedId);
    expect(tracked.uniqueCount()).toBe(1);
  });

  test("建案拒絕：明確提示、未建立、不連點多建", async ({ page }) => {
    const tracked = trackCreateCaseIds(page);
    await page.route("**/rest/v1/rpc/admin_create_case", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ code: "42501", message: "not_authorized" }),
      });
    });
    await page.goto("/cases");
    await expectTestModePersonaUiReady(page);
    const btn = page.getByTestId("create-case-button").first();
    await btn.click();
    await expect(page.getByText("無法新增案件", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("後端已明確拒絕")).toBeVisible();
    await expect(page).toHaveURL(/\/cases\/?$/);
    await btn.click();
    expect(tracked.uniqueCount()).toBe(tracked.ids.length);
    expect(tracked.ids.length).toBeGreaterThanOrEqual(1);
  });

  test("讀回失敗：保留識別、不報成沒建立、不換識別再建", async ({ page }) => {
    const reserved: string[] = [];
    await page.route("**/rest/v1/cases_visible*", async (route) => {
      const req = route.request();
      if (req.method() === "GET" && reserved[0] && req.url().includes(reserved[0])) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ code: "57014", message: "canceling statement due to statement timeout" }),
        });
        return;
      }
      await route.continue();
    });
    page.on("request", (req) => {
      if (!req.url().includes("/rpc/admin_create_case")) return;
      try {
        const body = req.postDataJSON() as { p_case_id?: string };
        if (body?.p_case_id) reserved.push(body.p_case_id);
      } catch {
        /* ignore */
      }
    });
    await page.goto("/cases");
    await expectTestModePersonaUiReady(page);
    await page.getByTestId("create-case-button").first().click();
    await expect(page.getByText("新案件已建立，但資料讀不回")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/不要再按一次新增/)).toBeVisible();
    expect(reserved[0]).toBeTruthy();
    await expect(page.getByText(reserved[0], { exact: false })).toBeVisible();
    await expect(page).not.toHaveURL(new RegExp(`/cases/${reserved[0]}`));
    const before = reserved.length;
    await page.getByTestId("create-case-button").first().click();
    await expect.poll(() => reserved.length).toBeGreaterThan(before);
    expect(new Set(reserved).size).toBe(reserved.length);
  });

  test("回應遺失：同一識別查證，不明結果不引導再建", async ({ page }) => {
    const reserved: string[] = [];
    let aborted = false;
    await page.route("**/rest/v1/rpc/admin_create_case", async (route) => {
      const body = route.request().postDataJSON() as { p_case_id?: string };
      if (body?.p_case_id) reserved.push(body.p_case_id);
      if (!aborted) {
        aborted = true;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    await page.goto("/cases");
    await expectTestModePersonaUiReady(page);
    await page.getByTestId("create-case-button").first().click();
    await expect(
      page.getByText(/建案結果不明|新案件已建立，但資料讀不回|已新增案件/),
    ).toBeVisible({ timeout: 30_000 });
    expect(reserved[0]).toBeTruthy();
    const rest = restClient(page.request, await accessToken(page));
    const row = await readCaseState(rest, reserved[0]);
    if (row) {
      expect(row.id).toBe(reserved[0]);
    } else {
      await expect(page.getByText(reserved[0], { exact: false })).toBeVisible();
      await expect(page.getByText(/不要再按一次新增/)).toBeVisible();
    }
  });

  test("連點：busy 期間不送出第二個識別", async ({ page }) => {
    const reserved: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/rest/v1/rpc/admin_create_case", async (route) => {
      const body = route.request().postDataJSON() as { p_case_id?: string };
      if (body?.p_case_id) reserved.push(body.p_case_id);
      await gate;
      await route.continue();
    });
    await page.goto("/cases");
    await expectTestModePersonaUiReady(page);
    const btn = page.getByTestId("create-case-button").first();
    await btn.click();
    await expect(btn).toBeDisabled();
    await btn.click({ force: true }).catch(() => undefined);
    await expect.poll(() => reserved.length).toBe(1);
    release();
    await page.waitForURL(/\/cases\/[0-9a-f-]{36}/, { timeout: 60_000 });
    expect(reserved).toHaveLength(1);
  });

  test("管理代完成：實際按鈕 → 狀態／revision／audit 讀回，不走譯者 RPC", async ({ page }) => {
    const title = `[AI驗收] 代完成 ${Date.now().toString(36)}`;
    const caseId = await createDispatchedViaAgent(page, title);
    const completeHits: string[] = [];
    page.on("request", (req) => {
      const path = new URL(req.url()).pathname;
      if (path.endsWith("/complete_case_translation") || path.endsWith("/pm_complete_case_translation")) {
        completeHits.push(path.split("/").pop() ?? "");
      }
    });
    await page.goto(`/cases/${caseId}`);
    await expectTestModePersonaUiReady(page);
    const rest = restClient(page.request, await accessToken(page));
    const before = await readCaseState(rest, caseId);
    expect(before?.status).toBe("dispatched");
    await expect(page.getByTestId("task-complete-button")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("task-complete-button").click();
    await expect(page.getByText("已由管理身分代為完成")).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await readCaseState(rest, caseId))?.status).toBe("task_completed");
    const after = await readCaseState(rest, caseId);
    expect(after?.revision).toBeGreaterThan(before!.revision);
    const audit = await readAudit(rest, caseId);
    expect(audit.some((a) => a.action === "pm_complete_case_translation")).toBe(true);
    expect(completeHits).toContain("pm_complete_case_translation");
    expect(completeHits).not.toContain("complete_case_translation");
  });
});
