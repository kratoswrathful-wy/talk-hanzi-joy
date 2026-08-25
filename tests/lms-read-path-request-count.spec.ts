import { test, expect } from "@playwright/test";
import { expectListPageReady, expectOnlineTestMode } from "./helpers/test-mode-persona";

/**
 * LMS 初始化 request storm 回歸：同一 auth 原因下，關鍵 full-list / assignee 表
 * 不應平行重複開多輪。允許 poll probe、legacy fallback、產品預期 requery。
 */
test.describe("LMS read-path request counts", () => {
  test("F5 /cases：assignee 三表與 cases_visible 無平行雙載入", async ({ page }) => {
    const counts: Record<string, number> = {
      cases_visible: 0,
      profiles: 0,
      invitations: 0,
      member_translator_settings: 0,
      fees_visible: 0,
    };

    await page.route("**/rest/v1/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/cases_visible") && !url.includes("updated_at")) counts.cases_visible += 1;
      if (url.includes("/profiles") && !url.includes("select=id")) {
        // useAuth 單筆 profiles 也會出現；只計 list 形狀近似：含 email
        if (url.includes("email") || url.includes("display_name")) counts.profiles += 1;
      }
      if (url.includes("/invitations")) counts.invitations += 1;
      if (url.includes("/member_translator_settings")) counts.member_translator_settings += 1;
      if (url.includes("/fees_visible") && !url.includes("updated_at")) counts.fees_visible += 1;
      await route.continue();
    });

    await page.goto("/cases");
    await expectOnlineTestMode(page);
    await expectListPageReady(page, "案件管理");

    // 單次初始化：同一原因不應 ≥3 輪平行 full load
    expect(counts.cases_visible, "cases_visible full-list").toBeLessThanOrEqual(2);
    expect(counts.invitations, "invitations").toBeLessThanOrEqual(2);
    expect(counts.member_translator_settings, "member_translator_settings").toBeLessThanOrEqual(2);
    expect(counts.fees_visible, "fees_visible").toBeLessThanOrEqual(2);
  });
});
