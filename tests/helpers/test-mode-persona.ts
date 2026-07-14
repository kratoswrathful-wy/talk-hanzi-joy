import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const TEST_MODE_BANNER = "測試模式 — 目前所有操作都在測試環境，與正式資料隔離";

/** 等待已在線上測試模式（黃色橫幅可見）。 */
export async function expectOnlineTestMode(page: Page): Promise<void> {
  await expect(page.getByText(TEST_MODE_BANNER)).toBeVisible({ timeout: 90_000 });
}

/** 測試模式指示就緒，且假人切換鈕已渲染（換人前的確定訊號）。 */
export async function expectTestModePersonaUiReady(page: Page): Promise<void> {
  await expectOnlineTestMode(page);
  // 多個假人鈕同時存在；用 count≥1，避免 strict mode（多元素）誤失敗
  await expect(
    page.getByRole("button", { name: /^(執行長|PM|譯者)/ }),
    "測試模式假人切換列尚未就緒",
  ).not.toHaveCount(0, { timeout: 60_000 });
}

/**
 * 在測試模式面板切換假人（會整頁 reload）。
 * @param personaLabel DevRoleSwitcher 按鈕前綴，例如「PM」「譯者一」（DB display_name 可能為「譯者一（測試）」）
 */
export async function switchToTestPersona(page: Page, personaLabel: string): Promise<void> {
  // 先等橫幅＋切換列就緒（勿只靠單次 isVisible，避免尚未渲染就點）
  await expectTestModePersonaUiReady(page);
  const btn = page.getByRole("button", { name: new RegExp(`^${personaLabel}`) });
  await expect(btn.first()).toBeVisible({ timeout: 30_000 });
  await btn.first().click();
  await page.waitForLoadState("load", { timeout: 120_000 });
  await expectOnlineTestMode(page);
  // 驗證切換確實生效：目前扮演的假人按鈕為 default variant（bg-primary），
  // 避免 dev-switch-user 靜默失敗仍以原身分（假執行長）跑「譯者」測試而誤判通過。
  const activeBtn = page.getByRole("button", { name: new RegExp(`^${personaLabel}`) }).first();
  await expect(activeBtn, `切換為「${personaLabel}」後該假人未成為 active persona（可能 dev-switch-user 失敗）`).toHaveClass(
    /bg-primary/,
    { timeout: 15_000 },
  );
}

/** 列表頁載入：標題可見且無 RLS 拒絕 toast。 */
export async function expectListPageReady(page: Page, heading: string): Promise<void> {
  await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/permission denied|權限不足|無法載入/i)).toHaveCount(0);
}
