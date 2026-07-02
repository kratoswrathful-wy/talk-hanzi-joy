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

  if (await isInOnlineTestMode(page)) return;

  // user_roles 載入前頂欄不會渲染「進入測試模式」
  const enterBtn = page.getByRole("button", { name: "進入測試模式" });
  try {
    await expect(enterBtn).toBeVisible({ timeout: 90_000 });
  } catch {
    throw new Error(
      "PLAYWRIGHT_ENTER_TEST_MODE=1 但找不到「進入測試模式」按鈕（請確認帳號為真人執行長 executive，且假人已建立）",
    );
  }

  await enterBtn.click();
  await page.waitForLoadState("load", { timeout: 120_000 });
  await expect(page.getByText(TEST_MODE_BANNER)).toBeVisible({ timeout: 90_000 });
}
