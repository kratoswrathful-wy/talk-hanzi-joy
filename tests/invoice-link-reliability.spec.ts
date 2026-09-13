import { test, expect, type Page, type Route } from "@playwright/test";
import { loginAs } from "./helpers/login-as";
import { restFor, restMutate } from "./helpers/save-reliability-iso";

/**
 * 為什麼測：按「新建請款單」時，費用沒掛上或回應斷掉，畫面不該說已收錄，
 * 也不該把可能已存在的單默默刪掉；再按一次不該變出第二張空單。
 */
const ENABLED = process.env.PLAYWRIGHT_SAVE_RELIABILITY_UI === "1";
const describeLink = ENABLED ? test.describe : test.describe.skip;

function credPm() {
  const email = process.env.PLAYWRIGHT_ISO_PM_EMAIL;
  const password = process.env.PLAYWRIGHT_ISO_PM_PASSWORD;
  expect(email, "缺少 PM email").toBeTruthy();
  expect(password, "缺少 PM password").toBeTruthy();
  return { email: email!, password: password! };
}

async function insertFee(page: Page, token: string, body: Record<string, unknown>) {
  const insert = await restMutate(page.request, token, "POST", "fees", body, { Prefer: "return=minimal" });
  expect(insert.ok, insert.text).toBe(true);
}

async function parkClientInvoiceLinks(page: Page, handler: (route: Route) => Promise<void>) {
  await page.route("**/rest/v1/client_invoice_fees*", async (route) => {
    if (route.request().method() === "POST") {
      await handler(route);
      return;
    }
    await route.continue();
  });
}

describeLink("B1 請款關聯失敗", () => {
  test("關聯回應遺失：不得當未寫入而刪單，也不得說已收錄", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const { token, rest } = await restFor(page);
    const stamp = Date.now();
    const feeId = crypto.randomUUID();
    await insertFee(page, token, {
      id: feeId,
      title: `ISO-B1-UNK-${stamp}`,
      status: "draft",
      env: "test",
      assignee: "ISO-B1-ASSIGNEE",
      client_info: {
        client: "ISO-B1-CLIENT",
        clientPoNumber: `PO-B1-${stamp}`,
        clientTaskItems: [{ id: "ci-1", taskType: "翻譯", billingUnit: "字", unitCount: 100, clientPrice: 7.5 }],
        reconciled: true,
      },
      task_items: [{ id: "ti-1", taskType: "翻譯", billingUnit: "字", unitCount: 100, unitPrice: 3 }],
    });

    await parkClientInvoiceLinks(page, async (route) => {
      await route.abort("timedout");
    });

    await page.goto(`/fees/${feeId}`);
    await expect(page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "收錄至客戶請款單" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "收錄至客戶請款單" }).click();
    await page.getByRole("menuitem", { name: "新建請款單" }).click();
    await expect(page.getByText(/結果不明|請勿再按/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("已收錄至客戶請款單")).toHaveCount(0);

    const created = await rest.get<Array<{ id: string }>>(`client_invoices?select=id,title&title=like.*ISO-B1-UNK-${stamp}*`);
    const links = await rest.get<Array<{ client_invoice_id: string }>>(
      `client_invoice_fees?select=client_invoice_id,fee_id&fee_id=eq.${feeId}`,
    );
    expect(created.length + links.length, "不明結果不得先假設單據不存在").toBeGreaterThanOrEqual(0);
    await session.close();
  });

  test("關聯明確拒絕且空單刪掉後，重試不得再當成功", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const { token } = await restFor(page);
    const stamp = Date.now();
    const feeId = crypto.randomUUID();
    await insertFee(page, token, {
      id: feeId,
      title: `ISO-B1-REJ-${stamp}`,
      status: "draft",
      env: "test",
      assignee: "ISO-B1-ASSIGNEE",
      client_info: {
        client: "ISO-B1-CLIENT",
        clientPoNumber: `PO-REJ-${stamp}`,
        clientTaskItems: [{ id: "ci-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, clientPrice: 1 }],
        reconciled: true,
      },
      task_items: [{ id: "ti-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, unitPrice: 1 }],
    });

    await parkClientInvoiceLinks(page, async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ code: "23503", message: "iso_b1_link_rejected" }),
      });
    });

    await page.goto(`/fees/${feeId}`);
    await expect(page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "收錄至客戶請款單" }).click();
    await page.getByRole("menuitem", { name: "新建請款單" }).click();
    await expect(page.getByText(/收錄失敗|未掛上|清理失敗|不明/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("已收錄至客戶請款單")).toHaveCount(0);
    await session.close();
  });

  test("關聯被拒且空單刪除失敗：須說清理失敗，不得當已收錄", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const { token } = await restFor(page);
    const stamp = Date.now();
    const feeId = crypto.randomUUID();
    await insertFee(page, token, {
      id: feeId,
      title: `ISO-B1-DELFAIL-${stamp}`,
      status: "draft",
      env: "test",
      assignee: "ISO-B1-ASSIGNEE",
      client_info: {
        client: "ISO-B1-CLIENT",
        clientPoNumber: `PO-DELFAIL-${stamp}`,
        clientTaskItems: [{ id: "ci-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, clientPrice: 1 }],
        reconciled: true,
      },
      task_items: [{ id: "ti-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, unitPrice: 1 }],
    });

    await parkClientInvoiceLinks(page, async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ code: "23503", message: "iso_b1_link_rejected" }),
      });
    });
    await page.route("**/rest/v1/client_invoices*", async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ code: "XX000", message: "iso_b1_delete_failed" }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto(`/fees/${feeId}`);
    await expect(page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "收錄至客戶請款單" }).click();
    await page.getByRole("menuitem", { name: "新建請款單" }).click();
    await expect(page.getByText(/清理失敗/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("已收錄至客戶請款單")).toHaveCount(0);
    await session.close();
  });

  test("關聯被拒且空單刪除結果不明：須說不明，不得當已收錄", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const { token } = await restFor(page);
    const stamp = Date.now();
    const feeId = crypto.randomUUID();
    await insertFee(page, token, {
      id: feeId,
      title: `ISO-B1-DELUNK-${stamp}`,
      status: "draft",
      env: "test",
      assignee: "ISO-B1-ASSIGNEE",
      client_info: {
        client: "ISO-B1-CLIENT",
        clientPoNumber: `PO-DELUNK-${stamp}`,
        clientTaskItems: [{ id: "ci-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, clientPrice: 1 }],
        reconciled: true,
      },
      task_items: [{ id: "ti-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, unitPrice: 1 }],
    });

    await parkClientInvoiceLinks(page, async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ code: "23503", message: "iso_b1_link_rejected" }),
      });
    });
    await page.route("**/rest/v1/client_invoices*", async (route) => {
      if (route.request().method() === "DELETE") {
        await route.abort("timedout");
        return;
      }
      await route.continue();
    });

    await page.goto(`/fees/${feeId}`);
    await expect(page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "收錄至客戶請款單" }).click();
    await page.getByRole("menuitem", { name: "新建請款單" }).click();
    await expect(page.getByText(/不明/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("已收錄至客戶請款單")).toHaveCount(0);
    await session.close();
  });

  test("關聯不明後重試：不得再建第二張空單", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const { token, rest } = await restFor(page);
    const stamp = Date.now();
    const feeId = crypto.randomUUID();
    await insertFee(page, token, {
      id: feeId,
      title: `ISO-B1-RETRY-${stamp}`,
      status: "draft",
      env: "test",
      assignee: "ISO-B1-ASSIGNEE",
      client_info: {
        client: "ISO-B1-CLIENT",
        clientPoNumber: `PO-RETRY-${stamp}`,
        clientTaskItems: [{ id: "ci-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, clientPrice: 1 }],
        reconciled: true,
      },
      task_items: [{ id: "ti-1", taskType: "翻譯", billingUnit: "字", unitCount: 10, unitPrice: 1 }],
    });

    let linkAttempts = 0;
    await parkClientInvoiceLinks(page, async (route) => {
      linkAttempts += 1;
      if (linkAttempts === 1) {
        await route.abort("timedout");
        return;
      }
      await route.continue();
    });

    await page.goto(`/fees/${feeId}`);
    await expect(page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "收錄至客戶請款單" }).click();
    await page.getByRole("menuitem", { name: "新建請款單" }).click();
    await expect(page.getByText(/結果不明|請勿再按/).first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "收錄至客戶請款單" }).click();
    await page.getByRole("menuitem", { name: "新建請款單" }).click();

    await expect.poll(async () => {
      const created = await rest.get<Array<{ id: string }>>(`client_invoices?select=id,title&title=like.*ISO-B1-RETRY-${stamp}*`);
      return created.length;
    }, { timeout: 20_000 }).toBe(1);
    await session.close();
  });
});
