import { expect, type Browser, type Page } from "@playwright/test";

/**
 * 以「真實測試帳號」另開一個瀏覽器 context 登入。
 * 權限／participant 類驗證不得用測試模式假人切換代替：路由守衛與 RLS 看的是真實登入帳號
 * （見 .cursor/rules/testing.mdc §6）。
 */
export interface LoggedInPersona {
  page: Page;
  close: () => Promise<void>;
}

export async function loginAs(
  browser: Browser,
  email: string,
  password: string,
): Promise<LoggedInPersona> {
  expect(email, "缺少登入 email").toBeTruthy();
  expect(password, "缺少登入密碼").toBeTruthy();
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await page.goto("/cat/offline");

  const emailInput = page.locator("#email");
  await emailInput.waitFor({ state: "visible", timeout: 60_000 });
  await emailInput.fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page.locator('iframe[title="CAT 個人離線版"]')).toBeVisible({ timeout: 90_000 });

  return {
    page,
    close: async () => {
      await context.close();
    },
  };
}

/** 確認目前生效身分就是預期帳號（避免用錯身分跑完整個測試而誤判通過）。 */
export async function expectSignedInAs(page: Page, email: string): Promise<void> {
  const actual = await page.evaluate(() => {
    function b64urlDecode(s: string): string {
      let t = s.replace(/-/g, "+").replace(/_/g, "/");
      while (t.length % 4) t += "=";
      return atob(t);
    }
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /sb-.*-auth-token(\.\d+)?$/.test(k)) keys.push(k);
    }
    keys.sort();
    let raw = keys.map((k) => localStorage.getItem(k) ?? "").join("");
    if (raw.startsWith("base64-")) raw = b64urlDecode(raw.slice(7));
    const parsed = JSON.parse(raw) as { user?: { email?: string } };
    return parsed.user?.email ?? "";
  });
  expect(actual.toLowerCase(), "目前生效身分與預期不符").toBe(email.toLowerCase());
}
