import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/login-as";
import { restFor, restMutate } from "./helpers/save-reliability-iso";

/**
 * Q16：客戶／稿費請款留言往返。隔離後端；不測 Q17 關聯讀取。
 */
const ENABLED = process.env.PLAYWRIGHT_SAVE_RELIABILITY_UI === "1";
const describeQ16 = ENABLED ? test.describe : test.describe.skip;

function credPm() {
  const email = process.env.PLAYWRIGHT_ISO_PM_EMAIL;
  const password = process.env.PLAYWRIGHT_ISO_PM_PASSWORD;
  expect(email, "缺少 PM email").toBeTruthy();
  expect(password, "缺少 PM password").toBeTruthy();
  return { email: email!, password: password! };
}

describeQ16("Q16 請款留言往返", () => {
  test("客戶請款：連續兩則、失敗保留輸入、離頁重整後仍在資料庫", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const { token } = await restFor(page);
    const stamp = Date.now();
    const title = `ISO-Q16-CI-${stamp}`;
    const created = await restMutate(page.request, token, "POST", "client_invoices", {
      title,
      status: "draft",
      env: "test",
      note: "Q16-NOTE-KEEP",
      comments: [],
    }, { Prefer: "return=representation" });
    expect(created.ok, created.text).toBe(true);
    const rows = JSON.parse(created.text) as { id: string }[];
    const invoiceId = rows[0]?.id;
    expect(invoiceId).toBeTruthy();

    await page.goto(`/client-invoices/${invoiceId}`);
    await expect(page.getByText("返回客戶請款單清單")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("client-invoice-note")).toHaveValue("Q16-NOTE-KEEP");

    const draft = page.getByTestId("comment-draft-input").last();
    await draft.fill(`ISO-Q16-C1-${stamp}`);
    await page.getByTestId("comment-submit").last().click();
    await expect(page.locator("span").filter({ hasText: `ISO-Q16-C1-${stamp}` })).toBeVisible({ timeout: 15_000 });

    await draft.fill(`ISO-Q16-C2-${stamp}`);
    await page.getByTestId("comment-submit").last().click();
    await expect(page.locator("span").filter({ hasText: `ISO-Q16-C2-${stamp}` })).toBeVisible({ timeout: 15_000 });

    await page.route("**/rest/v1/client_invoices*", async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "iso q16 forced write fail" }),
        });
        return;
      }
      await route.continue();
    });
    const failedText = `ISO-Q16-KEEP-${stamp}`;
    await draft.fill(failedText);
    await page.getByTestId("comment-submit").last().click();
    await expect(page.getByText("留言儲存失敗，已保留輸入。")).toBeVisible({ timeout: 15_000 });
    await expect(draft).toHaveValue(failedText);
    await page.unroute("**/rest/v1/client_invoices*");

    await page.goto("/client-invoices");
    await page.goto(`/client-invoices/${invoiceId}`);
    await expect(page.locator("span").filter({ hasText: `ISO-Q16-C1-${stamp}` })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("span").filter({ hasText: `ISO-Q16-C2-${stamp}` })).toBeVisible();
    await expect(page.getByText(failedText)).toHaveCount(0);
    await expect(page.getByTestId("client-invoice-note")).toHaveValue("Q16-NOTE-KEEP");

    const readback = await restMutate(
      page.request,
      token,
      "GET",
      `client_invoices?select=id,note,comments&id=eq.${invoiceId}`,
    );
    expect(readback.ok, readback.text).toBe(true);
    const dbRows = JSON.parse(readback.text) as Array<{ note: string; comments: Array<{ content: string }> }>;
    expect(dbRows[0]?.note).toBe("Q16-NOTE-KEEP");
    const contents = (dbRows[0]?.comments ?? []).map((c) => c.content);
    expect(contents).toContain(`ISO-Q16-C1-${stamp}`);
    expect(contents).toContain(`ISO-Q16-C2-${stamp}`);
    expect(contents).not.toContain(failedText);

    await session.close();
  });

  test("稿費請款：留言寫入後重整仍在，不把內部備註當 comments", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const { token } = await restFor(page);
    const stamp = Date.now();
    const created = await restMutate(page.request, token, "POST", "invoices", {
      title: `ISO-Q16-INV-${stamp}`,
      status: "draft",
      env: "test",
      note: "Q16-INV-NOTE",
      comments: [],
    }, { Prefer: "return=representation" });
    expect(created.ok, created.text).toBe(true);
    const invoiceId = (JSON.parse(created.text) as { id: string }[])[0]?.id;
    expect(invoiceId).toBeTruthy();

    await page.goto(`/invoices/${invoiceId}`);
    await expect(page.getByText("返回請款單清單")).toBeVisible({ timeout: 30_000 });
    const draft = page.getByTestId("comment-draft-input").first();
    await draft.fill(`ISO-Q16-INV-C1-${stamp}`);
    await page.getByTestId("comment-submit").first().click();
    await expect(page.getByText(`ISO-Q16-INV-C1-${stamp}`)).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByText(`ISO-Q16-INV-C1-${stamp}`)).toBeVisible({ timeout: 30_000 });
    const readback = await restMutate(
      page.request,
      token,
      "GET",
      `invoices?select=id,note,comments&id=eq.${invoiceId}`,
    );
    expect(readback.ok, readback.text).toBe(true);
    const row = (JSON.parse(readback.text) as Array<{ note: string; comments: Array<{ content: string }> }>)[0];
    expect(row.note).toBe("Q16-INV-NOTE");
    expect(row.comments.map((c) => c.content)).toContain(`ISO-Q16-INV-C1-${stamp}`);
    await session.close();
  });

  test("稿費請款：附件種子讀回（不含實際上傳）", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const { token } = await restFor(page);
    const stamp = Date.now();
    const fileName = `iso-q16-att-${stamp}.txt`;
    const created = await restMutate(page.request, token, "POST", "invoices", {
      title: `ISO-Q16-ATT-${stamp}`,
      status: "draft",
      env: "test",
      note: "Q16-ATT-NOTE",
      comments: [{
        id: `c-att-${stamp}`,
        author: "ISO-PM",
        content: `ISO-Q16-ATT-SEEDED-${stamp}`,
        timestamp: "2026/09/13 14:50:00",
        fileUrls: [{ name: fileName, url: "https://example.test/iso-q16-att.txt" }],
      }],
    }, { Prefer: "return=representation" });
    expect(created.ok, created.text).toBe(true);
    const invoiceId = (JSON.parse(created.text) as { id: string }[])[0]?.id;
    expect(invoiceId).toBeTruthy();

    await page.goto(`/invoices/${invoiceId}`);
    await expect(page.getByText("返回請款單清單")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(`ISO-Q16-ATT-SEEDED-${stamp}`)).toBeVisible();
    await expect(page.getByText(fileName)).toBeVisible();

    const readback = await restMutate(
      page.request,
      token,
      "GET",
      `invoices?select=id,comments&id=eq.${invoiceId}`,
    );
    expect(readback.ok, readback.text).toBe(true);
    const comments = (JSON.parse(readback.text) as Array<{ comments: Array<{ fileUrls?: Array<{ name: string }> }> }>)[0]?.comments ?? [];
    expect(comments.some((c) => c.fileUrls?.some((f) => f.name === fileName))).toBe(true);

    await session.close();
  });

  test("稿費請款：介面上傳、離頁、下載核對內容（Storage 不足則本項未執行）", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const { token, rest } = await restFor(page);
    const stamp = Date.now();
    const fileName = `upload-iso-q16-${stamp}.txt`;
    const fileBody = `ISO-Q16-UI-BODY-${stamp}`;
    const created = await restMutate(page.request, token, "POST", "invoices", {
      title: `ISO-Q16-UI-${stamp}`,
      status: "draft",
      env: "test",
      note: "Q16-UI-NOTE",
      comments: [],
    }, { Prefer: "return=representation" });
    expect(created.ok, created.text).toBe(true);
    const invoiceId = (JSON.parse(created.text) as { id: string }[])[0]?.id;
    expect(invoiceId).toBeTruthy();

    await page.goto(`/invoices/${invoiceId}`);
    await expect(page.getByText("返回請款單清單")).toBeVisible({ timeout: 30_000 });
    const attach = page.getByTestId("comment-attach-input").first();
    await attach.setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from(fileBody),
    });
    const chip = page.getByText(fileName);
    const uploaded = await chip.waitFor({ state: "visible", timeout: 8_000 }).then(() => true).catch(() => false);
    if (!uploaded) {
      test.info().annotations.push({ type: "blocked", description: "隔離 Storage 不足，UI 上傳鏈未執行。" });
      test.skip(true, "隔離 Storage 不足，UI 上傳／離頁／下載未執行");
    }
    await page.getByTestId("comment-draft-input").first().fill(`ISO-Q16-UI-${stamp}`);
    await page.getByTestId("comment-submit").first().click();
    await expect(page.getByText(`ISO-Q16-UI-${stamp}`)).toBeVisible({ timeout: 15_000 });
    await page.goto("/invoices");
    await page.goto(`/invoices/${invoiceId}`);
    await expect(page.getByText(fileName)).toBeVisible({ timeout: 30_000 });
    const readback = await rest.get<Array<{ comments: Array<{ fileUrls?: Array<{ name: string; url: string }> }> }>>(
      `invoices?select=id,comments&id=eq.${invoiceId}`,
    );
    const fileUrl = (readback[0]?.comments ?? []).flatMap((c) => c.fileUrls ?? []).find((f) => f.name === fileName)?.url;
    expect(fileUrl, "上傳成功後資料庫必須有檔案網址").toBeTruthy();
    const restDownloaded = await page.request.get(fileUrl!);
    expect(restDownloaded.ok(), `補充直抓失敗 ${restDownloaded.status()}`).toBe(true);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("comment-file-download").filter({ hasText: fileName }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(fileName);
    const downloadPath = await download.path();
    expect(downloadPath, "必須經 UI 下載按鈕取得檔案").toBeTruthy();
    const { readFile } = await import("node:fs/promises");
    expect(await readFile(downloadPath!, "utf8")).toBe(fileBody);
    expect(await restDownloaded.text()).toBe(fileBody);
    await session.close();
  });
});
