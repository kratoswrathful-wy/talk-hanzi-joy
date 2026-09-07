import { test, expect, type Page } from "@playwright/test";
import { expectTestModePersonaUiReady, switchToTestPersona } from "./helpers/test-mode-persona";

/**
 * 複製案件工具（#85 之後）：實際 UI 複製 + 後端讀回。
 * 只在隔離 Supabase（PLAYWRIGHT_TOOL_CREDENTIALS_UI=1）啟用。
 */
const ENABLED = process.env.PLAYWRIGHT_TOOL_CREDENTIALS_UI === "1";
const describeCopy = ENABLED ? test.describe : test.describe.skip;

const PRODUCTION_REF = "wshsmerltcakffllgyul";
const TOOL_LABEL = "memoQ";
const TOOL_ENTRY = "te-copy";
const QUESTION_ENTRY = "qt-copy";

const TEXT_FIELDS = [
  { id: "f-server", label: "伺服器", testId: "tool-server", value: "mq.copy.local" },
  { id: "f-user", label: "帳號", testId: "tool-username", value: "copy-user" },
  { id: "f-pass", label: "密碼", testId: "tool-password", value: "copy-pass" },
] as const;

const QUESTION_FIELDS = [
  { id: "q-note", label: "詢案備註", value: "copy-question-note" },
] as const;

type AgentResult<T> = { ok: boolean; data?: T; error?: string };

function localApi(): { url: string; anonKey: string } {
  const url = process.env.VITE_SUPABASE_URL ?? "";
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  expect(url).toBeTruthy();
  expect(new RegExp(PRODUCTION_REF, "i").test(url)).toBe(false);
  expect(/^https?:\/\/(127\.0\.0\.1|localhost)/i.test(url)).toBe(true);
  return { url, anonKey };
}

async function accessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
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
    return (JSON.parse(raw) as { access_token?: string }).access_token ?? null;
  });
  expect(token).toBeTruthy();
  return token!;
}

type BackendEntry = {
  id: string;
  tool: string;
  fieldValues?: Record<string, string>;
};

async function readBackendTools(
  page: Page,
  caseId: string,
  block: "tools" | "questionTools" = "tools",
): Promise<BackendEntry[]> {
  const { url, anonKey } = localApi();
  const token = await accessToken(page);
  const res = await page.evaluate(
    async ({ apiUrl, anon, jwt, cid }) => {
      const r = await fetch(`${apiUrl}/rest/v1/rpc/get_case_credentials`, {
        method: "POST",
        headers: {
          apikey: anon,
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_case_id: cid }),
      });
      return { ok: r.ok, status: r.status, body: await r.text() };
    },
    { apiUrl: url, anon: anonKey, jwt: token, cid: caseId },
  );
  expect(res.ok, `get_case_credentials ${res.status}: ${res.body}`).toBe(true);
  const parsed = JSON.parse(res.body) as {
    tools?: BackendEntry[];
    questionTools?: BackendEntry[];
    question_tools?: BackendEntry[];
  };
  const list = block === "tools" ? parsed.tools : parsed.questionTools ?? parsed.question_tools;
  return Array.isArray(list) ? list : [];
}

async function backendFieldValues(
  page: Page,
  caseId: string,
  entryId: string,
  block: "tools" | "questionTools" = "tools",
): Promise<Record<string, string>> {
  const entry = (await readBackendTools(page, caseId, block)).find((t) => t.id === entryId);
  return entry?.fieldValues ?? {};
}

/** 模擬使用者在新案把工具全部刪掉（走與 UI 相同的憑證 RPC）。 */
async function clearBackendTools(page: Page, caseId: string) {
  const { url, anonKey } = localApi();
  const token = await accessToken(page);
  const res = await page.evaluate(
    async ({ apiUrl, anon, jwt, cid }) => {
      const call = async (fn: string, body: unknown) => {
        const r = await fetch(`${apiUrl}/rest/v1/rpc/${fn}`, {
          method: "POST",
          headers: { apikey: anon, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return { ok: r.ok, status: r.status, body: await r.text() };
      };
      const read = await call("get_case_credentials", { p_case_id: cid });
      if (!read.ok) return read;
      const revision = (JSON.parse(read.body) as { revision: number }).revision;
      return call("update_case_credentials", {
        p_case_id: cid,
        p_expected_revision: revision,
        p_credentials: { tools: [], questionTools: [], toolFieldValues: {} },
      });
    },
    { apiUrl: url, anon: anonKey, jwt: token, cid: caseId },
  );
  expect(res.ok, `clear tools ${res.status}: ${res.body}`).toBe(true);
}

/**
 * 模擬「另一個操作」在等待期間先加工具再全部清空：
 * 走 page.request（不受 page.route 攔截），讓新案版本前進、內容回到空白。
 */
async function bumpAndClearToolsOutOfBand(page: Page, caseId: string, token: string) {
  const { url, anonKey } = localApi();
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const call = async (fn: string, data: unknown) => {
    const res = await page.request.post(`${url}/rest/v1/rpc/${fn}`, { headers, data });
    expect(res.ok(), `${fn} ${res.status()}: ${await res.text()}`).toBe(true);
    return res.text();
  };
  const readRevision = async () =>
    (JSON.parse(await call("get_case_credentials", { p_case_id: caseId })) as { revision: number }).revision;

  const r0 = await readRevision();
  await call("update_case_credentials", {
    p_case_id: caseId,
    p_expected_revision: r0,
    p_credentials: {
      tools: [{ id: "te-other", tool: TOOL_LABEL, fields: [{ id: "f-other", label: "其他", type: "text" }], fieldValues: { "f-other": "other-op.local" } }],
      questionTools: [],
      toolFieldValues: {},
    },
  });
  const r1 = await readRevision();
  await call("update_case_credentials", {
    p_case_id: caseId,
    p_expected_revision: r1,
    p_credentials: { tools: [], questionTools: [], toolFieldValues: {} },
  });
}

/** 記錄每次 admin_create_case 送出的目標識別，用來證明沒有無聲換新 UUID 再建。 */
function trackReservedCaseIds(page: Page): { ids: string[] } {
  const ids: string[] = [];
  page.on("request", (req) => {
    if (!req.url().includes("/rest/v1/rpc/admin_create_case")) return;
    const body = req.postDataJSON() as { p_case_id?: string } | null;
    if (body?.p_case_id) ids.push(body.p_case_id);
  });
  return { ids };
}

async function listCaseIdsByTitlePrefix(page: Page, prefix: string): Promise<string[]> {
  const { url, anonKey } = localApi();
  const token = await accessToken(page);
  const res = await page.evaluate(
    async ({ apiUrl, anon, jwt, pfx }) => {
      const r = await fetch(
        `${apiUrl}/rest/v1/cases_visible?select=id,title&title=like.${encodeURIComponent(pfx + "%")}`,
        {
          headers: { apikey: anon, Authorization: `Bearer ${jwt}`, Accept: "application/json" },
        },
      );
      return { ok: r.ok, body: await r.text() };
    },
    { apiUrl: url, anon: anonKey, jwt: token, pfx: prefix },
  );
  expect(res.ok).toBe(true);
  const rows = JSON.parse(res.body) as { id: string }[];
  return rows.map((r) => r.id);
}

async function createDraft(page: Page, title: string, extra: Record<string, unknown> = {}): Promise<string> {
  await page.goto("/cases");
  await expectTestModePersonaUiReady(page);
  await page.waitForFunction(() => !!(window as unknown as { __lmsAgent?: unknown }).__lmsAgent, null, {
    timeout: 60_000,
  });
  const created = await page.evaluate(
    async ({ caseTitle, more }) => {
      const agent = (window as unknown as {
        __lmsAgent: {
          case: { create: (i: Record<string, unknown>) => Promise<AgentResult<{ id: string }>> };
        };
      }).__lmsAgent;
      return agent.case.create({ title: caseTitle, status: "draft", ...more });
    },
    { caseTitle: title, more: extra },
  );
  expect(created.ok, created.error).toBe(true);
  return created.data!.id;
}

async function seedTools(page: Page, caseId: string) {
  const seeded = await page.evaluate(
    async ({ cid, toolEntry, qEntry, toolLabel, fields, qFields }) => {
      const agent = (window as unknown as {
        __lmsAgent: {
          tool: {
            ensureEntry: (i: Record<string, unknown>) => Promise<AgentResult<{ verified?: boolean }>>;
            setField: (i: Record<string, unknown>) => Promise<AgentResult<{ verified?: boolean }>>;
          };
        };
      }).__lmsAgent;
      const exec = await agent.tool.ensureEntry({
        caseId: cid,
        toolEntryId: toolEntry,
        toolLabel,
        fields,
      });
      if (!exec.ok) return exec;
      const q = await agent.tool.ensureEntry({
        caseId: cid,
        toolEntryId: qEntry,
        toolLabel,
        toolFieldKey: "questionTool",
        fields: qFields,
      });
      if (!q.ok) return q;
      for (const f of fields) {
        const w = await agent.tool.setField({
          caseId: cid,
          toolEntryId: toolEntry,
          toolLabel,
          fieldKey: f.id,
          value: f.value,
        });
        if (!w.ok) return w;
      }
      for (const f of qFields) {
        const w = await agent.tool.setField({
          caseId: cid,
          toolEntryId: qEntry,
          toolLabel,
          toolFieldKey: "questionTool",
          fieldKey: f.id,
          value: f.value,
        });
        if (!w.ok) return w;
      }
      return { ok: true as const };
    },
    {
      cid: caseId,
      toolEntry: TOOL_ENTRY,
      qEntry: QUESTION_ENTRY,
      toolLabel: TOOL_LABEL,
      fields: TEXT_FIELDS.map((f) => ({ id: f.id, label: f.label, type: "text", value: f.value })),
      qFields: QUESTION_FIELDS.map((f) => ({ id: f.id, label: f.label, type: "text", value: f.value })),
    },
  );
  expect(seeded.ok, seeded.ok ? "" : seeded.error).toBe(true);
}

async function openCase(page: Page, caseId: string) {
  await page.goto(`/cases/${caseId}`);
  await expectTestModePersonaUiReady(page);
  await expect(page.getByTestId("case-title-input")).toBeVisible({ timeout: 60_000 });
}

async function copyCurrentPage(page: Page, sourceId: string): Promise<string> {
  await page.getByRole("button", { name: "複製本頁" }).click();
  await page.waitForURL((url) => {
    const m = url.pathname.match(/^\/cases\/([^/]+)/);
    return !!m && m[1] !== sourceId;
  }, { timeout: 60_000 });
  const m = page.url().match(/\/cases\/([^/?#]+)/);
  expect(m?.[1]).toBeTruthy();
  const dismiss = page.getByRole("button", { name: "確定" });
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
  }
  return m![1];
}

async function typeAndBlur(page: Page, testId: string, value: string) {
  const el = page.getByTestId(testId).first();
  await expect(el).toBeEnabled();
  await el.click();
  await el.fill(value);
  await expect(el).toHaveValue(value);
  await el.press("Tab");
}

async function holdFirstCredentialWrite(page: Page) {
  let seen = 0;
  let release!: () => void;
  let markSent!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const firstRequestSent = new Promise<void>((resolve) => {
    markSent = resolve;
  });
  await page.route("**/rest/v1/rpc/update_case_credentials", async (route) => {
    seen += 1;
    if (seen > 1) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    markSent();
    await gate;
    try {
      await route.fulfill({ response });
    } catch {
      // 測試收尾
    }
  });
  return {
    firstRequestSent,
    release,
    seenCount: () => seen,
    stop: () => page.unroute("**/rest/v1/rpc/update_case_credentials"),
  };
}

describeCopy("複製案件工具（隔離操作驗收）", () => {
  test.describe.configure({ mode: "default" });

  test("T1 有工具／詢案工具的原案複製後重整完整，原案不變、應重置欄位清空", async ({ page }) => {
    const prefix = `[AI驗收] 複製工具 T1 ${Date.now().toString(36)}-t`;
    const sourceId = await createDraft(page, prefix, { clientPoNumber: `PO-${Date.now()}` });
    await seedTools(page, sourceId);
    await expect.poll(() => backendFieldValues(page, sourceId, TOOL_ENTRY)).toMatchObject({
      "f-server": "mq.copy.local",
      "f-user": "copy-user",
      "f-pass": "copy-pass",
    });
    await expect.poll(() => backendFieldValues(page, sourceId, QUESTION_ENTRY, "questionTools")).toMatchObject({
      "q-note": "copy-question-note",
    });

    await openCase(page, sourceId);
    await expect(page.getByTestId("case-client-po-input")).toHaveValue(/PO-/);
    const newId = await copyCurrentPage(page, sourceId);

    await page.reload({ waitUntil: "load" });
    await openCase(page, newId);
    await expect.poll(() => backendFieldValues(page, newId, TOOL_ENTRY)).toMatchObject({
      "f-server": "mq.copy.local",
      "f-user": "copy-user",
      "f-pass": "copy-pass",
    });
    await expect.poll(() => backendFieldValues(page, newId, QUESTION_ENTRY, "questionTools")).toMatchObject({
      "q-note": "copy-question-note",
    });
    await expect(page.getByTestId("case-client-po-input")).toHaveValue("");
    await expect.poll(() => backendFieldValues(page, sourceId, TOOL_ENTRY)).toMatchObject({
      "f-server": "mq.copy.local",
      "f-pass": "copy-pass",
    });
    await expect.poll(() => backendFieldValues(page, sourceId, QUESTION_ENTRY, "questionTools")).toMatchObject({
      "q-note": "copy-question-note",
    });
  });

  test("T2 沒有工具的原案仍可複製", async ({ page }) => {
    const prefix = `[AI驗收] 複製工具 T2 ${Date.now().toString(36)}-t`;
    const sourceId = await createDraft(page, prefix);
    await openCase(page, sourceId);
    const newId = await copyCurrentPage(page, sourceId);
    expect(newId).not.toBe(sourceId);
    await page.reload({ waitUntil: "load" });
    await openCase(page, newId);
    await expect(page.getByTestId("case-title-input")).toBeVisible();
    const tools = await readBackendTools(page, newId);
    const values = tools.flatMap((t) => Object.values(t.fieldValues ?? {}));
    expect(values.every((v) => !String(v).trim())).toBe(true);
  });

  test("T3 來源讀取失敗不得建案或假成功", async ({ page }) => {
    const prefix = `[AI驗收] 複製工具 T3 ${Date.now().toString(36)}-t`;
    const sourceId = await createDraft(page, prefix);
    await seedTools(page, sourceId);
    await openCase(page, sourceId);
    const before = await listCaseIdsByTitlePrefix(page, prefix);

    // 「未建案」不靠提示文字：以建案請求與資料庫清單為確定訊號。
    const reserved = trackReservedCaseIds(page);
    let denied = 0;
    await page.route("**/rest/v1/rpc/get_case_credentials", async (route) => {
      denied += 1;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ message: "not_authorized", code: "42501" }),
      });
    });
    const deniedBefore = denied;
    await page.getByRole("button", { name: "複製本頁" }).click();
    await expect.poll(() => denied, { timeout: 30_000 }).toBeGreaterThan(deniedBefore);
    await expect(page).toHaveURL(new RegExp(`/cases/${sourceId}`));
    await page.unroute("**/rest/v1/rpc/get_case_credentials");
    const after = await listCaseIdsByTitlePrefix(page, prefix);
    expect(after).toEqual(before);
    expect(reserved.ids).toEqual([]);
    await expect(page.getByTestId("duplicate-tools-pending")).toHaveCount(0);
    // 提示文字最後才看；同一句同時出現在 toast 與螢幕閱讀器 live region，取第一個即可。
    await expect(page.getByText("來源案件的完整工具資料無法讀取").first()).toBeVisible({ timeout: 30_000 });
  });

  test("T4 目標保存失敗為部分完成；重試不重複建案", async ({ page }) => {
    const prefix = `[AI驗收] 複製工具 T4 ${Date.now().toString(36)}-t`;
    const sourceId = await createDraft(page, prefix);
    await seedTools(page, sourceId);
    await openCase(page, sourceId);
    const before = await listCaseIdsByTitlePrefix(page, prefix);

    let credentialWrites = 0;
    await page.route("**/rest/v1/rpc/update_case_credentials", async (route) => {
      credentialWrites += 1;
      if (credentialWrites === 1) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: "invalid_credentials", code: "22023" }),
        });
        return;
      }
      await route.continue();
    });

    await page.getByRole("button", { name: "複製本頁" }).click();
    await page.waitForURL((url) => {
      const m = url.pathname.match(/^\/cases\/([^/]+)/);
      return !!m && m[1] !== sourceId;
    }, { timeout: 60_000 });
    await expect(page.getByTestId("duplicate-tools-pending")).toBeVisible({ timeout: 30_000 });
    const newId = page.url().match(/\/cases\/([^/?#]+)/)![1];
    const mid = await listCaseIdsByTitlePrefix(page, prefix);
    expect(mid.length).toBe(before.length + 1);

    await page.getByTestId("retry-duplicate-tools").click();
    await expect.poll(() => backendFieldValues(page, newId, TOOL_ENTRY), { timeout: 30_000 }).toMatchObject({
      "f-server": "mq.copy.local",
      "f-user": "copy-user",
      "f-pass": "copy-pass",
    });
    await expect.poll(() => backendFieldValues(page, newId, QUESTION_ENTRY, "questionTools")).toMatchObject({
      "q-note": "copy-question-note",
    });
    await expect(page.getByTestId("duplicate-tools-pending")).toHaveCount(0);
    await page.unroute("**/rest/v1/rpc/update_case_credentials");
    const after = await listCaseIdsByTitlePrefix(page, prefix);
    expect(after).toEqual(mid);
  });

  test("T6 保存回應遺失先查證、不重複建案、不假成功", async ({ page }) => {
    const prefix = `[AI驗收] 複製工具 T6 ${Date.now().toString(36)}-t`;
    const sourceId = await createDraft(page, prefix);
    await seedTools(page, sourceId);
    await openCase(page, sourceId);
    const before = await listCaseIdsByTitlePrefix(page, prefix);

    let credentialWrites = 0;
    await page.route("**/rest/v1/rpc/update_case_credentials", async (route) => {
      credentialWrites += 1;
      if (credentialWrites === 1) {
        await route.fetch();
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.getByRole("button", { name: "複製本頁" }).click();
    await page.waitForURL((url) => {
      const m = url.pathname.match(/^\/cases\/([^/]+)/);
      return !!m && m[1] !== sourceId;
    }, { timeout: 60_000 });
    const newId = page.url().match(/\/cases\/([^/?#]+)/)![1];
    const mid = await listCaseIdsByTitlePrefix(page, prefix);
    expect(mid.length).toBe(before.length + 1);

    const pending = page.getByTestId("duplicate-tools-pending");
    if (await pending.isVisible().catch(() => false)) {
      await page.getByTestId("retry-duplicate-tools").click();
      await expect(page.getByText(/工具已寫入既有新案|工具重試未完成/)).toBeVisible({ timeout: 30_000 });
    }
    await page.unroute("**/rest/v1/rpc/update_case_credentials");
    const after = await listCaseIdsByTitlePrefix(page, prefix);
    expect(after).toEqual(mid);
    await expect.poll(() => backendFieldValues(page, newId, TOOL_ENTRY)).toMatchObject({
      "f-server": "mq.copy.local",
      "f-pass": "copy-pass",
    });
  });

  test("T7 寫入成功但回應／讀回失敗後重試：目標已完整則零次額外寫入", async ({ page }) => {
    const prefix = `[AI驗收] 複製工具 T7 ${Date.now().toString(36)}-t`;
    const sourceId = await createDraft(page, prefix);
    await seedTools(page, sourceId);
    await openCase(page, sourceId);

    let credentialWrites = 0;
    let blockTargetReads = true;
    await page.route("**/rest/v1/rpc/update_case_credentials", async (route) => {
      credentialWrites += 1;
      if (credentialWrites === 1) {
        await route.fetch();
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    await page.route("**/rest/v1/rpc/get_case_credentials", async (route) => {
      const body = route.request().postDataJSON() as { p_case_id?: string };
      if (blockTargetReads && body.p_case_id && body.p_case_id !== sourceId) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "unavailable" }),
        });
        return;
      }
      await route.continue();
    });

    await page.getByRole("button", { name: "複製本頁" }).click();
    await page.waitForURL((url) => {
      const m = url.pathname.match(/^\/cases\/([^/]+)/);
      return !!m && m[1] !== sourceId;
    }, { timeout: 60_000 });
    await expect(page.getByTestId("duplicate-tools-pending")).toBeVisible({ timeout: 30_000 });
    const newId = page.url().match(/\/cases\/([^/?#]+)/)![1];
    expect(credentialWrites).toBe(1);

    blockTargetReads = false;
    await page.getByTestId("retry-duplicate-tools").click();
    await expect(page.getByText("工具已核實完成", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("retry-duplicate-tools")).toHaveCount(0);
    expect(credentialWrites).toBe(1);
    await page.unroute("**/rest/v1/rpc/update_case_credentials");
    await page.unroute("**/rest/v1/rpc/get_case_credentials");
    await expect.poll(() => backendFieldValues(page, newId, TOOL_ENTRY)).toMatchObject({
      "f-server": "mq.copy.local",
      "f-pass": "copy-pass",
    });
  });

  test("T8 部分完成後手動補填再重試：不覆寫並報衝突", async ({ page }) => {
    const prefix = `[AI驗收] 複製工具 T8 ${Date.now().toString(36)}-t`;
    const sourceId = await createDraft(page, prefix);
    await seedTools(page, sourceId);
    await openCase(page, sourceId);

    await page.route("**/rest/v1/rpc/update_case_credentials", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ message: "invalid_credentials", code: "22023" }),
      });
    });
    await page.getByRole("button", { name: "複製本頁" }).click();
    await page.waitForURL((url) => {
      const m = url.pathname.match(/^\/cases\/([^/]+)/);
      return !!m && m[1] !== sourceId;
    }, { timeout: 60_000 });
    const newId = page.url().match(/\/cases\/([^/?#]+)/)![1];
    await expect(page.getByTestId("duplicate-tools-pending")).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press("Escape");

    await page.unroute("**/rest/v1/rpc/update_case_credentials");
    const filled = await page.evaluate(async ({ cid, toolEntry, toolLabel }) => {
      const agent = (window as unknown as {
        __lmsAgent: {
          tool: {
            ensureEntry: (i: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
            setField: (i: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
          };
        };
      }).__lmsAgent;
      const ensured = await agent.tool.ensureEntry({
        caseId: cid,
        toolEntryId: toolEntry,
        toolLabel,
        fields: [{ id: "f-server", label: "伺服器", type: "text" }],
      });
      if (!ensured.ok) return ensured;
      return agent.tool.setField({
        caseId: cid,
        toolEntryId: toolEntry,
        toolLabel,
        fieldKey: "f-server",
        value: "user-filled.local",
      });
    }, { cid: newId, toolEntry: TOOL_ENTRY, toolLabel: TOOL_LABEL });
    expect(filled.ok, filled.ok ? "" : filled.error).toBe(true);
    await expect.poll(() => backendFieldValues(page, newId, TOOL_ENTRY)).toMatchObject({
      "f-server": "user-filled.local",
    });

    await page.getByTestId("retry-duplicate-tools").click();
    await expect(page.getByTestId("duplicate-tools-conflict")).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => backendFieldValues(page, newId, TOOL_ENTRY)).toMatchObject({
      "f-server": "user-filled.local",
    });
    expect((await backendFieldValues(page, newId, TOOL_ENTRY))["f-pass"]).not.toBe("copy-pass");
  });

  test("T9 部分完成後來源變更：不默默改用新來源", async ({ page }) => {
    const prefix = `[AI驗收] 複製工具 T9 ${Date.now().toString(36)}-t`;
    const sourceId = await createDraft(page, prefix);
    await seedTools(page, sourceId);
    await openCase(page, sourceId);

    await page.route("**/rest/v1/rpc/update_case_credentials", async (route) => {
      const body = route.request().postDataJSON() as { p_case_id?: string };
      if (body.p_case_id && body.p_case_id !== sourceId) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: "invalid_credentials", code: "22023" }),
        });
        return;
      }
      await route.continue();
    });
    await page.getByRole("button", { name: "複製本頁" }).click();
    await page.waitForURL((url) => {
      const m = url.pathname.match(/^\/cases\/([^/]+)/);
      return !!m && m[1] !== sourceId;
    }, { timeout: 60_000 });
    const newId = page.url().match(/\/cases\/([^/?#]+)/)![1];
    await expect(page.getByTestId("duplicate-tools-pending")).toBeVisible({ timeout: 30_000 });

    const sourceChanged = await page.evaluate(async ({ cid, toolEntry, toolLabel }) => {
      const agent = (window as unknown as {
        __lmsAgent: {
          tool: { setField: (i: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }> };
        };
      }).__lmsAgent;
      return agent.tool.setField({
        caseId: cid,
        toolEntryId: toolEntry,
        toolLabel,
        fieldKey: "f-server",
        value: "source-changed.local",
      });
    }, { cid: sourceId, toolEntry: TOOL_ENTRY, toolLabel: TOOL_LABEL });
    expect(sourceChanged.ok, sourceChanged.ok ? "" : sourceChanged.error).toBe(true);

    await page.getByTestId("retry-duplicate-tools").click();
    await expect(page.getByTestId("duplicate-tools-source-changed")).toBeVisible({ timeout: 30_000 });
    const targetValues = await backendFieldValues(page, newId, TOOL_ENTRY);
    expect(targetValues["f-server"]).not.toBe("source-changed.local");
    await page.unroute("**/rest/v1/rpc/update_case_credentials");
  });

  test("T10 刷新後仍能辨認部分完成；切換假人不得沿用", async ({ page }) => {
    const prefix = `[AI驗收] 複製工具 T10 ${Date.now().toString(36)}-t`;
    const sourceId = await createDraft(page, prefix);
    await seedTools(page, sourceId);
    await openCase(page, sourceId);

    await page.route("**/rest/v1/rpc/update_case_credentials", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ message: "invalid_credentials", code: "22023" }),
      });
    });
    await page.getByRole("button", { name: "複製本頁" }).click();
    await page.waitForURL((url) => {
      const m = url.pathname.match(/^\/cases\/([^/]+)/);
      return !!m && m[1] !== sourceId;
    }, { timeout: 60_000 });
    const newId = page.url().match(/\/cases\/([^/?#]+)/)![1];
    await expect(page.getByTestId("duplicate-tools-pending")).toBeVisible({ timeout: 30_000 });
    await page.unroute("**/rest/v1/rpc/update_case_credentials");

    await page.reload({ waitUntil: "load" });
    await openCase(page, newId);
    await expect(page.getByTestId("duplicate-tools-pending")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(newId)).toBeVisible();

    const stored = await page.evaluate((key) => window.localStorage.getItem(key), "tms.dupToolsPending.v1");
    expect(stored).toBeTruthy();
    expect(stored).not.toContain("copy-pass");
    expect(stored).not.toContain("mq.copy.local");

    await switchToTestPersona(page, "譯者一");
    await page.goto(`/cases/${newId}`);
    await expectTestModePersonaUiReady(page);
    await expect(page.getByTestId("retry-duplicate-tools")).toHaveCount(0);
  });

  test("T11 新案建立後例外仍回報新案識別、不重複建案", async ({ page }) => {
    const prefix = `[AI驗收] 複製工具 T11 ${Date.now().toString(36)}-t`;
    const sourceId = await createDraft(page, prefix);
    await seedTools(page, sourceId);
    await openCase(page, sourceId);
    const before = await listCaseIdsByTitlePrefix(page, prefix);

    await page.route("**/rest/v1/rpc/update_case_credentials", async (route) => {
      await route.abort("failed");
    });
    await page.getByRole("button", { name: "複製本頁" }).click();
    await page.waitForURL((url) => {
      const m = url.pathname.match(/^\/cases\/([^/]+)/);
      return !!m && m[1] !== sourceId;
    }, { timeout: 60_000 });
    const newId = page.url().match(/\/cases\/([^/?#]+)/)![1];
    await expect(page.getByText("新案件建立失敗")).toHaveCount(0);
    await expect(page.getByTestId("duplicate-tools-pending")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(newId)).toBeVisible();
    const after = await listCaseIdsByTitlePrefix(page, prefix);
    expect(after.length).toBe(before.length + 1);
    await page.unroute("**/rest/v1/rpc/update_case_credentials");
  });

  test("T12 部分完成後使用者清空新案工具：重試零次寫入、保持清空、報衝突", async ({ page }) => {
    const prefix = `[AI驗收] 複製工具 T12 ${Date.now().toString(36)}-t`;
    const sourceId = await createDraft(page, prefix);
    await seedTools(page, sourceId);
    await openCase(page, sourceId);
    const before = await listCaseIdsByTitlePrefix(page, prefix);

    await page.route("**/rest/v1/rpc/update_case_credentials", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ message: "invalid_credentials", code: "22023" }),
      });
    });
    await page.getByRole("button", { name: "複製本頁" }).click();
    await page.waitForURL((url) => {
      const m = url.pathname.match(/^\/cases\/([^/]+)/);
      return !!m && m[1] !== sourceId;
    }, { timeout: 60_000 });
    const newId = page.url().match(/\/cases\/([^/?#]+)/)![1];
    await expect(page.getByTestId("duplicate-tools-pending")).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press("Escape");
    await page.unroute("**/rest/v1/rpc/update_case_credentials");

    // 使用者先自己加了工具
    const added = await page.evaluate(async ({ cid, toolEntry, toolLabel }) => {
      const agent = (window as unknown as {
        __lmsAgent: {
          tool: {
            ensureEntry: (i: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
            setField: (i: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
          };
        };
      }).__lmsAgent;
      const ensured = await agent.tool.ensureEntry({
        caseId: cid,
        toolEntryId: toolEntry,
        toolLabel,
        fields: [{ id: "f-server", label: "伺服器", type: "text" }],
      });
      if (!ensured.ok) return ensured;
      return agent.tool.setField({
        caseId: cid,
        toolEntryId: toolEntry,
        toolLabel,
        fieldKey: "f-server",
        value: "user-added.local",
      });
    }, { cid: newId, toolEntry: TOOL_ENTRY, toolLabel: TOOL_LABEL });
    expect(added.ok, added.ok ? "" : added.error).toBe(true);

    // 再全部刪掉：內容看起來與「從未寫入」一樣空
    await clearBackendTools(page, newId);
    await expect.poll(() => readBackendTools(page, newId)).toHaveLength(0);

    let credentialWrites = 0;
    await page.route("**/rest/v1/rpc/update_case_credentials", async (route) => {
      credentialWrites += 1;
      await route.continue();
    });
    await page.getByTestId("retry-duplicate-tools").click();
    await expect(page.getByTestId("duplicate-tools-conflict")).toBeVisible({ timeout: 30_000 });
    expect(credentialWrites).toBe(0);
    await page.unroute("**/rest/v1/rpc/update_case_credentials");

    expect(await readBackendTools(page, newId)).toHaveLength(0);
    expect(await readBackendTools(page, newId, "questionTools")).toHaveLength(0);
    const after = await listCaseIdsByTitlePrefix(page, prefix);
    expect(after.length).toBe(before.length + 1);
  });

  test("T13 等待期間被別的操作改過又清空：重試零次寫入並報衝突", async ({ page }) => {
    const prefix = `[AI驗收] 複製工具 T13 ${Date.now().toString(36)}-t`;
    const sourceId = await createDraft(page, prefix);
    await seedTools(page, sourceId);
    await openCase(page, sourceId);
    const before = await listCaseIdsByTitlePrefix(page, prefix);
    const token = await accessToken(page);

    let targetWrites = 0;
    let interferedCaseId = "";
    await page.route("**/rest/v1/rpc/update_case_credentials", async (route) => {
      const body = route.request().postDataJSON() as { p_case_id?: string } | null;
      const cid = body?.p_case_id;
      if (!cid || cid === sourceId) {
        await route.continue();
        return;
      }
      targetWrites += 1;
      if (targetWrites === 1) {
        // 工具寫入尚未完成／失敗處理尚未結束時，由另一操作修改並清空新案。
        await bumpAndClearToolsOutOfBand(page, cid, token);
        interferedCaseId = cid;
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: "invalid_credentials", code: "22023" }),
        });
        return;
      }
      await route.continue();
    });

    await page.getByRole("button", { name: "複製本頁" }).click();
    await page.waitForURL((url) => {
      const m = url.pathname.match(/^\/cases\/([^/]+)/);
      return !!m && m[1] !== sourceId;
    }, { timeout: 60_000 });
    const newId = page.url().match(/\/cases\/([^/?#]+)/)![1];
    await expect(page.getByTestId("duplicate-tools-pending")).toBeVisible({ timeout: 30_000 });
    expect(interferedCaseId).toBe(newId);
    await page.unroute("**/rest/v1/rpc/update_case_credentials");
    // 新案內容看起來與「從未寫入」一樣空，但版本已被別的操作推進。
    await expect.poll(() => readBackendTools(page, newId)).toHaveLength(0);

    let retryWrites = 0;
    await page.route("**/rest/v1/rpc/update_case_credentials", async (route) => {
      retryWrites += 1;
      await route.continue();
    });
    await page.getByTestId("retry-duplicate-tools").click();
    await expect(page.getByTestId("duplicate-tools-conflict")).toBeVisible({ timeout: 30_000 });
    expect(retryWrites).toBe(0);
    await page.unroute("**/rest/v1/rpc/update_case_credentials");

    expect(await readBackendTools(page, newId)).toHaveLength(0);
    expect(await readBackendTools(page, newId, "questionTools")).toHaveLength(0);
    const after = await listCaseIdsByTitlePrefix(page, prefix);
    expect(after.length).toBe(before.length + 1);
  });

  test("T14 建案成功但首次讀回失敗：保留新案識別、不新增第二張案", async ({ page }) => {
    const prefix = `[AI驗收] 複製工具 T14 ${Date.now().toString(36)}-t`;
    const sourceId = await createDraft(page, prefix);
    await seedTools(page, sourceId);
    await openCase(page, sourceId);
    const before = await listCaseIdsByTitlePrefix(page, prefix);
    const reserved = trackReservedCaseIds(page);

    let blockNewCaseReads = true;
    await page.route("**/rest/v1/cases_visible*", async (route) => {
      const url = route.request().url();
      if (blockNewCaseReads && url.includes("id=eq.") && !url.includes(sourceId)) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "readback_unavailable" }),
        });
        return;
      }
      await route.continue();
    });
    let toolWrites = 0;
    await page.route("**/rest/v1/rpc/update_case_credentials", async (route) => {
      toolWrites += 1;
      await route.continue();
    });

    await page.getByRole("button", { name: "複製本頁" }).click();
    const readbackPending = page.getByTestId("duplicate-tools-readback-pending");
    await expect(readbackPending).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("新案件建立失敗")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/cases/${sourceId}`));
    // 送出前就保留同一識別，且只送出一次建案。
    expect(reserved.ids).toHaveLength(1);
    const newId = reserved.ids[0];
    await expect(readbackPending).toContainText(newId);
    expect(toolWrites).toBe(0);

    blockNewCaseReads = false;
    const mid = await listCaseIdsByTitlePrefix(page, prefix);
    expect(mid.length).toBe(before.length + 1);
    expect(mid).toContain(newId);

    // 對話框內直接重試：新案資料尚未讀回時明確停止，不再建一筆。
    await page.getByTestId("retry-duplicate-tools").click();
    await expect(page.getByTestId("duplicate-tools-pending")).toContainText(/未重送、未再建案|未覆寫/, {
      timeout: 30_000,
    });
    expect(reserved.ids).toHaveLength(1);

    // 刷新後仍認得同一新案（保守停止，不自動回填）。
    await page.reload({ waitUntil: "load" });
    await openCase(page, newId);
    await expect(page.getByTestId("duplicate-tools-pending")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("retry-duplicate-tools").click();
    await expect(page.getByTestId("duplicate-tools-conflict")).toBeVisible({ timeout: 30_000 });
    await page.unroute("**/rest/v1/rpc/update_case_credentials");
    await page.unroute("**/rest/v1/cases_visible*");
    expect(reserved.ids).toHaveLength(1);
    const after = await listCaseIdsByTitlePrefix(page, prefix);
    expect(after.length).toBe(mid.length);
  });

  test("T15 建案回應遺失：以同一識別查證、不新增第二張案", async ({ page }) => {
    const prefix = `[AI驗收] 複製工具 T15 ${Date.now().toString(36)}-t`;
    const sourceId = await createDraft(page, prefix);
    await seedTools(page, sourceId);
    await openCase(page, sourceId);
    const before = await listCaseIdsByTitlePrefix(page, prefix);
    const reserved = trackReservedCaseIds(page);

    let createCalls = 0;
    await page.route("**/rest/v1/rpc/admin_create_case", async (route) => {
      createCalls += 1;
      if (createCalls === 1) {
        await route.fetch();
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.getByRole("button", { name: "複製本頁" }).click();
    await page.waitForURL((url) => {
      const m = url.pathname.match(/^\/cases\/([^/]+)/);
      return !!m && m[1] !== sourceId;
    }, { timeout: 60_000 });
    const newId = page.url().match(/\/cases\/([^/?#]+)/)![1];
    expect(reserved.ids).toEqual([newId]);
    expect(createCalls).toBe(1);
    await expect(page.getByText("新案件建立失敗")).toHaveCount(0);
    await expect(page.getByText("建案結果未知")).toHaveCount(0);
    await page.unroute("**/rest/v1/rpc/admin_create_case");

    await expect.poll(() => backendFieldValues(page, newId, TOOL_ENTRY), { timeout: 30_000 }).toMatchObject({
      "f-server": "mq.copy.local",
      "f-user": "copy-user",
      "f-pass": "copy-pass",
    });
    const after = await listCaseIdsByTitlePrefix(page, prefix);
    expect(after.length).toBe(before.length + 1);
    expect(after).toContain(newId);
  });

  test("T5 複製後連續編輯仍走 #85 單欄保全", async ({ page }) => {
    const prefix = `[AI驗收] 複製工具 T5 ${Date.now().toString(36)}-t`;
    const sourceId = await createDraft(page, prefix);
    await seedTools(page, sourceId);
    await openCase(page, sourceId);
    const newId = await copyCurrentPage(page, sourceId);
    await openCase(page, newId);
    await expect(page.getByTestId("tool-server")).toBeEnabled({ timeout: 60_000 });
    await expect.poll(() => backendFieldValues(page, newId, TOOL_ENTRY)).toMatchObject({
      "f-server": "mq.copy.local",
      "f-user": "copy-user",
    });

    const gate = await holdFirstCredentialWrite(page);
    await typeAndBlur(page, "tool-server", "mq.copy.v2");
    await gate.firstRequestSent;
    await typeAndBlur(page, "tool-username", "copy-user-v2");
    expect(gate.seenCount()).toBe(1);
    gate.release();
    await expect.poll(() => backendFieldValues(page, newId, TOOL_ENTRY), { timeout: 60_000 }).toMatchObject({
      "f-server": "mq.copy.v2",
      "f-user": "copy-user-v2",
      "f-pass": "copy-pass",
    });
    await gate.stop();
  });
});
