import { test, expect, type Page } from "@playwright/test";
import {
  expectTestModePersonaUiReady,
  switchToTestPersona,
} from "./helpers/test-mode-persona";

/**
 * 工項 2 冒煙（正式／preview）：譯者改狀態須走 apply_case_update RPC。
 * 預設針對 PLAYWRIGHT_BASE_URL（建議正式站）；storageState 須為測試模式假執行長。
 */

type AgentResult<T> = { ok: boolean; data?: T; error?: string };

async function waitAgent(page: Page) {
  await page.waitForFunction(() => !!(window as unknown as { __lmsAgent?: unknown }).__lmsAgent, null, {
    timeout: 60_000,
  });
}

async function currentAuthEmail(page: Page): Promise<string | null> {
  return page.evaluate(() => {
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
    if (!keys.length) return null;
    keys.sort();
    let raw = keys.map((k) => localStorage.getItem(k) ?? "").join("");
    if (raw.startsWith("base64-")) raw = b64urlDecode(raw.slice(7));
    const parsed = JSON.parse(raw) as { access_token?: string };
    const token = parsed?.access_token;
    if (!token) return null;
    return (JSON.parse(b64urlDecode(token.split(".")[1])) as { email?: string })?.email ?? null;
  });
}

function trackApplyCaseUpdate(page: Page) {
  const hits: { ok: boolean; status: number; body: string }[] = [];
  page.on("response", async (res) => {
    if (!res.url().includes("/rest/v1/rpc/apply_case_update")) return;
    let body = "";
    try {
      body = await res.text();
    } catch {
      body = "";
    }
    hits.push({ ok: res.ok(), status: res.status(), body });
  });
  return hits;
}

test.describe.configure({ mode: "serial" });

test("譯者單檔承接＋任務完成走 apply_case_update", async ({ page }) => {
  const rpcHits = trackApplyCaseUpdate(page);
  const stamp = Date.now().toString(36);
  const title = `[AI驗收] 工項2單檔承接 ${stamp}`;

  await page.goto("/cases");
  await expectTestModePersonaUiReady(page);
  expect(await currentAuthEmail(page)).toBe("test-exec@test.local");
  await waitAgent(page);

  const created = await page.evaluate(async (t) => {
    const agent = (window as unknown as { __lmsAgent: {
      case: {
        create: (i: Record<string, unknown>) => Promise<AgentResult<{ id: string }>>;
        update: (id: string, p: Record<string, unknown>) => Promise<AgentResult<{ id: string; status: string }>>;
      };
    } }).__lmsAgent;
    const c = await agent.case.create({ title: t });
    if (!c.ok || !c.data?.id) return { ok: false as const, error: c.error || "create failed" };
    const u = await agent.case.update(c.data.id, { status: "inquiry" });
    if (!u.ok) return { ok: false as const, error: u.error || "publish failed", id: c.data.id };
    return { ok: true as const, id: c.data.id };
  }, title);
  expect(created.ok, created.ok ? "" : created.error).toBe(true);

  await switchToTestPersona(page, "譯者一");
  expect(await currentAuthEmail(page)).toBe("test-t1@test.local");
  await waitAgent(page);

  // 側欄／頂欄可見「譯者一（測試）」即代表 profile.display_name 可用於承接寫入
  await expect(page.getByText(/譯者一（測試）/).first()).toBeVisible({ timeout: 30_000 });

  await page.goto(`/cases/${created.id}`);
  const acceptBtn = page.getByRole("button", { name: /承接本案/ });
  await expect(acceptBtn).toBeVisible({ timeout: 60_000 });
  const beforeAccept = rpcHits.length;
  await acceptBtn.click();
  await expect.poll(() => rpcHits.length, { timeout: 20_000 }).toBeGreaterThan(beforeAccept);
  const acceptRpc = rpcHits[rpcHits.length - 1];
  expect(acceptRpc.ok, `承接 RPC HTTP ${acceptRpc.status}: ${acceptRpc.body}`).toBe(true);
  expect(acceptRpc.body).toMatch(/"ok"\s*:\s*true/);

  await expect(page.getByText("已派出").first()).toBeVisible({ timeout: 20_000 });

  // 重載後從 store／畫面確認持久化（避免 optimistic 與 get 競態）
  await page.reload({ waitUntil: "load" });
  await expectTestModePersonaUiReady(page);
  await waitAgent(page);
  await expect(page.getByText("已派出").first()).toBeVisible({ timeout: 60_000 });

  await expect.poll(async () => {
    return page.evaluate((id) => {
      const agent = (window as unknown as { __lmsAgent: {
        case: { get: (cid: string) => AgentResult<{ status: string; translator: string[] }> };
      } }).__lmsAgent;
      const g = agent.case.get(id);
      if (!g.ok || !g.data) return null;
      return { status: g.data.status, translator: g.data.translator || [] };
    }, created.id!);
  }, { timeout: 30_000 }).toEqual(expect.objectContaining({
    status: "dispatched",
    translator: expect.arrayContaining([expect.stringMatching(/譯者一/)]),
  }));

  const completeBtn = page.getByRole("button", { name: /^任務完成$|任務已完成/ }).first();
  // 詳情頁工具列「任務完成」
  const taskComplete = page.getByRole("button", { name: "任務完成" });
  await expect(taskComplete).toBeVisible({ timeout: 30_000 });
  const beforeComplete = rpcHits.length;
  await taskComplete.click();
  await expect.poll(() => rpcHits.length, { timeout: 20_000 }).toBeGreaterThan(beforeComplete);
  const completeRpc = rpcHits[rpcHits.length - 1];
  expect(completeRpc.ok, `完成 RPC HTTP ${completeRpc.status}: ${completeRpc.body}`).toBe(true);

  await expect.poll(async () => {
    return page.evaluate((id) => {
      const agent = (window as unknown as { __lmsAgent: {
        case: { get: (cid: string) => AgentResult<{ status: string }> | null };
      } }).__lmsAgent;
      const g = agent.case.get(id);
      return g && "ok" in g && g.ok ? g.data?.status : null;
    }, created.id!);
  }, { timeout: 20_000 }).toBe("task_completed");

  void completeBtn;
});

test("譯者協作分段承接走 apply_case_update", async ({ page }) => {
  const rpcHits = trackApplyCaseUpdate(page);
  const stamp = Date.now().toString(36);
  const title = `[AI驗收] 工項2協作承接 ${stamp}`;

  await page.goto("/cases");
  await expectTestModePersonaUiReady(page);
  // 上一個測試可能停在譯者一；先回到執行長以便建案
  const email = await currentAuthEmail(page);
  if (email !== "test-exec@test.local") {
    await switchToTestPersona(page, "執行長");
    expect(await currentAuthEmail(page)).toBe("test-exec@test.local");
  }
  await waitAgent(page);

  const created = await page.evaluate(async (t) => {
    const agent = (window as unknown as { __lmsAgent: {
      case: {
        create: (i: Record<string, unknown>) => Promise<AgentResult<{ id: string }>>;
        update: (id: string, p: Record<string, unknown>) => Promise<AgentResult<{ id: string }>>;
      };
    } }).__lmsAgent;
    const c = await agent.case.create({ title: t });
    if (!c.ok || !c.data?.id) return { ok: false as const, error: c.error || "create failed" };
    const u = await agent.case.update(c.data.id, {
      status: "inquiry",
      multiCollab: true,
      collabCount: 2,
      collabRows: [
        {
          translator: "譯者一（測試）",
          segment: "段A",
          unitCount: 0,
          accepted: false,
          translationDeadline: null,
          reviewer: "",
          reviewDeadline: null,
          taskCompleted: false,
          delivered: false,
        },
        {
          translator: "譯者二（測試）",
          segment: "段B",
          unitCount: 0,
          accepted: false,
          translationDeadline: null,
          reviewer: "",
          reviewDeadline: null,
          taskCompleted: false,
          delivered: false,
        },
      ],
      translator: ["譯者一（測試）", "譯者二（測試）"],
    });
    if (!u.ok) return { ok: false as const, error: u.error || "setup failed", id: c.data.id };
    return { ok: true as const, id: c.data.id };
  }, title);
  expect(created.ok, created.ok ? "" : created.error).toBe(true);

  await switchToTestPersona(page, "譯者一");
  expect(await currentAuthEmail(page)).toBe("test-t1@test.local");
  await waitAgent(page);
  await page.goto(`/cases/${created.id}`);

  // 確認承接 checkbox：協作表第一列
  const acceptCell = page.getByRole("checkbox").first();
  await expect(acceptCell).toBeVisible({ timeout: 60_000 });
  const before = rpcHits.length;
  await acceptCell.click();
  await expect.poll(() => rpcHits.length, { timeout: 20_000 }).toBeGreaterThan(before);
  const hit = rpcHits[rpcHits.length - 1];
  expect(hit.ok, `協作承接 RPC HTTP ${hit.status}: ${hit.body}`).toBe(true);

  await expect.poll(async () => {
    return page.evaluate((id) => {
      const agent = (window as unknown as { __lmsAgent: {
        case: { get: (cid: string) => AgentResult<{
          collabRows: { id: string; accepted: boolean; translator: string }[];
        }> | null };
      } }).__lmsAgent;
      const g = agent.case.get(id);
      if (!g || !("ok" in g) || !g.ok || !g.data) return null;
      const row = (g.data.collabRows || []).find((r) => (r.translator || "").includes("譯者一"));
      return row?.accepted ?? null;
    }, created.id!);
  }, { timeout: 20_000 }).toBe(true);
});

test("譯者無法承接寫入走 apply_case_update", async ({ page }) => {
  const rpcHits = trackApplyCaseUpdate(page);
  const stamp = Date.now().toString(36);
  const title = `[AI驗收] 工項2無法承接 ${stamp}`;

  await page.goto("/cases");
  await expectTestModePersonaUiReady(page);
  if ((await currentAuthEmail(page)) !== "test-exec@test.local") {
    await switchToTestPersona(page, "執行長");
  }
  await waitAgent(page);

  const created = await page.evaluate(async (t) => {
    const agent = (window as unknown as { __lmsAgent: {
      case: {
        create: (i: Record<string, unknown>) => Promise<AgentResult<{ id: string }>>;
        update: (id: string, p: Record<string, unknown>) => Promise<AgentResult<{ id: string }>>;
      };
    } }).__lmsAgent;
    const c = await agent.case.create({ title: t });
    if (!c.ok || !c.data?.id) return { ok: false as const, error: c.error || "create failed" };
    const u = await agent.case.update(c.data.id, { status: "inquiry" });
    if (!u.ok) return { ok: false as const, error: u.error || "publish failed", id: c.data.id };
    return { ok: true as const, id: c.data.id };
  }, title);
  expect(created.ok, created.ok ? "" : created.error).toBe(true);

  await switchToTestPersona(page, "譯者一");
  await waitAgent(page);
  await page.goto(`/cases/${created.id}`);

  const declineBtn = page.getByRole("button", { name: /無法承接/ });
  await expect(declineBtn).toBeVisible({ timeout: 30_000 });
  await declineBtn.click();
  // AlertDialog：填原因後確認
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  const reason = dialog.locator("textarea").or(dialog.getByRole("textbox"));
  if (await reason.count()) {
    await reason.first().fill("冒煙：無法承接回歸");
  }
  const before = rpcHits.length;
  await dialog.getByRole("button", { name: /確認|送出|無法承接/ }).last().click();
  await expect.poll(() => rpcHits.length, { timeout: 20_000 }).toBeGreaterThan(before);
  const hit = rpcHits[rpcHits.length - 1];
  expect(hit.ok, `無法承接 RPC HTTP ${hit.status}: ${hit.body}`).toBe(true);
});
