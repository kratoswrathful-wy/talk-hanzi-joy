import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { enterOnlineTestMode } from "./helpers/test-mode";

const authFile = path.join("playwright", ".auth", "user.json");

setup("authenticate", async ({ page }) => {
  const email =
    process.env.PLAYWRIGHT_TEST_EMAIL ?? process.env.E2E_TEST_EMAIL;
  const password =
    process.env.PLAYWRIGHT_TEST_PASSWORD ?? process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "請在 .env 設定 PLAYWRIGHT_TEST_EMAIL / PLAYWRIGHT_TEST_PASSWORD（TMS 登入帳密）",
    );
  }

  await page.goto("/cat/offline");

  const catIframe = page.locator('iframe[title="CAT 個人離線版"]');
  if (await catIframe.isVisible().catch(() => false)) {
    await page.goto("/cases");
    await enterOnlineTestMode(page);
    fs.mkdirSync(path.dirname(authFile), { recursive: true });
    await page.context().storageState({ path: authFile });
    return;
  }

  const emailInput = page.locator("#email");
  await emailInput.waitFor({ state: "visible", timeout: 15_000 });
  await emailInput.fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "登入" }).click();

  await expect(catIframe).toBeVisible({ timeout: 90_000 });

  // 頂欄測試模式入口在 LMS 殼層；先離開 iframe 頁較穩
  await page.goto("/cases");
  await enterOnlineTestMode(page);

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
