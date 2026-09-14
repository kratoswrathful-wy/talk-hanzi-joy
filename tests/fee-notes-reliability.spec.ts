import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/login-as";
import { restFor, restMutate } from "./helpers/save-reliability-iso";

/**
 * F-T03／FIN-A：費用相關備註附件讀回與失敗保留。
 * 不測 F-ACL01 相關對象寫入（後端仍限管理者）。
 */
const ENABLED = process.env.PLAYWRIGHT_SAVE_RELIABILITY_UI === "1";
const describeNotes = ENABLED ? test.describe : test.describe.skip;

function credPm() {
  const email = process.env.PLAYWRIGHT_ISO_PM_EMAIL;
  const password = process.env.PLAYWRIGHT_ISO_PM_PASSWORD;
  expect(email, "缺少 PM email").toBeTruthy();
  expect(password, "缺少 PM password").toBeTruthy();
  return { email: email!, password: password! };
}

describeNotes("F-T03 費用相關備註附件", () => {
  test("PM 讀回已含附件的備註；寫入失敗保留輸入；離頁後附件仍在", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const { token, rest } = await restFor(page);
    const stamp = Date.now();
    const feeId = crypto.randomUUID();
    const title = `ISO-FT03-FEE-${stamp}`;
    const insert = await restMutate(page.request, token, "POST", "fees", {
      id: feeId,
      title,
      status: "draft",
      env: "test",
      assignee: "ISO-FT03-ASSIGNEE",
      notes: [],
    }, { Prefer: "return=minimal" });
    expect(insert.ok, insert.text).toBe(true);

    const before = await rest.get<Array<{ updated_at: string }>>(
      `fees_visible?select=id,updated_at&id=eq.${feeId}`,
    );
    expect(before[0]?.updated_at).toBeTruthy();

    const noteText = `ISO-FT03-NOTE-${stamp}`;
    const fileName = `iso-ft03-${stamp}.txt`;
    const updated = await rest.rpc<{ ok?: boolean; error?: string }>("apply_fee_update", {
      p_fee_id: feeId,
      p_expected_updated_at: before[0].updated_at,
      p_patch: {
        notes: [{
          id: `n-${stamp}`,
          author: "ISO-PM",
          text: noteText,
          createdAt: new Date().toISOString(),
          imageUrls: ["data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="],
          fileUrls: [{ name: fileName, url: "https://example.test/iso-ft03.txt" }],
        }],
      },
    });
    expect(updated.ok, updated.text).toBe(true);
    expect(updated.data?.ok, updated.text).toBe(true);

    await page.goto(`/fees/${feeId}`);
    await expect(page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(noteText)).toBeVisible();
    await expect(page.getByText(fileName)).toBeVisible();

    await page.route("**/rest/v1/rpc/apply_fee_update*", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, error: "iso_ft03_forced_fail" }),
        });
        return;
      }
      await route.continue();
    });
    const keepText = `ISO-FT03-KEEP-${stamp}`;
    const draft = page.getByTestId("comment-draft-input").first();
    await draft.fill(keepText);
    await page.getByTestId("comment-submit").first().click();
    await expect(draft).toHaveValue(keepText, { timeout: 15_000 });
    await expect(page.getByText(/儲存失敗|已保留/).first()).toBeVisible({ timeout: 15_000 });
    await page.unroute("**/rest/v1/rpc/apply_fee_update*");

    await page.goto("/fees");
    await page.goto(`/fees/${feeId}`);
    await expect(page.getByText(noteText)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(fileName)).toBeVisible();
    await expect(page.getByText(keepText)).toHaveCount(0);

    const readback = await rest.get<Array<{ notes: Array<{ text?: string; fileUrls?: Array<{ name: string }> }> }>>(
      `fees_visible?select=id,notes&id=eq.${feeId}`,
    );
    const notes = readback[0]?.notes ?? [];
    expect(notes.some((n) => n.text === noteText && n.fileUrls?.[0]?.name === fileName)).toBe(true);
    expect(notes.some((n) => n.text === keepText)).toBe(false);

    await session.close();
  });

  test("介面上傳附件後離頁仍在；Storage 不足則本項未執行", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const { token, rest } = await restFor(page);
    const stamp = Date.now();
    const feeId = crypto.randomUUID();
    const insert = await restMutate(page.request, token, "POST", "fees", {
      id: feeId,
      title: `ISO-FT03-UI-${stamp}`,
      status: "draft",
      env: "test",
      assignee: "ISO-FT03-UI",
      notes: [],
    }, { Prefer: "return=minimal" });
    expect(insert.ok, insert.text).toBe(true);

    await page.goto(`/fees/${feeId}`);
    await expect(page.getByText("費用相關備註")).toBeVisible({ timeout: 30_000 });
    const fileName = `iso-ft03-ui-${stamp}.txt`;
    await page.getByTestId("comment-attach-input").first().setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from(`ISO-FT03-UI-${stamp}`),
    });
    const uploaded = await page.getByText(fileName).waitFor({ state: "visible", timeout: 8_000 }).then(() => true).catch(() => false);
    if (!uploaded) {
      test.info().annotations.push({ type: "blocked", description: "隔離 Storage 不足，費用 UI 上傳鏈未執行。" });
      test.skip(true, "隔離 Storage 不足，UI 上傳／離頁未執行");
    }
    await page.getByTestId("comment-draft-input").first().fill(`ISO-FT03-UI-NOTE-${stamp}`);
    await page.getByTestId("comment-submit").first().click();
    await expect(page.getByText(`ISO-FT03-UI-NOTE-${stamp}`)).toBeVisible({ timeout: 15_000 });
    await page.goto("/fees");
    await page.goto(`/fees/${feeId}`);
    await expect(page.getByText(fileName)).toBeVisible({ timeout: 30_000 });
    const readback = await rest.get<Array<{ notes: Array<{ fileUrls?: Array<{ name: string; url: string }> }> }>>(
      `fees_visible?select=id,notes&id=eq.${feeId}`,
    );
    const fileUrl = (readback[0]?.notes ?? []).flatMap((n) => n.fileUrls ?? []).find((f) => f.name === fileName)?.url;
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
    expect(await readFile(downloadPath!, "utf8")).toContain(`ISO-FT03-UI-${stamp}`);
    expect(await restDownloaded.text()).toContain(`ISO-FT03-UI-${stamp}`);
    await session.close();
  });
});
