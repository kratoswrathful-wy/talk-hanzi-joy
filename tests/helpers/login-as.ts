import { expect, type Browser, type Page } from "@playwright/test";

/**
 * 以隔離 Auth 真正建立的合成帳號登入（@test.local）。
 * 權限／participant 驗證不得用測試模式假人切換代替。
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
  await page.goto("/");
  const emailInput = page.locator("#email");
  await emailInput.waitFor({ state: "visible", timeout: 60_000 });
  await emailInput.fill(email);
  await page.locator("#password").fill(password);
  await page.getByTestId("btn-auth-submit").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login") && url.pathname !== "/", {
    timeout: 90_000,
  }).catch(async () => {
    // 部分環境登入後仍停在 / 再導向；改等案件頁標題或側欄。
    await expect(page.getByText("案件管理").first()).toBeVisible({ timeout: 90_000 });
  });
  await expectSignedInAs(page, email);
  return {
    page,
    close: async () => {
      await context.close();
    },
  };
}

/** 確認目前生效身分就是預期帳號（避免用錯身分跑完整個測試而誤判通過）。 */
export async function expectSignedInAs(page: Page, email: string): Promise<void> {
  await expect.poll(async () => {
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
      if (!raw) return "";
      if (raw.startsWith("base64-")) raw = b64urlDecode(raw.slice(7));
      const parsed = JSON.parse(raw) as { user?: { email?: string }; access_token?: string };
      if (parsed.user?.email) return parsed.user.email;
      const token = parsed.access_token;
      if (!token) return "";
      const claims = JSON.parse(b64urlDecode(token.split(".")[1])) as { email?: string };
      return claims.email ?? "";
    });
    return actual.toLowerCase();
  }, { timeout: 30_000 }).toBe(email.toLowerCase());
}
