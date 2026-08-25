import { test, expect } from "@playwright/test";
import { expectListPageReady, expectOnlineTestMode } from "./helpers/test-mode-persona";

/**
 * LMS 初始化 request storm 回歸：同一 auth 原因下，關鍵 full-list / assignee 表
 * 不應平行重複開多輪。允許 poll probe、legacy fallback、產品預期 requery。
 */
test.describe("LMS read-path request counts", () => {
  test("F5 /cases：初始 full-list 各只載入一輪", async ({ page }) => {
    const counts: Record<string, number> = {
      cases_visible: 0,
      profiles: 0,
      invitations: 0,
      member_translator_settings: 0,
      fees_visible: 0,
      invoices: 0,
      client_invoices: 0,
    };
    const startedAt = Date.now();
    const fullListEvents: Array<{ table: string; atMs: number }> = [];
    let lastTrackedRequestAt = Date.now();

    await page.route("**/rest/v1/**", async (route) => {
      const url = route.request().url();
      const parsedUrl = new URL(url);
      const pathname = parsedUrl.pathname;
      const selectedColumns = parsedUrl.searchParams.get("select");
      let tracked = false;
      if (url.includes("/cases_visible") && !url.includes("updated_at")) {
        counts.cases_visible += 1;
        tracked = true;
      }
      if (url.includes("/profiles") && !url.includes("select=id")) {
        // useAuth 單筆 profiles 也會出現；只計 list 形狀近似：含 email
        if (url.includes("email") || url.includes("display_name")) {
          counts.profiles += 1;
          tracked = true;
        }
      }
      if (url.includes("/invitations")) {
        counts.invitations += 1;
        tracked = true;
      }
      if (url.includes("/member_translator_settings")) {
        counts.member_translator_settings += 1;
        tracked = true;
      }
      if (
        url.includes("/fees_visible") &&
        selectedColumns === "*" &&
        !url.includes("updated_at")
      ) {
        counts.fees_visible += 1;
        fullListEvents.push({
          table: "fees_visible",
          atMs: Date.now() - startedAt,
        });
        tracked = true;
      }
      if (
        pathname.endsWith("/invoices") &&
        selectedColumns === "*" &&
        !url.includes("updated_at")
      ) {
        counts.invoices += 1;
        fullListEvents.push({ table: "invoices", atMs: Date.now() - startedAt });
        tracked = true;
      }
      if (
        pathname.endsWith("/client_invoices") &&
        selectedColumns === "*" &&
        !url.includes("updated_at")
      ) {
        counts.client_invoices += 1;
        fullListEvents.push({
          table: "client_invoices",
          atMs: Date.now() - startedAt,
        });
        tracked = true;
      }
      if (tracked) lastTrackedRequestAt = Date.now();
      await route.continue();
    });

    await page.goto("/cases");
    await expectOnlineTestMode(page);
    await expectListPageReady(page, "案件管理");

    await expect
      .poll(
        () => counts.fees_visible > 0 && counts.invoices > 0 && counts.client_invoices > 0,
        { timeout: 10_000 },
      )
      .toBe(true);
    await expect
      .poll(() => Date.now() - lastTrackedRequestAt, {
        timeout: 10_000,
        intervals: [100, 250, 500],
      })
      .toBeGreaterThanOrEqual(1_800);

    expect(counts.cases_visible, "cases_visible full-list").toBeLessThanOrEqual(2);
    expect(counts.invitations, "invitations").toBeLessThanOrEqual(2);
    expect(counts.member_translator_settings, "member_translator_settings").toBeLessThanOrEqual(2);
    expect(
      counts.fees_visible,
      `fees_visible events=${JSON.stringify(fullListEvents)}`,
    ).toBe(1);
    expect(counts.invoices, "invoices").toBe(1);
    expect(counts.client_invoices, "client_invoices").toBe(1);
  });
});
