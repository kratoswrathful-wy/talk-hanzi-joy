import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "./helpers/login-as";
import { isCasesVisibleFullListSelect } from "../src/lib/case-list-columns";

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
