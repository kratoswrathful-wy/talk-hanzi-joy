import { test, expect } from "@playwright/test";

/**
 * Auth 恢復路徑體感／回歸：正常登入後 F5、案件↔CAT 切換、
 * 以及全螢幕 Auth spinner 必須在合理時間內結束（不得永久卡住）。
 */
test.describe("auth loading recovery", () => {
  test("正常登入後可開 /cases，且全螢幕 Auth spinner 會結束", async ({ page }) => {
    await page.goto("/cases");
    await expect(page.getByTestId("auth-fullscreen-spinner")).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("auth-recoverable-error")).toHaveCount(0);
    // 案件頁或登入頁其一即可（視 session）；重點是不再永久 spinner
    const onCases = page.url().includes("/cases");
    const hasLogin = await page.getByRole("button", { name: /登入|Sign in/i }).count();
    expect(onCases || hasLogin > 0).toBeTruthy();
  });

  test("F5 /cases 後仍須離開全螢幕 Auth loading", async ({ page }) => {
    await page.goto("/cases");
    await expect(page.getByTestId("auth-fullscreen-spinner")).toHaveCount(0, {
      timeout: 30_000,
    });
    await page.reload();
    await expect(page.getByTestId("auth-fullscreen-spinner")).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("auth-recoverable-error")).toHaveCount(0);
  });

  test("/cases 與 /cat/team 切換不得永久卡住 Auth spinner", async ({ page }) => {
    await page.goto("/cases");
    await expect(page.getByTestId("auth-fullscreen-spinner")).toHaveCount(0, {
      timeout: 30_000,
    });
    await page.goto("/cat/team");
    await expect(page.getByTestId("auth-fullscreen-spinner")).toHaveCount(0, {
      timeout: 30_000,
    });
    await page.goto("/cases");
    await expect(page.getByTestId("auth-fullscreen-spinner")).toHaveCount(0, {
      timeout: 30_000,
    });
  });
});
