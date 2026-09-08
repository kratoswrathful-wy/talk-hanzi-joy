import { test, expect, type Page } from "@playwright/test";
import {
  accessToken,
  localApi,
  readAudit,
  readCaseState,
  readParticipants,
  restClient,
} from "./helpers/isolated-api";
import { expectSignedInAs, loginAs } from "./helpers/login-as";

/**
 * 新增案件＋任務完成：實際按鈕 → 後端讀回。
 * 只在隔離 Supabase 啟用：PLAYWRIGHT_CASE_BUTTONS_UI=1
 * 身分必須是隔離 Auth 真正登入的 @test.local，不得用測試模式假人代替授權。
 */
const ENABLED = process.env.PLAYWRIGHT_CASE_BUTTONS_UI === "1";
const describeButtons = ENABLED ? test.describe : test.describe.skip;

/** Radix toast 標題與螢幕閱讀器 live region 會重複同一句，取第一個即可。 */
function toastCopy(page: Page, text: string | RegExp, exact = false) {
  return page.getByText(text, typeof text === "string" && exact ? { exact: true } : {}).first();
}

function cred(role: "pm" | "exec" | "t1" | "t2"): { email: string; password: string } {
  const map = {
    pm: [process.env.PLAYWRIGHT_ISO_PM_EMAIL, process.env.PLAYWRIGHT_ISO_PM_PASSWORD],
    exec: [process.env.PLAYWRIGHT_ISO_EXEC_EMAIL, process.env.PLAYWRIGHT_ISO_EXEC_PASSWORD],
    t1: [process.env.PLAYWRIGHT_ISO_T1_EMAIL, process.env.PLAYWRIGHT_ISO_T1_PASSWORD],
    t2: [process.env.PLAYWRIGHT_ISO_T2_EMAIL, process.env.PLAYWRIGHT_ISO_T2_PASSWORD],
  } as const;
  const [email, password] = map[role];
  expect(email, `缺少 ${role} email`).toBeTruthy();
  expect(password, `缺少 ${role} password`).toBeTruthy();
  return { email: email!, password: password! };
}

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
  return { ids, uniqueCount: () => new Set(ids).size };
}

async function sessionUserId(page: Page): Promise<string> {
  const sub = await page.evaluate(() => {
    function b64urlDecode(s: string): string {
      let t = s.replace(/-/g, "+").replace(/_/g, "/");
      while (t.length % 4) t += "=";
      return atob(t);
    }
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /sb-.*-auth-token(\.\d+)?$/.test(k)) keys.push(k);
    }
    keys.sort();
    let raw = keys.map((k) => localStorage.getItem(k) ?? "").join("");
    if (raw.startsWith("base64-")) raw = b64urlDecode(raw.slice(7));
    const parsed = JSON.parse(raw) as { access_token?: string };
    const claims = JSON.parse(b64urlDecode(parsed.access_token!.split(".")[1])) as { sub?: string };
    return claims.sub ?? "";
  });
  expect(sub).toBeTruthy();
  return sub;
}

async function restFor(page: Page) {
  return restClient(page.request, await accessToken(page));
}

async function assignAndDispatch(
  page: Page,
  caseId: string,
  translatorUserId: string,
  translatorLabel: string,
) {
  const rest = await restFor(page);
  const before = await readCaseState(rest, caseId);
  expect(before).toBeTruthy();
  const result = await rest.rpc<{ ok?: boolean; error?: string }>("pm_update_case_assignments", {
    p_case_id: caseId,
    p_expected_revision: before!.revision,
    p_patch: {
      translator: [translatorLabel],
      translator_user_id: translatorUserId,
      status: "dispatched",
    },
  });
  expect(result.ok, result.text).toBe(true);
}

async function createDraftViaButton(page: Page): Promise<string> {
  const tracked = trackCreateCaseIds(page);
  const btn = page.getByTestId("create-case-button").first();
  await expect(btn).toBeEnabled();
  await btn.click();
  await page.waitForURL(/\/cases\/[0-9a-f-]{36}/, { timeout: 60_000 });
  const id = page.url().match(/\/cases\/([^/?#]+)/)?.[1];
  expect(id).toBeTruthy();
  expect(tracked.ids).toContain(id);
  return id!;
}

describeButtons("案件按鈕（隔離操作驗收）", () => {
  test.describe.configure({ mode: "default" });

  test("列表新增：真實 PM session 按鈕送出、導航、後端同一識別", async ({ browser }) => {
    localApi();
    const pm = await loginAs(browser, cred("pm").email, cred("pm").password);
    try {
      await pm.page.goto("/cases");
      await expectSignedInAs(pm.page, cred("pm").email);
      const id = await createDraftViaButton(pm.page);
      const rest = await restFor(pm.page);
      await expect.poll(() => readCaseState(rest, id)).toMatchObject({ id });
    } finally {
      await pm.close();
    }
  });

  test("詳情新增：同樣送出並導航，不換第二個識別", async ({ browser }) => {
    const pm = await loginAs(browser, cred("pm").email, cred("pm").password);
    try {
      await pm.page.goto("/cases");
      const first = await createDraftViaButton(pm.page);
      const tracked = trackCreateCaseIds(pm.page);
      await expect(pm.page.getByTestId("create-case-button").first()).toBeEnabled();
      await pm.page.getByTestId("create-case-button").first().click();
      await pm.page.waitForURL((url) => {
        const m = url.pathname.match(/^\/cases\/([^/]+)/);
        return !!m && m[1] !== first;
      }, { timeout: 60_000 });
      const second = pm.page.url().match(/\/cases\/([^/?#]+)/)?.[1];
      expect(second).toBeTruthy();
      expect(second).not.toBe(first);
      expect(tracked.uniqueCount()).toBe(1);
      const rest = await restFor(pm.page);
      expect(await readCaseState(rest, first)).toBeTruthy();
      expect(await readCaseState(rest, second!)).toBeTruthy();
    } finally {
      await pm.close();
    }
  });

  test("建案拒絕：明確提示、後端無新列、連點不另建", async ({ browser }) => {
    const pm = await loginAs(browser, cred("pm").email, cred("pm").password);
    try {
      const tracked = trackCreateCaseIds(pm.page);
      await pm.page.route("**/rest/v1/rpc/admin_create_case", async (route) => {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ code: "42501", message: "not_authorized" }),
        });
      });
      await pm.page.goto("/cases");
      const btn = pm.page.getByTestId("create-case-button").first();
      await btn.click();
      await expect(toastCopy(pm.page, "無法新增案件", true)).toBeVisible({ timeout: 30_000 });
      await expect(toastCopy(pm.page, "後端已明確拒絕")).toBeVisible();
      await expect(pm.page).toHaveURL(/\/cases\/?$/);
      await btn.click();
      expect(tracked.ids.length).toBeGreaterThanOrEqual(1);
      const rest = await restFor(pm.page);
      for (const id of tracked.ids) {
        expect(await readCaseState(rest, id)).toBeNull();
      }
    } finally {
      await pm.close();
    }
  });

  test("讀回失敗：保留識別、不報成沒建立、後端確有一筆", async ({ browser }) => {
    const pm = await loginAs(browser, cred("pm").email, cred("pm").password);
    try {
      const reserved: string[] = [];
      await pm.page.route("**/rest/v1/cases_visible*", async (route) => {
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
      pm.page.on("request", (req) => {
        if (!req.url().includes("/rpc/admin_create_case")) return;
        try {
          const body = req.postDataJSON() as { p_case_id?: string };
          if (body?.p_case_id) reserved.push(body.p_case_id);
        } catch {
          /* ignore */
        }
      });
      await pm.page.goto("/cases");
      await pm.page.getByTestId("create-case-button").first().click();
      await expect(toastCopy(pm.page, "新案件已建立，但資料讀不回", true)).toBeVisible({ timeout: 30_000 });
      await expect(toastCopy(pm.page, /不要再按一次新增/)).toBeVisible();
      expect(reserved[0]).toBeTruthy();
      await expect(pm.page).not.toHaveURL(new RegExp(`/cases/${reserved[0]}`));
      const rest = await restFor(pm.page);
      await expect.poll(() => readCaseState(rest, reserved[0])).toMatchObject({ id: reserved[0] });
    } finally {
      await pm.close();
    }
  });

  test("回應遺失：同一識別查證，不明結果不引導再建", async ({ browser }) => {
    const pm = await loginAs(browser, cred("pm").email, cred("pm").password);
    try {
      const reserved: string[] = [];
      let aborted = false;
      await pm.page.route("**/rest/v1/rpc/admin_create_case", async (route) => {
        const body = route.request().postDataJSON() as { p_case_id?: string };
        if (body?.p_case_id) reserved.push(body.p_case_id);
        if (!aborted) {
          aborted = true;
          await route.abort("failed");
          return;
        }
        await route.continue();
      });
      await pm.page.goto("/cases");
      await pm.page.getByTestId("create-case-button").first().click();
      await expect.poll(() => reserved[0], { timeout: 30_000 }).toBeTruthy();
      const lostId = reserved[0];
      await expect.poll(async () => {
        if (pm.page.url().includes(`/cases/${lostId}`)) return "found";
        if ((await toastCopy(pm.page, "建案結果不明", true).count()) > 0) return "unknown";
        if ((await toastCopy(pm.page, "新案件已建立，但資料讀不回", true).count()) > 0) return "readback";
        if ((await toastCopy(pm.page, "無法新增案件", true).count()) > 0) return "misclassified";
        return "pending";
      }, { timeout: 30_000 }).toMatch(/^(found|unknown|readback)$/);
      expect(new Set(reserved).size).toBe(1);
      const rest = await restFor(pm.page);
      const row = await readCaseState(rest, lostId);
      expect(row === null || row.id === lostId).toBe(true);
      if (await toastCopy(pm.page, /不要再按一次新增/).isVisible().catch(() => false)) {
        await expect(toastCopy(pm.page, lostId)).toBeVisible();
      }
    } finally {
      await pm.close();
    }
  });

  test("連點：busy 期間不送出第二個識別", async ({ browser }) => {
    const pm = await loginAs(browser, cred("pm").email, cred("pm").password);
    try {
      const reserved: string[] = [];
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await pm.page.route("**/rest/v1/rpc/admin_create_case", async (route) => {
        const body = route.request().postDataJSON() as { p_case_id?: string };
        if (body?.p_case_id) reserved.push(body.p_case_id);
        await gate;
        await route.continue();
      });
      await pm.page.goto("/cases");
      const btn = pm.page.getByTestId("create-case-button").first();
      await btn.click();
      await expect(btn).toBeDisabled();
      await btn.click({ force: true }).catch(() => undefined);
      await expect.poll(() => reserved.length).toBe(1);
      release();
      await pm.page.waitForURL(/\/cases\/[0-9a-f-]{36}/, { timeout: 60_000 });
      expect(reserved).toHaveLength(1);
    } finally {
      await pm.close();
    }
  });

  test("有效譯者本人完成：member session 按鈕 → 狀態／participant／audit", async ({ browser }) => {
    const pm = await loginAs(browser, cred("pm").email, cred("pm").password);
    const t1 = await loginAs(browser, cred("t1").email, cred("t1").password);
    try {
      await pm.page.goto("/cases");
      const caseId = await createDraftViaButton(pm.page);
      const t1Id = await sessionUserId(t1.page);
      await assignAndDispatch(pm.page, caseId, t1Id, "譯者一（測試）");
      const hits: string[] = [];
      t1.page.on("request", (req) => {
        const name = new URL(req.url()).pathname.split("/").pop() ?? "";
        if (name === "complete_case_translation" || name === "pm_complete_case_translation") {
          hits.push(name);
        }
      });
      await t1.page.goto(`/cases/${caseId}`);
      await expectSignedInAs(t1.page, cred("t1").email);
      const rest = await restFor(pm.page);
      const before = await readCaseState(rest, caseId);
      await expect(t1.page.getByTestId("task-complete-button")).toBeVisible({ timeout: 30_000 });
      await t1.page.getByTestId("task-complete-button").click();
      await expect(toastCopy(t1.page, "任務已完成", true)).toBeVisible({ timeout: 30_000 });
      await expect.poll(async () => (await readCaseState(rest, caseId))?.status).toBe("task_completed");
      const after = await readCaseState(rest, caseId);
      expect(after!.revision).toBeGreaterThan(before!.revision);
      const parts = await readParticipants(rest, caseId);
      expect(parts.some((p) => p.user_id === t1Id && p.work_status === "completed")).toBe(true);
      const audit = await readAudit(rest, caseId);
      expect(audit.some((a) => a.action === "complete_case_translation" && a.actor_user_id === t1Id)).toBe(true);
      expect(hits).toContain("complete_case_translation");
      expect(hits).not.toContain("pm_complete_case_translation");
    } finally {
      await t1.close();
      await pm.close();
    }
  });

  test("改派後舊譯者不可完成、新譯者可以", async ({ browser }) => {
    const pm = await loginAs(browser, cred("pm").email, cred("pm").password);
    const t1 = await loginAs(browser, cred("t1").email, cred("t1").password);
    const t2 = await loginAs(browser, cred("t2").email, cred("t2").password);
    try {
      await pm.page.goto("/cases");
      const caseId = await createDraftViaButton(pm.page);
      const t1Id = await sessionUserId(t1.page);
      const t2Id = await sessionUserId(t2.page);
      await assignAndDispatch(pm.page, caseId, t1Id, "譯者一（測試）");
      await assignAndDispatch(pm.page, caseId, t2Id, "譯者二（測試）");
      await t1.page.goto(`/cases/${caseId}`);
      await expect(t1.page.getByTestId("task-complete-button")).toHaveCount(0);
      const rest = await restFor(pm.page);
      const mid = await readCaseState(rest, caseId);
      expect(mid?.status).toBe("dispatched");
      await t2.page.goto(`/cases/${caseId}`);
      await expect(t2.page.getByTestId("task-complete-button")).toBeVisible({ timeout: 30_000 });
      await t2.page.getByTestId("task-complete-button").click();
      await expect(toastCopy(t2.page, "任務已完成", true)).toBeVisible({ timeout: 30_000 });
      await expect.poll(async () => (await readCaseState(rest, caseId))?.status).toBe("task_completed");
    } finally {
      await t2.close();
      await t1.close();
      await pm.close();
    }
  });

  test("executive 走管理代完成，不發譯者 RPC、不插假 participant", async ({ browser }) => {
    const pm = await loginAs(browser, cred("pm").email, cred("pm").password);
    const exec = await loginAs(browser, cred("exec").email, cred("exec").password);
    const t1 = await loginAs(browser, cred("t1").email, cred("t1").password);
    try {
      await pm.page.goto("/cases");
      const caseId = await createDraftViaButton(pm.page);
      const t1Id = await sessionUserId(t1.page);
      const execId = await sessionUserId(exec.page);
      await assignAndDispatch(pm.page, caseId, t1Id, "譯者一（測試）");
      const hits: string[] = [];
      exec.page.on("request", (req) => {
        const name = new URL(req.url()).pathname.split("/").pop() ?? "";
        if (name === "complete_case_translation" || name === "pm_complete_case_translation") {
          hits.push(name);
        }
      });
      await exec.page.goto(`/cases/${caseId}`);
      await expectSignedInAs(exec.page, cred("exec").email);
      await expect(exec.page.getByTestId("task-complete-button")).toBeVisible({ timeout: 30_000 });
      await exec.page.getByTestId("task-complete-button").click();
      await expect(toastCopy(exec.page, "已由管理身分代為完成", true)).toBeVisible({ timeout: 30_000 });
      const rest = await restFor(exec.page);
      await expect.poll(async () => (await readCaseState(rest, caseId))?.status).toBe("task_completed");
      const parts = await readParticipants(rest, caseId);
      expect(parts.some((p) => p.user_id === execId)).toBe(false);
      const audit = await readAudit(rest, caseId);
      expect(audit.some((a) => a.action === "pm_complete_case_translation" && a.actor_user_id === execId)).toBe(true);
      expect(hits).toContain("pm_complete_case_translation");
      expect(hits).not.toContain("complete_case_translation");
    } finally {
      await t1.close();
      await exec.close();
      await pm.close();
    }
  });

  test("非指派 member 看不到完成按鈕，狀態／revision／audit 無副作用", async ({ browser }) => {
    const pm = await loginAs(browser, cred("pm").email, cred("pm").password);
    const t1 = await loginAs(browser, cred("t1").email, cred("t1").password);
    const t2 = await loginAs(browser, cred("t2").email, cred("t2").password);
    try {
      await pm.page.goto("/cases");
      const caseId = await createDraftViaButton(pm.page);
      await assignAndDispatch(pm.page, caseId, await sessionUserId(t1.page), "譯者一（測試）");
      const rest = await restFor(pm.page);
      const before = await readCaseState(rest, caseId);
      const auditBefore = (await readAudit(rest, caseId)).length;
      await t2.page.goto(`/cases/${caseId}`);
      await expectSignedInAs(t2.page, cred("t2").email);
      await expect(t2.page.getByTestId("task-complete-button")).toHaveCount(0);
      const after = await readCaseState(rest, caseId);
      expect(after).toEqual(before);
      expect((await readAudit(rest, caseId)).length).toBe(auditBefore);
    } finally {
      await t2.close();
      await t1.close();
      await pm.close();
    }
  });

  test("身兼管理者與譯者：入口走譯者本人 RPC", async ({ browser }) => {
    const pm = await loginAs(browser, cred("pm").email, cred("pm").password);
    try {
      await pm.page.goto("/cases");
      const caseId = await createDraftViaButton(pm.page);
      const pmId = await sessionUserId(pm.page);
      await assignAndDispatch(pm.page, caseId, pmId, "PM（測試）");
      const hits: string[] = [];
      pm.page.on("request", (req) => {
        const name = new URL(req.url()).pathname.split("/").pop() ?? "";
        if (name === "complete_case_translation" || name === "pm_complete_case_translation") {
          hits.push(name);
        }
      });
      await pm.page.goto(`/cases/${caseId}`);
      await expect(pm.page.getByTestId("task-complete-button")).toBeVisible({ timeout: 30_000 });
      await pm.page.getByTestId("task-complete-button").click();
      await expect(toastCopy(pm.page, "任務已完成", true)).toBeVisible({ timeout: 30_000 });
      expect(hits).toContain("complete_case_translation");
      expect(hits).not.toContain("pm_complete_case_translation");
    } finally {
      await pm.close();
    }
  });
});
