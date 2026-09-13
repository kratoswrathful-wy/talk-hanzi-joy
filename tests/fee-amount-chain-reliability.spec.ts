import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/login-as";
import { restFor, restMutate } from "./helpers/save-reliability-iso";

/**
 * F-T01／F-T02／FIN-D：兩條不同合成鏈。
 * 以真登入 PM 操作介面；讀回 fees_visible 與關聯表。不寫正式庫。
 */
const ENABLED = process.env.PLAYWRIGHT_SAVE_RELIABILITY_UI === "1";
const describeAmt = ENABLED ? test.describe : test.describe.skip;

function credPm() {
  const email = process.env.PLAYWRIGHT_ISO_PM_EMAIL;
  const password = process.env.PLAYWRIGHT_ISO_PM_PASSWORD;
  expect(email, "缺少 PM email").toBeTruthy();
  expect(password, "缺少 PM password").toBeTruthy();
  return { email: email!, password: password! };
}

async function insertFee(
  page: import("@playwright/test").Page,
  token: string,
  body: Record<string, unknown>,
) {
  const insert = await restMutate(page.request, token, "POST", "fees", body, { Prefer: "return=minimal" });
  expect(insert.ok, insert.text).toBe(true);
}

describeAmt("F-T01／F-T02 金額鏈", () => {
  test("營收→對帳→入客戶請款：連續改多欄後離頁讀回金額與關聯", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const { token, rest } = await restFor(page);
    const stamp = Date.now();
    const feeId = crypto.randomUUID();
    const title = `ISO-FT01-FEE-${stamp}`;
    await insertFee(page, token, {
      id: feeId,
      title,
      status: "draft",
      env: "test",
      assignee: "ISO-FT01-ASSIGNEE",
      client_info: {
        client: "ISO-FT01-CLIENT",
        clientPoNumber: "PO-OLD",
        clientTaskItems: [{ id: "ci-1", taskType: "翻譯", billingUnit: "字", unitCount: 100, clientPrice: 5 }],
        reconciled: false,
        rateConfirmed: false,
      },
      task_items: [{ id: "ti-1", taskType: "翻譯", billingUnit: "字", unitCount: 100, unitPrice: 3 }],
    });

    await page.goto(`/fees/${feeId}`);
    await expect(page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });

    const po = page.getByTestId("fee-client-po");
    await expect(po).toBeVisible();
    await po.fill(`PO-NEW-${stamp}`);
    const price = page.getByTestId("fee-client-price-0");
    await price.fill("7.5");
    await price.blur();
    await page.locator("#reconciled").click();
    await expect(page.locator("#reconciled")).toBeChecked();

    await expect(page.getByRole("button", { name: "收錄至客戶請款單" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "收錄至客戶請款單" }).click();
    await page.getByRole("menuitem", { name: "新建請款單" }).click();
    await expect(page.getByText("已收錄至客戶請款單")).toBeVisible({ timeout: 20_000 });

    await page.goto("/fees");
    await page.goto(`/fees/${feeId}`);
    await expect(page.getByTestId("fee-client-po")).toHaveValue(`PO-NEW-${stamp}`, { timeout: 30_000 });
    await expect(page.getByTestId("fee-client-price-0")).toHaveValue("7.5");
    await expect(page.locator("#reconciled")).toBeChecked();

    const feeRow = await rest.get<Array<{
      client_info: {
        clientPoNumber?: string;
        reconciled?: boolean;
        clientTaskItems?: Array<{ clientPrice?: number }>;
      };
    }>>(`fees_visible?select=id,client_info&id=eq.${feeId}`);
    expect(feeRow[0]?.client_info?.clientPoNumber).toBe(`PO-NEW-${stamp}`);
    expect(feeRow[0]?.client_info?.reconciled).toBe(true);
    expect(feeRow[0]?.client_info?.clientTaskItems?.[0]?.clientPrice).toBe(7.5);

    const links = await rest.get<Array<{ client_invoice_id: string }>>(
      `client_invoice_fees?select=client_invoice_id,fee_id&fee_id=eq.${feeId}`,
    );
    expect(links.length, "客戶請款關聯應存在").toBeGreaterThan(0);
    const invoiceId = links[0].client_invoice_id;
    await page.goto(`/client-invoices/${invoiceId}`);
    await expect(page.getByText(title)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("TWD 750").first()).toBeVisible();

    await session.close();
  });

  test("稿費→費率無誤→開立→入稿費請款：離頁讀回金額、狀態與關聯", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const { token, rest } = await restFor(page);
    const stamp = Date.now();
    const feeId = crypto.randomUUID();
    const title = `ISO-FT02-FEE-${stamp}`;
    await insertFee(page, token, {
      id: feeId,
      title,
      status: "draft",
      env: "test",
      assignee: "ISO-FT02-ASSIGNEE",
      client_info: {
        client: "ISO-FT02-CLIENT",
        rateConfirmed: false,
        reconciled: false,
      },
      task_items: [{ id: "ti-1", taskType: "翻譯", billingUnit: "字", unitCount: 80, unitPrice: 2 }],
    });

    await page.goto(`/fees/${feeId}`);
    await expect(page.getByText("稿費內容")).toBeVisible({ timeout: 30_000 });
    const unit = page.getByTestId("fee-task-unit-price-0");
    await expect(unit).toBeVisible();
    await unit.fill("4.25");
    await unit.blur();
    await page.locator("#rateConfirmed").click();
    await expect(page.locator("#rateConfirmed")).toBeChecked();

    const finalizePrompt = page.getByText("是否直接向譯者開立稿費條");
    if (await finalizePrompt.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "開立稿費條" }).last().click();
    } else {
      await page.getByRole("button", { name: "開立稿費條" }).first().click();
    }
    await expect(page.getByRole("button", { name: "收錄至稿費請款單" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "收錄至稿費請款單" }).click();
    await page.getByRole("menuitem", { name: "新建請款單" }).click();
    await expect(page.getByText("已收錄至稿費請款單")).toBeVisible({ timeout: 20_000 });

    await page.goto("/fees");
    await page.goto(`/fees/${feeId}`);
    await expect(page.getByTestId("fee-task-unit-price-0")).toHaveValue("4.25", { timeout: 30_000 });
    await expect(page.locator("#rateConfirmed")).toBeChecked();

    const feeRow = await rest.get<Array<{
      status: string;
      client_info: { rateConfirmed?: boolean };
      task_items: Array<{ unitPrice?: number }>;
    }>>(`fees_visible?select=id,status,client_info,task_items&id=eq.${feeId}`);
    expect(feeRow[0]?.status).toBe("finalized");
    expect(feeRow[0]?.client_info?.rateConfirmed).toBe(true);
    expect(feeRow[0]?.task_items?.[0]?.unitPrice).toBe(4.25);

    const links = await rest.get<Array<{ invoice_id: string }>>(
      `invoice_fees?select=invoice_id,fee_id&fee_id=eq.${feeId}`,
    );
    expect(links.length, "稿費請款關聯應存在").toBeGreaterThan(0);
    await page.goto(`/invoices/${links[0].invoice_id}`);
    await expect(page.getByText(title)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("TWD 340").first()).toBeVisible();

    await session.close();
  });
});
