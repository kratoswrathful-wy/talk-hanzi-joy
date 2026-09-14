import { test, expect, type Page, type Route } from "@playwright/test";
import { loginAs } from "./helpers/login-as";
import { restFor, restMutate } from "./helpers/save-reliability-iso";

/**
 * 為什麼測：連改兩個數字時，第一筆還沒存完、清單又重載，畫面不該變回舊值；
 * 第一筆失敗也不該把後面已打的字清掉；別人先改同一欄時，不該用新版本把舊數字蓋回去。
 */
const ENABLED = process.env.PLAYWRIGHT_SAVE_RELIABILITY_UI === "1";
const describeQueue = ENABLED ? test.describe : test.describe.skip;

function credPm() {
  const email = process.env.PLAYWRIGHT_ISO_PM_EMAIL;
  const password = process.env.PLAYWRIGHT_ISO_PM_PASSWORD;
  expect(email, "缺少 PM email").toBeTruthy();
  expect(password, "缺少 PM password").toBeTruthy();
  return { email: email!, password: password! };
}

function credExec() {
  const email = process.env.PLAYWRIGHT_ISO_EXEC_EMAIL;
  const password = process.env.PLAYWRIGHT_ISO_EXEC_PASSWORD;
  expect(email, "缺少 executive email").toBeTruthy();
  expect(password, "缺少 executive password").toBeTruthy();
  return { email: email!, password: password! };
}

type Gate = { parked: Route[] };

async function parkApplyFee(page: Page, gate: Gate) {
  await page.route("**/rest/v1/rpc/apply_fee_update*", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    gate.parked.push(route);
  });
}

async function continueParked(gate: Gate) {
  const batch = gate.parked.splice(0, gate.parked.length);
  await Promise.all(batch.map((route) => route.continue()));
}

async function fulfillParked(gate: Gate, body: unknown, status = 200) {
  const batch = gate.parked.splice(0, gate.parked.length);
  await Promise.all(
    batch.map((route) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      }),
    ),
  );
}

async function insertFee(page: import("@playwright/test").Page, token: string, body: Record<string, unknown>) {
  const insert = await restMutate(page.request, token, "POST", "fees", body, { Prefer: "return=minimal" });
  expect(insert.ok, insert.text).toBe(true);
}

describeQueue("F-T07／08／09 費用排隊與重載", () => {
  test("連續改欄：畫面待送、寫入讀回、離頁與重載仍在", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const { token, rest } = await restFor(page);
    const stamp = Date.now();
    const feeId = crypto.randomUUID();
    const title = `ISO-FT07-FEE-${stamp}`;
    const nextPo = `PO-NEW-${stamp}`;
    await insertFee(page, token, {
      id: feeId,
      title,
      status: "draft",
      env: "test",
      assignee: "ISO-FT07-ASSIGNEE",
      client_info: {
        client: "ISO-FT07-CLIENT",
        clientPoNumber: "PO-OLD",
        clientTaskItems: [{ id: "ci-1", taskType: "翻譯", billingUnit: "字", unitCount: 100, clientPrice: 5 }],
        reconciled: false,
      },
      task_items: [{ id: "ti-1", taskType: "翻譯", billingUnit: "字", unitCount: 100, unitPrice: 3 }],
    });

    const gate: Gate = { parked: [] };
    await parkApplyFee(page, gate);
    await page.goto(`/fees/${feeId}`);
    await expect(page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("fee-client-po").fill(nextPo);
    await page.getByTestId("fee-client-price-0").fill("8.5");
    await page.getByTestId("fee-client-price-0").blur();
    await expect.poll(() => gate.parked.length, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId("fee-client-po")).toHaveValue(nextPo);
    await expect(page.getByTestId("fee-client-price-0")).toHaveValue("8.5");

    const stillOld = await rest.get<Array<{ client_info: { clientPoNumber?: string } }>>(
      `fees_visible?select=id,client_info&id=eq.${feeId}`,
    );
    expect(stillOld[0]?.client_info?.clientPoNumber).toBe("PO-OLD");

    await continueParked(gate);
    await page.unroute("**/rest/v1/rpc/apply_fee_update*");
    await expect.poll(async () => {
      const row = await rest.get<Array<{ client_info: { clientPoNumber?: string; clientTaskItems?: Array<{ clientPrice?: number }> } }>>(
        `fees_visible?select=id,client_info&id=eq.${feeId}`,
      );
      return `${row[0]?.client_info?.clientPoNumber}|${row[0]?.client_info?.clientTaskItems?.[0]?.clientPrice}`;
    }, { timeout: 20_000 }).toBe(`${nextPo}|8.5`);

    await page.goto("/fees");
    await page.goto(`/fees/${feeId}`);
    await expect(page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("fee-client-po")).toHaveValue(nextPo, { timeout: 30_000 });
    await expect(page.getByTestId("fee-client-price-0")).toHaveValue("8.5");

    await page.reload({ waitUntil: "load" });
    await expect(page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("fee-client-po")).toHaveValue(nextPo, { timeout: 30_000 });
    await expect(page.getByTestId("fee-client-price-0")).toHaveValue("8.5");
    const afterReload = await rest.get<Array<{ client_info: { clientPoNumber?: string } }>>(
      `fees_visible?select=id,client_info&id=eq.${feeId}`,
    );
    expect(afterReload[0]?.client_info?.clientPoNumber).toBe(nextPo);
    await session.close();
  });

  test("寫入尚未結束就離頁再回：畫面保留待送，伺服器仍是舊值", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const { token, rest } = await restFor(page);
    const stamp = Date.now();
    const feeId = crypto.randomUUID();
    const nextPo = `PO-HOLD-${stamp}`;
    await insertFee(page, token, {
      id: feeId,
      title: `ISO-FT07-HOLD-${stamp}`,
      status: "draft",
      env: "test",
      assignee: "ISO-FT07-HOLD",
      client_info: {
        client: "ISO-FT07-CLIENT",
        clientPoNumber: "PO-OLD",
        clientTaskItems: [{ id: "ci-1", taskType: "翻譯", billingUnit: "字", unitCount: 100, clientPrice: 5 }],
      },
      task_items: [{ id: "ti-1", taskType: "翻譯", billingUnit: "字", unitCount: 100, unitPrice: 3 }],
    });

    const gate: Gate = { parked: [] };
    await parkApplyFee(page, gate);
    await page.goto(`/fees/${feeId}`);
    await expect(page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("fee-client-po").fill(nextPo);
    await page.getByTestId("fee-client-price-0").fill("8.5");
    await page.getByTestId("fee-client-price-0").blur();
    await expect.poll(() => gate.parked.length, { timeout: 15_000 }).toBeGreaterThan(0);

    await page.goto("/fees");
    await page.goto(`/fees/${feeId}`);
    await expect(page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("fee-client-po")).toHaveValue(nextPo);
    await expect(page.getByTestId("fee-client-price-0")).toHaveValue("8.5");
    const row = await rest.get<Array<{ client_info: { clientPoNumber?: string } }>>(
      `fees_visible?select=id,client_info&id=eq.${feeId}`,
    );
    expect(row[0]?.client_info?.clientPoNumber).toBe("PO-OLD");
    await expect(page.getByTestId("fee-save-pending")).toBeVisible({ timeout: 15_000 });

    await continueParked(gate);
    await page.unroute("**/rest/v1/rpc/apply_fee_update*");
    await expect.poll(async () => {
      const saved = await rest.get<Array<{ client_info: { clientPoNumber?: string; clientTaskItems?: Array<{ clientPrice?: number }> } }>>(
        `fees_visible?select=id,client_info&id=eq.${feeId}`,
      );
      return `${saved[0]?.client_info?.clientPoNumber}|${saved[0]?.client_info?.clientTaskItems?.[0]?.clientPrice}`;
    }, { timeout: 20_000 }).toBe(`${nextPo}|8.5`);

    await page.goto("/fees");
    await page.goto(`/fees/${feeId}`);
    await expect(page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("fee-client-po")).toHaveValue(nextPo, { timeout: 30_000 });
    await expect(page.getByTestId("fee-client-price-0")).toHaveValue("8.5");
    await page.reload({ waitUntil: "load" });
    await expect(page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("fee-client-po")).toHaveValue(nextPo, { timeout: 30_000 });
    await expect(page.getByTestId("fee-client-price-0")).toHaveValue("8.5");
    await session.close();
  });

  test("第一筆明確失敗不得清掉後面已打的字，也不得當已儲存", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const { token, rest } = await restFor(page);
    const stamp = Date.now();
    const feeId = crypto.randomUUID();
    await insertFee(page, token, {
      id: feeId,
      title: `ISO-FT08-FEE-${stamp}`,
      status: "draft",
      env: "test",
      assignee: "ISO-FT08-ASSIGNEE",
      client_info: {
        client: "ISO-FT08-CLIENT",
        clientPoNumber: "PO-OLD",
        clientTaskItems: [{ id: "ci-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, clientPrice: 1 }],
      },
      task_items: [{ id: "ti-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, unitPrice: 1 }],
    });

    const gate: Gate = { parked: [] };
    await parkApplyFee(page, gate);
    await page.goto(`/fees/${feeId}`);
    await expect(page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("fee-client-po").fill(`PO-KEEP-${stamp}`);
    await page.getByTestId("fee-client-price-0").fill("9.25");
    await page.getByTestId("fee-client-price-0").blur();
    await expect.poll(() => gate.parked.length, { timeout: 15_000 }).toBeGreaterThan(0);

    await fulfillParked(gate, { ok: false, error: "iso_ft08_forced_fail" });
    await expect(page.getByTestId("fee-client-po")).toHaveValue(`PO-KEEP-${stamp}`);
    await expect(page.getByTestId("fee-client-price-0")).toHaveValue("9.25");
    await expect(page.getByText(/儲存失敗|已保留|未覆寫/).first()).toBeVisible({ timeout: 15_000 });

    const row = await rest.get<Array<{ client_info: { clientPoNumber?: string } }>>(
      `fees_visible?select=id,client_info&id=eq.${feeId}`,
    );
    expect(row[0]?.client_info?.clientPoNumber).toBe("PO-OLD");
    await session.close();
  });

  test("他人先改同一欄：不得用新版本把舊數字送回去", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const { token, rest } = await restFor(page);
    const stamp = Date.now();
    const feeId = crypto.randomUUID();
    await insertFee(page, token, {
      id: feeId,
      title: `ISO-FT09-FEE-${stamp}`,
      status: "draft",
      env: "test",
      assignee: "ISO-FT09-ASSIGNEE",
      client_info: {
        client: "ISO-FT09-CLIENT",
        clientPoNumber: "PO-BASE",
        clientTaskItems: [{ id: "ci-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, clientPrice: 1 }],
      },
      task_items: [{ id: "ti-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, unitPrice: 1 }],
    });

    const before = await rest.get<Array<{ updated_at: string }>>(
      `fees_visible?select=id,updated_at&id=eq.${feeId}`,
    );
    expect(before[0]?.updated_at).toBeTruthy();

    const gate: Gate = { parked: [] };
    await parkApplyFee(page, gate);
    await page.goto(`/fees/${feeId}`);
    await expect(page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("fee-client-po").fill(`PO-MINE-${stamp}`);
    await expect.poll(() => gate.parked.length, { timeout: 15_000 }).toBeGreaterThan(0);

    const other = await rest.rpc<{ ok?: boolean }>("apply_fee_update", {
      p_fee_id: feeId,
      p_expected_updated_at: before[0].updated_at,
      p_patch: { client_info: { clientPoNumber: `PO-OTHER-${stamp}` } },
    });
    expect(other.ok, other.text).toBe(true);
    expect(other.data?.ok).toBe(true);

    await continueParked(gate);
    await page.unroute("**/rest/v1/rpc/apply_fee_update*");
    await expect(page.getByText(/他人更新|已保留|儲存失敗/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("fee-client-po")).toHaveValue(`PO-MINE-${stamp}`);

    const row = await rest.get<Array<{ client_info: { clientPoNumber?: string } }>>(
      `fees_visible?select=id,client_info&id=eq.${feeId}`,
    );
    expect(row[0]?.client_info?.clientPoNumber).toBe(`PO-OTHER-${stamp}`);
    await session.close();
  });

  test("兩個管理員改不同欄：兩邊都寫入並讀回", async ({ browser }) => {
    const pmCred = credPm();
    const execCred = credExec();
    const pm = await loginAs(browser, pmCred.email, pmCred.password);
    const exec = await loginAs(browser, execCred.email, execCred.password);
    const { token, rest } = await restFor(pm.page);
    const stamp = Date.now();
    const feeId = crypto.randomUUID();
    const nextPo = `PO-PM-${stamp}`;
    await insertFee(pm.page, token, {
      id: feeId,
      title: `ISO-FT07-DUAL-${stamp}`,
      status: "draft",
      env: "test",
      assignee: "ISO-FT07-DUAL",
      client_info: {
        client: "ISO-FT07-CLIENT",
        clientPoNumber: "PO-OLD",
        clientTaskItems: [{ id: "ci-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, clientPrice: 1 }],
      },
      task_items: [{ id: "ti-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, unitPrice: 1 }],
    });

    await pm.page.goto(`/fees/${feeId}`);
    await exec.page.goto(`/fees/${feeId}`);
    await expect(pm.page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });
    await expect(exec.page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });

    await exec.page.getByTestId("fee-client-price-0").fill("9.5");
    await exec.page.getByTestId("fee-client-price-0").blur();
    await expect.poll(async () => {
      const row = await rest.get<Array<{ client_info: { clientTaskItems?: Array<{ clientPrice?: number }> } }>>(
        `fees_visible?select=id,client_info&id=eq.${feeId}`,
      );
      return row[0]?.client_info?.clientTaskItems?.[0]?.clientPrice;
    }, { timeout: 20_000 }).toBe(9.5);

    await pm.page.getByTestId("fee-client-po").fill(nextPo);
    await pm.page.getByTestId("fee-client-po").blur();
    await expect.poll(async () => {
      const row = await rest.get<Array<{ client_info: { clientPoNumber?: string; clientTaskItems?: Array<{ clientPrice?: number }> } }>>(
        `fees_visible?select=id,client_info&id=eq.${feeId}`,
      );
      return `${row[0]?.client_info?.clientPoNumber}|${row[0]?.client_info?.clientTaskItems?.[0]?.clientPrice}`;
    }, { timeout: 20_000 }).toBe(`${nextPo}|9.5`);

    await pm.page.reload({ waitUntil: "load" });
    await exec.page.reload({ waitUntil: "load" });
    await expect(pm.page.getByTestId("fee-client-po")).toHaveValue(nextPo, { timeout: 30_000 });
    await expect(exec.page.getByTestId("fee-client-price-0")).toHaveValue("9.5", { timeout: 30_000 });
    await pm.close();
    await exec.close();
  });

  test("重查後寫入前他人改不同欄：不得用新版本把舊單價整包蓋回去", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const { token, rest } = await restFor(page);
    const stamp = Date.now();
    const feeId = crypto.randomUUID();
    const nextPo = `PO-REQ-${stamp}`;
    await insertFee(page, token, {
      id: feeId,
      title: `ISO-FT07-REQ-${stamp}`,
      status: "draft",
      env: "test",
      assignee: "ISO-FT07-REQ",
      client_info: {
        client: "ISO-FT07-CLIENT",
        clientPoNumber: "PO-OLD",
        clientTaskItems: [{ id: "ci-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, clientPrice: 1 }],
      },
      task_items: [{ id: "ti-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, unitPrice: 1 }],
    });

    const before = await rest.get<Array<{ updated_at: string }>>(
      `fees_visible?select=id,updated_at&id=eq.${feeId}`,
    );
    expect(before[0]?.updated_at).toBeTruthy();

    const gate: Gate = { parked: [] };
    await parkApplyFee(page, gate);
    await page.goto(`/fees/${feeId}`);
    await expect(page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("fee-client-po").fill(nextPo);
    await page.getByTestId("fee-client-po").blur();
    await expect.poll(() => gate.parked.length, { timeout: 15_000 }).toBeGreaterThan(0);

    const other = await rest.rpc<{ ok?: boolean }>("apply_fee_update", {
      p_fee_id: feeId,
      p_expected_updated_at: before[0].updated_at,
      p_patch: { client_info: { clientTaskItems: [{ id: "ci-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, clientPrice: 9.5 }] } },
    });
    expect(other.ok, other.text).toBe(true);
    expect(other.data?.ok).toBe(true);

    await continueParked(gate);
    await page.unroute("**/rest/v1/rpc/apply_fee_update*");
    await expect.poll(async () => {
      const row = await rest.get<Array<{ client_info: { clientPoNumber?: string; clientTaskItems?: Array<{ clientPrice?: number }> } }>>(
        `fees_visible?select=id,client_info&id=eq.${feeId}`,
      );
      return `${row[0]?.client_info?.clientPoNumber}|${row[0]?.client_info?.clientTaskItems?.[0]?.clientPrice}`;
    }, { timeout: 20_000 }).toMatch(/9\.5$/);
    const after = await rest.get<Array<{ client_info: { clientPoNumber?: string; clientTaskItems?: Array<{ clientPrice?: number }> } }>>(
      `fees_visible?select=id,client_info&id=eq.${feeId}`,
    );
    expect(after[0]?.client_info?.clientTaskItems?.[0]?.clientPrice).toBe(9.5);
    expect(after[0]?.client_info?.clientPoNumber).not.toBe("PO-OLD");
    await session.close();
  });

  test("兩個管理員改同一欄：後端保留先寫入的，另一人畫面保留輸入", async ({ browser }) => {
    const pmCred = credPm();
    const execCred = credExec();
    const pm = await loginAs(browser, pmCred.email, pmCred.password);
    const exec = await loginAs(browser, execCred.email, execCred.password);
    const { token, rest } = await restFor(pm.page);
    const stamp = Date.now();
    const feeId = crypto.randomUUID();
    const execPo = `PO-EXEC-${stamp}`;
    const pmPo = `PO-PM-${stamp}`;
    await insertFee(pm.page, token, {
      id: feeId,
      title: `ISO-FT09-DUAL-${stamp}`,
      status: "draft",
      env: "test",
      assignee: "ISO-FT09-DUAL",
      client_info: {
        client: "ISO-FT09-CLIENT",
        clientPoNumber: "PO-BASE",
        clientTaskItems: [{ id: "ci-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, clientPrice: 1 }],
      },
      task_items: [{ id: "ti-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, unitPrice: 1 }],
    });

    await pm.page.goto(`/fees/${feeId}`);
    await exec.page.goto(`/fees/${feeId}`);
    await expect(pm.page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });
    await expect(exec.page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });

    await exec.page.getByTestId("fee-client-po").fill(execPo);
    await exec.page.getByTestId("fee-client-po").blur();
    await expect.poll(async () => {
      const row = await rest.get<Array<{ client_info: { clientPoNumber?: string } }>>(
        `fees_visible?select=id,client_info&id=eq.${feeId}`,
      );
      return row[0]?.client_info?.clientPoNumber;
    }, { timeout: 20_000 }).toBe(execPo);

    await pm.page.getByTestId("fee-client-po").fill(pmPo);
    await pm.page.getByTestId("fee-client-po").blur();
    await expect(pm.page.getByText(/他人更新|已保留|儲存失敗/).first()).toBeVisible({ timeout: 20_000 });
    await expect(pm.page.getByTestId("fee-client-po")).toHaveValue(pmPo);
    const row = await rest.get<Array<{ client_info: { clientPoNumber?: string } }>>(
      `fees_visible?select=id,client_info&id=eq.${feeId}`,
    );
    expect(row[0]?.client_info?.clientPoNumber).toBe(execPo);
    await pm.close();
    await exec.close();
  });
});
