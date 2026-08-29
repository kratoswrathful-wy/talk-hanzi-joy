import { test, expect } from "@playwright/test";
import { expectOnlineTestMode } from "./helpers/test-mode-persona";

type AuthReadyTest = {
  blockGetSession: (block: boolean) => void;
  setTimeoutMs: (ms: number) => void;
  getPhase: () => string;
  retry: () => Promise<unknown>;
  emit: (event: string, session: unknown) => void;
  getSnapshot: () => { phase: string; user: { id: string } | null };
};

async function getAuthTest(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    return Boolean((window as unknown as { __authReadyTest?: AuthReadyTest }).__authReadyTest);
  });
}

async function requireAuthTest(page: import("@playwright/test").Page) {
  await expect.poll(async () => getAuthTest(page), { timeout: 15_000 }).toBe(true);
}

/**
 * Auth 恢復路徑：必須先確認測試身分已登入，並以受控故障注入驗證 bounded recovery。
 */
test.describe("auth loading recovery", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/cases");
    await expect(page.getByTestId("auth-fullscreen-spinner")).toHaveCount(0, {
      timeout: 30_000,
    });
    await expectOnlineTestMode(page);
    await expect(page.getByRole("heading", { name: "案件管理" })).toBeVisible({
      timeout: 30_000,
    });
    await requireAuthTest(page);
  });

  test("已登入身分可開 /cases，且全螢幕 Auth spinner 會結束", async ({ page }) => {
    await expect(page.getByTestId("auth-recoverable-error")).toHaveCount(0);
    await expect(page.locator("#email")).toHaveCount(0);
  });

  test("F5 /cases 後仍須離開全螢幕 Auth loading 且保持登入", async ({ page }) => {
    await page.reload();
    await expect(page.getByTestId("auth-fullscreen-spinner")).toHaveCount(0, {
      timeout: 30_000,
    });
    await expectOnlineTestMode(page);
    await expect(page.getByRole("heading", { name: "案件管理" })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("/cases 與 /cat/team 切換不得永久卡住 Auth spinner", async ({ page }) => {
    await page.goto("/cat/team");
    await expect(page.getByTestId("auth-fullscreen-spinner")).toHaveCount(0, {
      timeout: 30_000,
    });
    await expectOnlineTestMode(page);
    await page.goto("/cases");
    await expect(page.getByTestId("auth-fullscreen-spinner")).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: "案件管理" })).toBeVisible();
  });

  test("人工 pending getSession → bounded recovery UI → retry 恢復", async ({ page }) => {
    // addInitScript 在下一輪導覽／reload 的模組載入前寫入 sessionStorage，
    // 讓 getSession hang 早於 Auth 初始化（記憶體旗標 alone 會被 reload 清掉）。
    await page.addInitScript(() => {
      sessionStorage.setItem("__auth_ready_test_block", "1");
      sessionStorage.setItem("__auth_ready_test_timeout_ms", "1500");
    });

    await page.reload();
    await expect(page.getByTestId("auth-recoverable-error")).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByTestId("auth-fullscreen-spinner")).toHaveCount(0);

    await page.evaluate(() => {
      sessionStorage.removeItem("__auth_ready_test_block");
      sessionStorage.removeItem("__auth_ready_test_timeout_ms");
      const hooks = (window as unknown as { __authReadyTest: AuthReadyTest }).__authReadyTest;
      hooks.blockGetSession(false);
      hooks.setTimeoutMs(10_000);
    });

    await page.getByTestId("auth-retry-button").click();
    await expect(page.getByTestId("auth-recoverable-error")).toHaveCount(0, {
      timeout: 30_000,
    });
    await expectOnlineTestMode(page);
    await expect(page.getByRole("heading", { name: "案件管理" })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("TOKEN_REFRESHED 不回全畫面 loading；重複 INITIAL_SESSION 保持登入", async ({
    page,
  }) => {
    await page.evaluate(() => {
      const hooks = (window as unknown as { __authReadyTest: AuthReadyTest }).__authReadyTest;
      const snap = hooks.getSnapshot();
      const session = {
        access_token: "t",
        user: snap.user ?? { id: "keep", email: "x@test.local" },
      };
      hooks.emit("TOKEN_REFRESHED", session);
      hooks.emit("INITIAL_SESSION", session);
      hooks.emit("TOKEN_REFRESHED", session);
    });

    await expect(page.getByTestId("auth-fullscreen-spinner")).toHaveCount(0);
    await expect(page.getByTestId("auth-recoverable-error")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "案件管理" })).toBeVisible();
    const phase = await page.evaluate(
      () => (window as unknown as { __authReadyTest: AuthReadyTest }).__authReadyTest.getPhase(),
    );
    expect(phase).toBe("authenticated");
  });

  test("多分頁：關閉一頁後另一頁仍可離開 Auth spinner", async ({ context, page }) => {
    const page2 = await context.newPage();
    await page2.goto("/cases");
    await expect(page2.getByTestId("auth-fullscreen-spinner")).toHaveCount(0, {
      timeout: 30_000,
    });
    await expectOnlineTestMode(page2);
    await page2.close();

    await page.reload();
    await expect(page.getByTestId("auth-fullscreen-spinner")).toHaveCount(0, {
      timeout: 30_000,
    });
    await expectOnlineTestMode(page);
  });

  test("背景轉前景後不得永久卡住 Auth spinner", async ({ page }) => {
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    await expect(page.getByTestId("auth-fullscreen-spinner")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "案件管理" })).toBeVisible();
  });

  test("session refresh／reload 後仍可進入案件頁", async ({ page }) => {
    await page.evaluate(() => {
      const hooks = (window as unknown as { __authReadyTest: AuthReadyTest }).__authReadyTest;
      const snap = hooks.getSnapshot();
      hooks.emit("TOKEN_REFRESHED", {
        access_token: "refreshed",
        user: snap.user,
      });
    });
    await page.reload();
    await expect(page.getByTestId("auth-fullscreen-spinner")).toHaveCount(0, {
      timeout: 30_000,
    });
    await expectOnlineTestMode(page);
    await expect(page.getByRole("heading", { name: "案件管理" })).toBeVisible();
  });
});
