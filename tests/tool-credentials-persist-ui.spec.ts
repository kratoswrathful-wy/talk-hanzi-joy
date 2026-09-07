import { test, expect, type Locator, type Page } from "@playwright/test";
import { expectTestModePersonaUiReady, switchToTestPersona } from "./helpers/test-mode-persona";

/**
 * 工具保存止損驗收（#85）：實際頁面欄位 + 後端讀回。
 *
 * 只在本機隔離 Supabase（`supabase start`，已套用全部 migration）啟用：
 *   PLAYWRIGHT_TOOL_CREDENTIALS_UI=1
 * 正式後端不得跑本 spec——每個測試都會先斷言 API 指向 loopback 且不含正式 ref。
 *
 * 紅綠依據：`ToolInstance` 舊呼叫端送整組 render 快照 `fieldValues`，
 * 前一筆保存未確認時會把兄弟欄位覆蓋回舊值（Riot - Riftbound 260908：
 * 五欄輸入後只剩最後一欄有值）。修正後只送本次改動的欄位。
 *
 * 合成值僅為可辨識字串，非任何真實憑證。
 */

const ENABLED = process.env.PLAYWRIGHT_TOOL_CREDENTIALS_UI === "1";
const describeTool = ENABLED ? test.describe : test.describe.skip;

const PRODUCTION_REF = "wshsmerltcakffllgyul";
const TOOL_LABEL = "memoQ";
const ENTRY_ID = "te-toolui";

/** 合成欄位：label 決定 data-testid（見 CaseDetailPage TOOL_FIELD_TESTID_BY_LABEL）。 */
const TEXT_FIELDS = [
  { id: "f-server", label: "伺服器", testId: "tool-server", value: "mq.synthetic.local" },
  { id: "f-user", label: "帳號", testId: "tool-username", value: "synthetic-user" },
  { id: "f-pass", label: "密碼", testId: "tool-password", value: "synthetic-pass" },
  { id: "f-project", label: "專案名稱", testId: "tool-project", value: "synthetic-project" },
  { id: "f-file", label: "檔案名稱", testId: "tool-files", value: "synthetic-file.mqxliff" },
] as const;

const UPDATE_RPC = "**/rest/v1/rpc/update_case_credentials";

type AgentResult<T> = { ok: boolean; data?: T; error?: string };

function localApi(): { url: string; anonKey: string } {
  const url = process.env.VITE_SUPABASE_URL ?? "";
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  expect(url, "VITE_SUPABASE_URL 必須指向本機隔離 Supabase").toBeTruthy();
  expect(anonKey, "VITE_SUPABASE_PUBLISHABLE_KEY 必須存在").toBeTruthy();
  expect(
    new RegExp(PRODUCTION_REF, "i").test(url),
    "禁止對正式後端執行工具保存驗收",
  ).toBe(false);
  expect(
    /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(url),
    "工具保存驗收必須指向 loopback",
  ).toBe(true);
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
    if (!keys.length) return null;
    keys.sort();
    let raw = keys.map((k) => localStorage.getItem(k) ?? "").join("");
    if (raw.startsWith("base64-")) raw = b64urlDecode(raw.slice(7));
    return (JSON.parse(raw) as { access_token?: string }).access_token ?? null;
  });
  expect(token, "需要登入 session token 才能直讀後端").toBeTruthy();
  return token!;
}

type BackendEntry = {
  id: string;
  tool: string;
  fields?: { id: string }[];
  fieldValues?: Record<string, string>;
  fileValues?: Record<string, { name: string; url: string }[]>;
};

/**
 * 後端實際值：走 `get_case_credentials`（未遮罩），不是畫面狀態、不是 cases_visible。
 */
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
          Accept: "application/json",
        },
        body: JSON.stringify({ p_case_id: cid }),
      });
      return { ok: r.ok, status: r.status, body: await r.text() };
    },
    { apiUrl: url, anon: anonKey, jwt: token, cid: caseId },
  );
  expect(res.ok, `get_case_credentials HTTP ${res.status}: ${res.body}`).toBe(true);
  const parsed = JSON.parse(res.body) as {
    tools?: BackendEntry[];
    questionTools?: BackendEntry[];
    question_tools?: BackendEntry[];
  };
  const list =
    block === "tools"
      ? parsed.tools
      : parsed.questionTools ?? parsed.question_tools;
  return Array.isArray(list) ? list : [];
}

async function backendFieldValues(page: Page, caseId: string): Promise<Record<string, string>> {
  const tools = await readBackendTools(page, caseId);
  const entry = tools.find((t) => t.id === ENTRY_ID);
  expect(entry, `後端找不到工具 entry ${ENTRY_ID}（實際：${JSON.stringify(tools.map((t) => t.id))}）`)
    .toBeTruthy();
  return entry!.fieldValues ?? {};
}

async function restJson(
  page: Page,
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ ok: boolean; status: number; body: string }> {
  const { url, anonKey } = localApi();
  const token = await accessToken(page);
  return page.evaluate(
    async ({ apiUrl, anon, jwt, restPath, method, body, extraHeaders }) => {
      const r = await fetch(`${apiUrl}${restPath}`, {
        method,
        headers: {
          apikey: anon,
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...extraHeaders,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { ok: r.ok, status: r.status, body: await r.text() };
    },
    {
      apiUrl: url,
      anon: anonKey,
      jwt: token,
      restPath: path,
      method: init.method ?? "GET",
      body: init.body,
      extraHeaders: init.headers ?? {},
    },
  );
}

/** 後端案件譯者：走 cases_visible，不是畫面假設。 */
async function readBackendTranslator(page: Page, caseId: string): Promise<string[]> {
  const res = await restJson(page, `/rest/v1/cases_visible?id=eq.${caseId}&select=id,translator`);
  expect(res.ok, `cases_visible translator HTTP ${res.status}: ${res.body}`).toBe(true);
  const rows = JSON.parse(res.body) as { translator?: unknown }[];
  const raw = rows[0]?.translator;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw) return [raw];
  return [];
}

const TEMPLATE_NAME = "合成memoQ範本";
const TRANSLATOR_ONE = "譯者一（測試）";
const TRANSLATOR_TWO = "譯者二（測試）";

async function seedMemoqTemplate(page: Page) {
  const template = {
    id: "tpl-toolui-synthetic",
    name: TEMPLATE_NAME,
    tool: TOOL_LABEL,
    fields: [
      ...TEXT_FIELDS.map((f) => ({ id: f.id, label: f.label, type: "text" as const })),
      { id: "f-ref", label: "參考檔", type: "file" as const },
      { id: "f-note", label: "模板附註", type: "text" as const },
    ],
    fieldValues: {
      "f-server": "mq.template.applied",
      "f-pass": "template-pass",
    },
  };
  const res = await restJson(page, "/rest/v1/app_settings", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: { key: "test:tool_templates", value: [template] },
  });
  expect(res.ok, `寫入合成範本 HTTP ${res.status}: ${res.body}`).toBe(true);
}

function translatorRow(page: Page): Locator {
  return page.locator("div.grid").filter({ has: page.locator("span", { hasText: /^譯者$/ }) }).first();
}

/** 以執行長身分建案並播下工具結構（走憑證路徑，禁止 case.update 寫 tools）。 */
async function createCaseWithTool(page: Page, titleSuffix: string): Promise<string> {
  await page.goto("/cases");
  await expectTestModePersonaUiReady(page);
  await page.waitForFunction(
    () => !!(window as unknown as { __lmsAgent?: unknown }).__lmsAgent,
    null,
    { timeout: 60_000 },
  );

  const title = `[AI驗收] 工具保存 ${titleSuffix} ${Date.now().toString(36)}`;
  const created = await page.evaluate(
    async ({ caseTitle, entryId, toolLabel, fields }) => {
      const agent = (window as unknown as {
        __lmsAgent: {
          case: { create: (i: Record<string, unknown>) => Promise<AgentResult<{ id: string }>> };
          tool: {
            ensureEntry: (i: Record<string, unknown>) => Promise<AgentResult<{ verified?: boolean }>>;
          };
        };
      }).__lmsAgent;
      const c = await agent.case.create({ title: caseTitle, status: "draft" });
      if (!c.ok || !c.data?.id) return { ok: false as const, error: c.error || "create failed" };
      const seeded = await agent.tool.ensureEntry({
        caseId: c.data.id,
        toolEntryId: entryId,
        toolLabel,
        fields,
      });
      if (!seeded.ok) return { ok: false as const, error: seeded.error || "seed failed", id: c.data.id };
      return { ok: true as const, id: c.data.id };
    },
    {
      caseTitle: title,
      entryId: ENTRY_ID,
      toolLabel: TOOL_LABEL,
      fields: [
        ...TEXT_FIELDS.map((f) => ({ id: f.id, label: f.label, type: "text" as const })),
        { id: "f-ref", label: "參考檔", type: "file" as const },
      ],
    },
  );
  expect(created.ok, created.ok ? "" : created.error).toBe(true);
  return created.id!;
}

async function openCase(page: Page, caseId: string) {
  await page.goto(`/cases/${caseId}`);
  await expectTestModePersonaUiReady(page);
  // 憑證載入完成的確定訊號：欄位可編輯（載入中／error 時為 disabled）
  await expect(field(page, "tool-server")).toBeEnabled({ timeout: 60_000 });
}

function field(page: Page, testId: string): Locator {
  return page.getByTestId(testId).first();
}

/**
 * 實際欄位操作：填入後等 React 受控值落地，再用 Tab 失焦保存。
 * 不使用固定 sleep；toHaveValue 是確定訊號，避免 fill 後立刻 blur 吃到上一輪 local。
 */
async function typeAndBlur(page: Page, testId: string, value: string) {
  const el = field(page, testId);
  await expect(el).toBeEnabled();
  await el.click();
  await el.fill(value);
  await expect(el).toHaveValue(value);
  await el.press("Tab");
}

/**
 * 攔住 `update_case_credentials`：第一筆請求先掛住，回傳 release()。
 * 用來確定性重現「前一筆保存仍在進行時修改下一欄」，不使用固定 sleep。
 */
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

  await page.route(UPDATE_RPC, async (route) => {
    seen += 1;
    if (seen > 1) {
      await route.continue();
      return;
    }
    // 先把寫入送到後端，但延後把回應交還前端：
    // 前端的 confirmed 快取直到 fulfill 才更新，正是舊呼叫端拿到過期快照的條件。
    const response = await route.fetch();
    markSent();
    await gate;
    try {
      await route.fulfill({ response });
    } catch {
      // 測試收尾時 unroute／關頁可能已接手這筆 route，不影響斷言
    }
  });

  return {
    firstRequestSent,
    release,
    seenCount: () => seen,
    stop: () => page.unroute(UPDATE_RPC),
  };
}

describeTool("工具保存實際 UI + 後端讀回（#85 止損驗收）", () => {
  // 六項各自建案，互不依賴：一項失敗仍要拿到其餘各項的 PASS／FAIL
  test.describe.configure({ mode: "default" });
  // T2 需要真實貼上事件
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("T1 五欄快速連續編輯：全部保留，刷新後一致（核心紅綠）", async ({ page }) => {
    const caseId = await createCaseWithTool(page, "T1");
    await openCase(page, caseId);

    // 先依序填滿並確認後端——空欄開始時舊呼叫端的「整組快照」與單欄修補等價，無法重現覆蓋。
    for (const f of TEXT_FIELDS) {
      await typeAndBlur(page, f.testId, f.value);
    }
    await expect
      .poll(() => backendFieldValues(page, caseId), { timeout: 60_000 })
      .toMatchObject(Object.fromEntries(TEXT_FIELDS.map((f) => [f.id, f.value])));

    const gate = await holdFirstCredentialWrite(page);

    // 已有確認值後再重疊改兩欄：舊呼叫端會把第一欄覆回填滿時的舊值
    await typeAndBlur(page, TEXT_FIELDS[0].testId, "mq.synthetic.v2");
    await gate.firstRequestSent;
    await typeAndBlur(page, TEXT_FIELDS[1].testId, "synthetic-user-v2");

    // 第一筆回應尚未交還前端：後續四欄已失焦並排入同一佇列。
    // 不在此檢查畫面兄弟欄位——未確認的第一筆回應回來前，受控 value 仍可能是空字串。
    expect(gate.seenCount(), "第一筆保存必須仍在進行（尚未釋放回應）").toBe(1);

    gate.release();
    await expect.poll(() => gate.seenCount(), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
    await gate.stop();

    // 後端：兩次重疊修改都必須留下，其餘三欄不得被舊快照覆回
    await expect
      .poll(() => backendFieldValues(page, caseId), { timeout: 60_000 })
      .toMatchObject({
        "f-server": "mq.synthetic.v2",
        "f-user": "synthetic-user-v2",
        "f-pass": TEXT_FIELDS[2].value,
        "f-project": TEXT_FIELDS[3].value,
        "f-file": TEXT_FIELDS[4].value,
      });

    // 畫面刷新後一致
    await page.reload({ waitUntil: "load" });
    await openCase(page, caseId);
    await expect(field(page, "tool-server")).toHaveValue("mq.synthetic.v2");
    await expect(field(page, "tool-username")).toHaveValue("synthetic-user-v2");
    for (const f of TEXT_FIELDS.slice(2)) {
      await expect(field(page, f.testId)).toHaveValue(f.value);
    }
  });

  test("T2 輸入／貼上／Backspace／有意清空／失焦：只改指定欄位", async ({ page }) => {
    const caseId = await createCaseWithTool(page, "T2");
    await openCase(page, caseId);

    for (const f of TEXT_FIELDS) {
      await typeAndBlur(page, f.testId, f.value);
      await expect
        .poll(() => backendFieldValues(page, caseId), { timeout: 30_000 })
        .toMatchObject({ [f.id]: f.value });
    }

    // 貼上（真事件，非 fill）
    const project = field(page, "tool-project");
    await project.click();
    await page.evaluate(async (v) => {
      await navigator.clipboard.writeText(v);
    }, "pasted-project");
    await project.press("ControlOrMeta+a");
    await project.press("ControlOrMeta+v");
    await project.blur();
    await expect
      .poll(() => backendFieldValues(page, caseId), { timeout: 30_000 })
      .toMatchObject({ "f-project": "pasted-project" });

    // Backspace 刪字
    const user = field(page, "tool-username");
    await user.click();
    await user.press("End");
    await user.press("Backspace");
    await user.blur();
    await expect
      .poll(() => backendFieldValues(page, caseId), { timeout: 30_000 })
      .toMatchObject({ "f-user": TEXT_FIELDS[1].value.slice(0, -1) });

    // 有意清空：只清該欄，其他欄不動
    const pass = field(page, "tool-password");
    await pass.click();
    await pass.fill("");
    await pass.blur();
    await expect
      .poll(() => backendFieldValues(page, caseId), { timeout: 30_000 })
      .toMatchObject({
        "f-pass": "",
        "f-server": TEXT_FIELDS[0].value,
        "f-project": "pasted-project",
        "f-file": TEXT_FIELDS[4].value,
      });

    // 純失焦（未改動）不得產生寫入
    let writes = 0;
    page.on("request", (r) => {
      if (r.url().includes("/rpc/update_case_credentials")) writes += 1;
    });
    const server = field(page, "tool-server");
    await server.click();
    await server.blur();
    await page
      .waitForRequest((r) => r.url().includes("/rpc/update_case_credentials"), { timeout: 1_500 })
      .then(
        () => {
          throw new Error("未改動的失焦不得送出憑證寫入");
        },
        () => undefined,
      );
    expect(writes, "未改動的失焦不得送出憑證寫入").toBe(0);
  });

  test("T3 檔案欄位呼叫端：其他文字欄位與其他工具不受影響", async ({ page }) => {
    const caseId = await createCaseWithTool(page, "T3");
    await openCase(page, caseId);

    for (const f of TEXT_FIELDS) {
      await typeAndBlur(page, f.testId, f.value);
    }
    await expect
      .poll(() => backendFieldValues(page, caseId), { timeout: 60_000 })
      .toMatchObject(Object.fromEntries(TEXT_FIELDS.map((f) => [f.id, f.value])));

    const beforeQuestionTools = await readBackendTools(page, caseId, "questionTools");

    // 檔案型欄位：走 toolFileValuePatch 呼叫端
    const fileRow = field(page, "tool-field-f-ref");
    await expect(fileRow).toBeVisible({ timeout: 30_000 });
    const fileInput = fileRow.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: "synthetic-ref.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("synthetic reference payload"),
    });

    await expect
      .poll(
        async () => {
          const tools = await readBackendTools(page, caseId);
          const entry = tools.find((t) => t.id === ENTRY_ID);
          return (entry?.fileValues?.["f-ref"] ?? []).length;
        },
        { timeout: 60_000 },
      )
      .toBeGreaterThan(0);

    // 文字欄位必須完好
    await expect
      .poll(() => backendFieldValues(page, caseId), { timeout: 30_000 })
      .toMatchObject(Object.fromEntries(TEXT_FIELDS.map((f) => [f.id, f.value])));

    // 提問工具不得被波及
    const afterQuestionTools = await readBackendTools(page, caseId, "questionTools");
    expect(afterQuestionTools).toEqual(beforeQuestionTools);
  });

  test("T4 實際更換指派者：指派保存且工具全部保留", async ({ page }) => {
    const caseId = await createCaseWithTool(page, "T4");
    await openCase(page, caseId);

    for (const f of TEXT_FIELDS) {
      await typeAndBlur(page, f.testId, f.value);
    }
    const expected = Object.fromEntries(TEXT_FIELDS.map((f) => [f.id, f.value]));
    await expect
      .poll(() => backendFieldValues(page, caseId), { timeout: 60_000 })
      .toMatchObject(expected);

    let credentialWrites = 0;
    page.on("request", (r) => {
      if (r.url().includes("/rpc/update_case_credentials")) credentialWrites += 1;
    });

    const titleInput = page.getByTestId("case-title-input");
    await titleInput.click();
    await titleInput.fill(`${await titleInput.inputValue()} 改標題`);
    await titleInput.blur();

    const keyword = page.getByTestId("case-keyword-input");
    await keyword.click();
    await keyword.fill("synthetic-keyword");
    await expect(keyword).toHaveValue("synthetic-keyword");
    await keyword.press("Tab");

    const trigger = translatorRow(page).getByRole("button").first();
    await expect(trigger, "譯者指派入口必須可操作，不得略過").toBeVisible({ timeout: 30_000 });
    await trigger.click();
    const popover = page.locator("[data-radix-popper-content-wrapper]");
    const first = popover.getByText(TRANSLATOR_ONE, { exact: true });
    await expect(first, `譯者選單必須有隔離假人「${TRANSLATOR_ONE}」`).toBeVisible({ timeout: 30_000 });
    await first.click();
    await expect
      .poll(() => readBackendTranslator(page, caseId), { timeout: 60_000 })
      .toEqual([TRANSLATOR_ONE]);

    await trigger.click();
    const second = popover.getByText(TRANSLATOR_TWO, { exact: true });
    await expect(second, `必須能改派到「${TRANSLATOR_TWO}」`).toBeVisible({ timeout: 30_000 });
    await second.click();
    await expect
      .poll(() => readBackendTranslator(page, caseId), { timeout: 60_000 })
      .toEqual([TRANSLATOR_TWO]);

    await expect
      .poll(() => backendFieldValues(page, caseId), { timeout: 60_000 })
      .toMatchObject(expected);
    expect(credentialWrites, "改標題／關鍵字／指派不得送出工具憑證更新").toBe(0);

    await page.reload({ waitUntil: "load" });
    await openCase(page, caseId);
    await expect
      .poll(() => readBackendTranslator(page, caseId), { timeout: 30_000 })
      .toEqual([TRANSLATOR_TWO]);
    await expect
      .poll(() => backendFieldValues(page, caseId), { timeout: 30_000 })
      .toMatchObject(expected);
    await expect(translatorRow(page).getByText(TRANSLATOR_TWO)).toBeVisible();
  });

  test("T5 確定套用範本：有意替換、與未確認編輯重疊、確認窗後底稿變動", async ({ page }) => {
    const caseId = await createCaseWithTool(page, "T5");
    await openCase(page, caseId);

    for (const f of TEXT_FIELDS) {
      await typeAndBlur(page, f.testId, f.value);
    }
    await expect
      .poll(() => backendFieldValues(page, caseId), { timeout: 60_000 })
      .toMatchObject(Object.fromEntries(TEXT_FIELDS.map((f) => [f.id, f.value])));

    await seedMemoqTemplate(page);

    await page.route("**/rest/v1/rpc/get_case_credentials", async (route) => {
      await new Promise((r) => setTimeout(r, 3_000));
      try {
        await route.continue();
      } catch {
        // unroute／換頁後這筆 route 可能已被接手
      }
    });
    await page.goto(`/cases/${caseId}`);
    await expectTestModePersonaUiReady(page);
    await expect(field(page, "tool-server")).toBeDisabled();
    await expect(page.getByRole("button", { name: "範本" }).first()).toBeDisabled();
    await page.unroute("**/rest/v1/rpc/get_case_credentials");

    await openCase(page, caseId);
    await expect(field(page, "tool-server")).toHaveValue(TEXT_FIELDS[0].value);
    await expect
      .poll(() => backendFieldValues(page, caseId), { timeout: 30_000 })
      .toMatchObject(Object.fromEntries(TEXT_FIELDS.map((f) => [f.id, f.value])));

    const tplBtn = page.getByRole("button", { name: "範本" }).first();
    await expect(tplBtn, "載入完成後範本按鈕必須可按").toBeEnabled();
    const beforeQuestionTools = await readBackendTools(page, caseId, "questionTools");

    const gate = await holdFirstCredentialWrite(page);
    await typeAndBlur(page, "tool-server", "mq.synthetic.v2");
    await gate.firstRequestSent;
    expect(gate.seenCount(), "第一筆保存必須仍在進行").toBe(1);
    // 第一筆未確認時改帳號：實際欄位、真實 onSave，與稍後的確定套用重疊
    await typeAndBlur(page, "tool-username", "synthetic-user-draft");

    await tplBtn.click();
    const tplOption = page.getByTestId(`template-option-${TEMPLATE_NAME}`);
    await expect(tplOption, "合成範本必須出現在選單，不得略過").toBeVisible({ timeout: 30_000 });
    await tplOption.click();
    await expect(page.getByRole("heading", { name: "套用範本確定" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("模板附註")).toBeVisible();

    // 遮罩擋住點擊，但不關確認窗：讓實際專案欄走 fill＋blur＋onSave
    const overlay = page.locator("[data-radix-alert-dialog-overlay]");
    if (await overlay.count()) {
      await overlay.evaluate((el) => {
        (el as HTMLElement).style.pointerEvents = "none";
      });
    }
    await typeAndBlur(page, "tool-project", "project-after-dialog");
    await page.getByRole("button", { name: "確定套用" }).click();

    gate.release();
    await expect.poll(() => gate.seenCount(), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
    await gate.stop();

    await expect
      .poll(() => backendFieldValues(page, caseId), { timeout: 60_000 })
      .toMatchObject({
        "f-server": "mq.template.applied",
        "f-user": "synthetic-user-draft",
        "f-pass": "template-pass",
        "f-project": "project-after-dialog",
        "f-file": TEXT_FIELDS[4].value,
      });
    const after = await readBackendTools(page, caseId);
    const entry = after.find((t) => t.id === ENTRY_ID);
    expect(entry?.fields?.some((f) => f.id === "f-note"), "範本新增欄位必須寫入").toBe(true);
    expect(await readBackendTools(page, caseId, "questionTools")).toEqual(beforeQuestionTools);

    await page.reload({ waitUntil: "load" });
    await openCase(page, caseId);
    await expect(field(page, "tool-server")).toHaveValue("mq.template.applied");
    await expect(field(page, "tool-username")).toHaveValue("synthetic-user-draft");
    await expect(field(page, "tool-password")).toHaveValue("template-pass");
    await expect(field(page, "tool-project")).toHaveValue("project-after-dialog");
  });

  test("T6 切案／切帳／讀取失敗／寫入成功但讀回失敗：不得跨案覆蓋或假成功", async ({ page }) => {
    const caseA = await createCaseWithTool(page, "T6A");
    const caseB = await createCaseWithTool(page, "T6B");

    await openCase(page, caseA);
    await typeAndBlur(page, "tool-server", "case-a-server");
    await expect
      .poll(() => backendFieldValues(page, caseA), { timeout: 30_000 })
      .toMatchObject({ "f-server": "case-a-server" });

    // 切案：A 的晚到結果不得落到 B
    await openCase(page, caseB);
    await typeAndBlur(page, "tool-server", "case-b-server");
    await expect
      .poll(() => backendFieldValues(page, caseB), { timeout: 30_000 })
      .toMatchObject({ "f-server": "case-b-server" });
    await expect
      .poll(() => backendFieldValues(page, caseA), { timeout: 30_000 })
      .toMatchObject({ "f-server": "case-a-server" });

    // 讀取失敗：不得把畫面當成可寫的空白底稿
    await page.route("**/rest/v1/rpc/get_case_credentials", (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ message: "synthetic read failure" }) }),
    );
    await page.goto(`/cases/${caseB}`);
    await expectTestModePersonaUiReady(page);
    await expect(field(page, "tool-server")).toBeDisabled();
    await page.unroute("**/rest/v1/rpc/get_case_credentials");

    // 寫入成功但讀回失敗：必須明確顯示「已寫入、尚未確認讀回」，不得回報完整成功
    await openCase(page, caseB);
    let writeSeen = false;
    await page.route(UPDATE_RPC, async (route) => {
      if (!writeSeen) {
        writeSeen = true;
        await route.continue();
        return;
      }
      await route.continue();
    });
    await page.route("**/rest/v1/rpc/get_case_credentials", async (route) => {
      if (writeSeen) {
        await route.fulfill({
          status: 500,
          body: JSON.stringify({ message: "synthetic readback failure" }),
        });
        return;
      }
      await route.continue();
    });
    await typeAndBlur(page, "tool-project", "readback-fail-project");
    await expect(page.getByText("工具已寫入、尚未確認讀回").first()).toBeVisible({ timeout: 30_000 });
    await page.unroute("**/rest/v1/rpc/get_case_credentials");
    await page.unroute(UPDATE_RPC);

    // 後端確實已寫入（不得因讀回失敗而重送整組或回填舊值）
    await expect
      .poll(() => backendFieldValues(page, caseB), { timeout: 30_000 })
      .toMatchObject({ "f-project": "readback-fail-project", "f-server": "case-b-server" });

    // 切帳：換成譯者假人後不得用舊身分覆蓋；譯者讀憑證應被拒，再切回執行長核對 A 案未變
    await switchToTestPersona(page, "譯者一");
    await expect(page.getByRole("button", { name: /^譯者一/ }).first()).toHaveClass(/bg-primary/);
    await switchToTestPersona(page, "執行長");
    await expect
      .poll(() => backendFieldValues(page, caseA), { timeout: 30_000 })
      .toMatchObject({ "f-server": "case-a-server" });
  });
});
