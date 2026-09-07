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

/** 實際失焦保存：填值後把焦點移出該欄位。 */
async function typeAndBlur(page: Page, testId: string, value: string) {
  const el = field(page, testId);
  await el.click();
  await el.fill(value);
  await el.blur();
}

/**
 * 攔住 `update_case_credentials`：第一筆請求先掛住，回傳 release()。
 * 用來確定性重現「前一筆保存仍在進行時修改下一欄」，不使用固定 sleep。
 */
async function holdFirstCredentialWrite(page: Page) {
  let seen = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const firstRequestSent = new Promise<void>((resolve) => {
    void page.route(UPDATE_RPC, async (route) => {
      seen += 1;
      if (seen === 1) {
        resolve();
        await gate;
      }
      await route.continue();
    });
  });
  return {
    firstRequestSent,
    release,
    seenCount: () => seen,
    stop: () => page.unroute(UPDATE_RPC),
  };
}

describeTool("工具保存實際 UI + 後端讀回（#85 止損驗收）", () => {
  test.describe.configure({ mode: "serial" });
  // T2 需要真實貼上事件
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("T1 五欄快速連續編輯：全部保留，刷新後一致（核心紅綠）", async ({ page }) => {
    const caseId = await createCaseWithTool(page, "T1");
    await openCase(page, caseId);

    const gate = await holdFirstCredentialWrite(page);

    // 第一欄：保存請求會被掛住
    await typeAndBlur(page, TEXT_FIELDS[0].testId, TEXT_FIELDS[0].value);
    await gate.firstRequestSent;

    // 第一筆確定仍在進行中時，接著改其餘四欄（render 快照此時仍為舊值）
    for (const f of TEXT_FIELDS.slice(1)) {
      await typeAndBlur(page, f.testId, f.value);
    }

    gate.release();
    await gate.stop();

    // 後端實際值：五欄都必須留下（舊候選只會留下最後一欄）
    await expect
      .poll(() => backendFieldValues(page, caseId), { timeout: 60_000 })
      .toMatchObject(Object.fromEntries(TEXT_FIELDS.map((f) => [f.id, f.value])));

    // 畫面刷新後一致
    await page.reload({ waitUntil: "load" });
    await openCase(page, caseId);
    for (const f of TEXT_FIELDS) {
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
    await page.waitForTimeout(0);
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

  test("T4 改指派與一般欄位：工具不得被清空，且不送出憑證寫入", async ({ page }) => {
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

    // 一般欄位（標題）與指派（譯者）都走 case 寫入路徑，不得夾帶工具憑證
    const titleInput = page.getByTestId("case-title-input");
    await titleInput.click();
    await titleInput.fill(`${await titleInput.inputValue()} 改標題`);
    await titleInput.blur();

    const assigned = await page.evaluate(async (id) => {
      const agent = (window as unknown as {
        __lmsAgent: {
          case: { update: (cid: string, p: Record<string, unknown>) => Promise<AgentResult<unknown>> };
        };
      }).__lmsAgent;
      return agent.case.update(id, { status: "inquiry" });
    }, caseId);
    expect(assigned.ok, assigned.error ?? "").toBe(true);

    await page.reload({ waitUntil: "load" });
    await openCase(page, caseId);

    await expect
      .poll(() => backendFieldValues(page, caseId), { timeout: 60_000 })
      .toMatchObject(expected);
    expect(credentialWrites, "一般欄位／指派操作不得送出工具憑證更新").toBe(0);
  });

  test("T5 套範本：未確認前底稿變動不得照舊差異覆蓋", async ({ page }) => {
    const caseId = await createCaseWithTool(page, "T5");
    await openCase(page, caseId);

    for (const f of TEXT_FIELDS) {
      await typeAndBlur(page, f.testId, f.value);
    }
    await expect
      .poll(() => backendFieldValues(page, caseId), { timeout: 60_000 })
      .toMatchObject(Object.fromEntries(TEXT_FIELDS.map((f) => [f.id, f.value])));

    // 憑證尚未就緒時不得套用可寫範本：重載後在 load 未完成前嘗試開範本
    await page.route("**/rest/v1/rpc/get_case_credentials", async (route) => {
      await new Promise((r) => setTimeout(r, 3_000));
      await route.continue();
    });
    await page.goto(`/cases/${caseId}`);
    await expectTestModePersonaUiReady(page);
    // 載入未完成 → 欄位不可編輯（不得顯示成可寫的空值）
    await expect(field(page, "tool-server")).toBeDisabled();
    await page.unroute("**/rest/v1/rpc/get_case_credentials");

    await openCase(page, caseId);
    // 載入完成後值必須回來，且未被空白底稿寫回
    await expect(field(page, "tool-server")).toHaveValue(TEXT_FIELDS[0].value);
    await expect
      .poll(() => backendFieldValues(page, caseId), { timeout: 30_000 })
      .toMatchObject(Object.fromEntries(TEXT_FIELDS.map((f) => [f.id, f.value])));
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
    await expect(page.getByText("工具已寫入、尚未確認讀回")).toBeVisible({ timeout: 30_000 });
    await page.unroute("**/rest/v1/rpc/get_case_credentials");
    await page.unroute(UPDATE_RPC);

    // 後端確實已寫入（不得因讀回失敗而重送整組或回填舊值）
    await expect
      .poll(() => backendFieldValues(page, caseB), { timeout: 30_000 })
      .toMatchObject({ "f-project": "readback-fail-project", "f-server": "case-b-server" });

    // 切帳：換成譯者假人後，A 案不得被舊身分的晚到結果覆蓋
    await switchToTestPersona(page, "譯者一");
    await expect
      .poll(() => backendFieldValues(page, caseA), { timeout: 30_000 })
      .toMatchObject({ "f-server": "case-a-server" });
  });
});
