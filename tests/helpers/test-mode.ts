import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

const TEST_MODE_BANNER = "測試模式 — 目前所有操作都在測試環境，與正式資料隔離";

/** 是否應在登入後進入線上測試模式（假執行長，env=test）。 */
export function shouldEnterOnlineTestMode(): boolean {
  return process.env.PLAYWRIGHT_ENTER_TEST_MODE === "1";
}

export async function isInOnlineTestMode(page: Page): Promise<boolean> {
  return page.getByText(TEST_MODE_BANNER).isVisible().catch(() => false);
}

/**
 * 真人執行長登入後點「進入測試模式」→ 切為 test-exec@test.local 並 reload。
 * 已在測試模式時略過。
 */
export async function enterOnlineTestMode(page: Page): Promise<void> {
  if (!shouldEnterOnlineTestMode()) return;

  const banner = page.getByText(TEST_MODE_BANNER);
  const enterBtn = page.getByRole("button", { name: "進入測試模式" });

  // 等身分／roles 就緒後，頂欄會出現「進入測試模式」或已在測試模式橫幅其一
  await Promise.race([
    banner.waitFor({ state: "visible", timeout: 90_000 }),
    enterBtn.waitFor({ state: "visible", timeout: 90_000 }),
  ]).catch(() => undefined);

  if (await isInOnlineTestMode(page)) return;

  try {
    await expect(enterBtn).toBeVisible({ timeout: 5_000 });
  } catch {
    throw new Error(
      "PLAYWRIGHT_ENTER_TEST_MODE=1 但找不到「進入測試模式」按鈕（請確認帳號為真人執行長 executive，且假人已建立）",
    );
  }

  await enterBtn.click();
  await page.waitForLoadState("load", { timeout: 120_000 });
  await expect(banner).toBeVisible({ timeout: 90_000 });
}
