import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login-as";
import { isCasesVisibleFullListSelect } from "../src/lib/case-list-columns";
import { accessToken, restClient, readCaseState } from "./helpers/isolated-api";

/**
 * 案件清單載入：縮欄、失敗不得偽裝成空清單。
 * 只在隔離 Supabase：PLAYWRIGHT_BACKEND_ERRORS_UI=1
 */
const ENABLED = process.env.PLAYWRIGHT_BACKEND_ERRORS_UI === "1";
const describeBackend = ENABLED ? test.describe : test.describe.skip;

function credPm(): { email: string; password: string } {
  const email = process.env.PLAYWRIGHT_ISO_PM_EMAIL;
  const password = process.env.PLAYWRIGHT_ISO_PM_PASSWORD;
  expect(email, "缺少 PM email").toBeTruthy();
  expect(password, "缺少 PM password").toBeTruthy();
  return { email: email!, password: password! };
}

function isCasesVisibleFullListUrl(url: string): boolean {
  if (!url.includes("/rest/v1/cases_visible")) return false;
  if (url.includes("select=updated_at")) return false;
  if (/[?&]id=eq\./.test(url)) return false;
  return true;
}

async function captureCasesListGets(page: Page) {
  const events: Array<{
    status: number;
    select: string | null;
    startedAt: number;
    endedAt: number;
    ms: number;
  }> = [];
  await page.route("**/rest/v1/cases_visible*", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") {
      await route.continue();
      return;
    }
    const url = req.url();
    if (!isCasesVisibleFullListUrl(url)) {
      await route.continue();
      return;
    }
    const startedAt = Date.now();
    const response = await route.fetch();
    const endedAt = Date.now();
    const parsed = new URL(url);
    events.push({
      status: response.status(),
      select: parsed.searchParams.get("select"),
      startedAt,
      endedAt,
      ms: endedAt - startedAt,
    });
    await route.fulfill({ response });
  });
  return events;
}

describeBackend("cases list backend errors (isolated)", () => {
  test("T1 清單讀取：非 select=*、不含 edit_logs、記錄耗時與次數", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const events = await captureCasesListGets(session.page);
    const t0 = Date.now();
    await session.page.reload();
    await expect(session.page.getByRole("heading", { name: "案件管理" })).toBeVisible();
    await expect(session.page.getByTestId("cases-list-load-error")).toHaveCount(0);
    const wallMs = Date.now() - t0;

    expect(events.length, `full-list events=${JSON.stringify(events)}`).toBeGreaterThanOrEqual(1);
    expect(events.length, "同一進入不得刷多次全表").toBeLessThanOrEqual(2);
    for (const ev of events) {
      expect(ev.status, `status=${ev.status} select=${ev.select}`).toBeLessThan(400);
      expect(isCasesVisibleFullListSelect(ev.select), `select=${ev.select}`).toBe(false);
      expect(ev.select || "").not.toContain("edit_logs");
      expect(ev.select).not.toBe("*");
    }
    const maxMs = Math.max(...events.map((e) => e.ms));
    console.log(
      `[cases-list T1] wallMs=${wallMs} requests=${events.length} maxOriginMs=${maxMs} events=${JSON.stringify(events)}`,
    );
    await session.close();
  });

  test("T2 全表 500：顯示載入失敗，不得寫成尚無案件紀錄", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    await session.page.route("**/rest/v1/cases_visible*", async (route) => {
      const url = route.request().url();
      if (route.request().method() !== "GET" || !isCasesVisibleFullListUrl(url)) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "cases_visible_injected_fail" }),
      });
    });
    await session.page.goto("/cases");
    const err = session.page.getByTestId("cases-list-load-error");
    await expect(err).toBeVisible();
    await expect(session.page.getByTestId("cases-list-load-error-empty")).toBeVisible();
    await expect(session.page.getByText("尚無案件紀錄")).toHaveCount(0);
    await expect(session.page.getByTestId("cases-list-retry-button")).toBeVisible();

    await session.page.unroute("**/rest/v1/cases_visible*");
    await session.page.getByTestId("cases-list-retry-button").click();
    await expect(err).toHaveCount(0);
    await expect(session.page.getByRole("heading", { name: "案件管理" })).toBeVisible();
    await session.close();
  });
});

function isCasesVisibleStarSelect(url: string): boolean {
  if (!url.includes("/rest/v1/cases_visible")) return false;
  try {
    return new URL(url).searchParams.get("select") === "*";
  } catch {
    return /[?&]select=\*/.test(url);
  }
}

function isCasesVisibleSingleFullGet(url: string, caseId?: string): boolean {
  if (!isCasesVisibleStarSelect(url)) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const idEq = parsed.searchParams.get("id");
  if (!idEq || !idEq.startsWith("eq.")) return false;
  if (caseId && idEq !== `eq.${caseId}`) return false;
  return true;
}

function isoBodyBlocks(text: string) {
  return [
    {
      id: "iso-body-1",
      type: "paragraph",
      props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
      content: [{ type: "text", text, styles: {} }],
      children: [],
    },
  ];
}

async function createDraftViaUi(page: Page, title: string): Promise<string> {
  await page.goto("/cases");
  await expect(page.getByRole("heading", { name: "案件管理" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "新增案件" }).click();
  await page.waitForURL(/\/cases\/[0-9a-f-]{36}/i, { timeout: 60_000 });
  const m = page.url().match(/\/cases\/([^/?#]+)/);
  expect(m?.[1]).toBeTruthy();
  await expect(page.getByTestId("case-title-input")).toBeVisible({ timeout: 60_000 });
  const titleInput = page.getByTestId("case-title-input");
  await titleInput.fill(title);
  await titleInput.blur();
  return m![1];
}

async function patchCaseOutOfBand(
  page: Page,
  caseId: string,
  patch: Record<string, unknown>,
) {
  const token = await accessToken(page);
  const rest = restClient(page.request, token);
  await expect.poll(async () => {
    const latest = await readCaseState(rest, caseId);
    if (!latest) return "missing-case";
    const result = await rest.rpc<{ ok?: boolean }>("apply_case_update", {
      p_case_id: caseId,
      p_expected_revision: latest.revision,
      p_patch: patch,
    });
    if (result.ok && result.data?.ok !== false) return "ok";
    return result.text;
  }, { timeout: 20_000 }).toBe("ok");
}

describeBackend("cases list vs full split (isolated)", () => {
  test("T3 清單有案件、單筆完整讀取失敗：詳情不得當完整、複製須完整讀取", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const stamp = Date.now();
    const title = `ISO-BE-T3-${stamp}`;
    const bodyText = `ISO-FULL-BODY-${stamp}`;
    const caseId = await createDraftViaUi(page, title);
    await patchCaseOutOfBand(page, caseId, {
      body_content: isoBodyBlocks(bodyText),
      process_note: bodyText,
    });

    await page.goto("/cases");
    await page.reload();
    await expect(page.getByRole("heading", { name: "案件管理" })).toBeVisible({ timeout: 60_000 });

    await page.route("**/rest/v1/cases_visible*", async (route) => {
      const req = route.request();
      if (req.method() === "GET" && isCasesVisibleSingleFullGet(req.url(), caseId)) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "case_full_injected_fail" }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto(`/cases/${caseId}`);
    await expect(page.getByTestId("case-detail-full-load-error")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("case-title-input")).toHaveCount(0);

    await page.unroute("**/rest/v1/cases_visible*");
    await page.getByTestId("case-detail-full-load-retry").click();
    await expect(page.getByTestId("case-detail-completeness")).toHaveAttribute("data-completeness", "full", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("case-title-input")).toBeVisible();

    await page.route("**/rest/v1/cases_visible*", async (route) => {
      const req = route.request();
      if (req.method() === "GET" && isCasesVisibleSingleFullGet(req.url(), caseId)) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "case_full_copy_injected_fail" }),
        });
        return;
      }
      await route.continue();
    });
    await page.getByRole("button", { name: "複製本頁" }).click();
    await expect(page.getByText("來源案件完整資料讀取失敗，已取消複製。請重試後再複製。", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    expect(page.url()).toContain(caseId);

    await page.unroute("**/rest/v1/cases_visible*");
    await page.getByRole("button", { name: "複製本頁" }).click();
    await page.waitForURL((url) => {
      const m = url.pathname.match(/^\/cases\/([^/]+)/);
      return !!m && m[1] !== caseId;
    }, { timeout: 60_000 });
    const newId = page.url().match(/\/cases\/([^/?#]+)/)?.[1];
    expect(newId).toBeTruthy();
    const dismiss = page.getByRole("button", { name: "確定" });
    if (await dismiss.isVisible().catch(() => false)) {
      await dismiss.click();
    }
    await expect(page.getByTestId("case-detail-completeness")).toHaveAttribute("data-completeness", "full", {
      timeout: 30_000,
    });

    const rest = restClient(page.request, await accessToken(page));
    const rows = await rest.get<{ process_note?: string }[]>(
      `cases_visible?select=id,process_note&id=eq.${newId}`,
    );
    expect(rows[0]?.process_note).toBe(bodyText);
    await session.close();
  });

  test("T4 已快取完整案件、清單較新：舊內文不得搭新版本覆寫", async ({ browser }) => {
    const { email, password } = credPm();
    const session = await loginAs(browser, email, password);
    const page = session.page;
    const stamp = Date.now();
    const title = `ISO-BE-T4-${stamp}`;
    const oldBody = `ISO-OLD-BODY-${stamp}`;
    const newBody = `ISO-NEW-BODY-${stamp}`;
    const caseId = await createDraftViaUi(page, title);
    await patchCaseOutOfBand(page, caseId, {
      body_content: isoBodyBlocks(oldBody),
      process_note: oldBody,
    });

    await page.goto(`/cases/${caseId}`);
    await page.reload();
    await expect(page.getByTestId("case-detail-completeness")).toHaveAttribute("data-completeness", "full", {
      timeout: 30_000,
    });
    await expect(page.getByText(oldBody)).toBeVisible({ timeout: 15_000 });

    await page.route("**/rest/v1/cases_visible*", async (route) => {
      const req = route.request();
      if (req.method() === "GET" && isCasesVisibleStarSelect(req.url())) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "case_full_stale_injected_fail" }),
        });
        return;
      }
      await route.continue();
    });

    await patchCaseOutOfBand(page, caseId, {
      title: `${title}-newer`,
      body_content: isoBodyBlocks(newBody),
      process_note: newBody,
    });

    await page.getByRole("link", { name: "案件管理" }).click();
    await expect(page.getByRole("heading", { name: "案件管理" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(`${title}-newer`)).toBeVisible({ timeout: 30_000 });
    // 必須走 SPA 返回，保留記憶體裡的過期完整快取。page.goto 會整頁重載，
    // 快取清空後只剩清單投影，會誤走「完整讀取失敗」而不是 stale。
    const row = page.locator("tr").filter({ hasText: `${title}-newer` });
    await row.locator('button[title="開啟"]').click({ force: true });
    await expect(page).toHaveURL(new RegExp(`/cases/${caseId}`), { timeout: 15_000 });
    await expect(page.getByTestId("case-detail-stale-banner")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("case-detail-completeness")).toHaveAttribute("data-completeness", "stale");
    await expect(page.getByTestId("case-detail-omitted-preview")).toContainText(oldBody);
    await expect(page.getByTestId("case-title-input")).toHaveAttribute("readonly");

    const writes: string[] = [];
    await page.route("**/rest/v1/rpc/apply_case_update", async (route) => {
      writes.push(route.request().postData() || "");
      await route.continue();
    });
    await page.getByTestId("case-title-input").click();
    await page.keyboard.type("should-not-save");
    await page.locator("body").click();
    expect(writes, "過期完整快取不得寫回").toEqual([]);

    await page.unroute("**/rest/v1/cases_visible*");
    await page.getByTestId("case-detail-stale-retry").click();
    await expect(page.getByTestId("case-detail-completeness")).toHaveAttribute("data-completeness", "full", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("case-detail-stale-banner")).toHaveCount(0);
    await expect(page.getByTestId("case-title-input")).toBeVisible();
    await expect(page.getByText(newBody)).toBeVisible();
    await session.close();
  });
});
