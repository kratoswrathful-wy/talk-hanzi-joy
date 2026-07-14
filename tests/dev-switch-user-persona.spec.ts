import { test, expect } from "@playwright/test";
import {
  expectTestModePersonaUiReady,
  switchToTestPersona,
} from "./helpers/test-mode-persona";

/**
 * 回歸測試：測試模式「換人」（dev-switch-user → verifyOtp）必須真的改變登入身分。
 *
 * 背景（2026-07-05 修復，分支 fix/dev-switch-user-persona-verify）：
 *   舊版 consumeTokenAndReload 在 verifyOtp 前呼叫 supabase.auth.signOut()，而 GoTrue 的
 *   POST /logout?scope=local 會「在伺服器端」撤銷目前這張 session（local = 僅目前這張）。
 *   測試模式中多個 Playwright context 共用同一張假執行長 session，任一 context 一旦
 *   signOut，其餘 context 的 token 就在伺服器端失效；換人時 dev-switch-user 內的
 *   getUser 回 401 → 換人靜默失敗卻仍以原身分執行（誤判通過）。移除該 signOut 後修復。
 *
 * 本測試以「連續換人 + 每次驗證登入 email 確有改變」守住此行為，避免回歸。
 */

/** 從 localStorage 的 supabase session 解出目前登入 email（登入身分的地面真相）。 */
async function currentAuthEmail(page: import("@playwright/test").Page): Promise<string | null> {
  return page.evaluate(() => {
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
    if (!keys.length) return null;
    keys.sort();
    let raw = keys.map((k) => localStorage.getItem(k) ?? "").join("");
    if (raw.startsWith("base64-")) raw = b64urlDecode(raw.slice(7));
    const parsed = JSON.parse(raw);
    const token: string | undefined = parsed?.access_token;
    if (!token) return null;
    return JSON.parse(b64urlDecode(token.split(".")[1]))?.email ?? null;
  });
}

test("連續換人（假執行長 → PM → 譯者一）每次都真的切換身分", async ({ page }) => {
  await page.goto("/cases");
  await expectTestModePersonaUiReady(page);
  expect(await currentAuthEmail(page)).toBe("test-exec@test.local");

  await switchToTestPersona(page, "PM"); // 內含橫幅＋切換列就緒＋active persona 斷言
  expect(await currentAuthEmail(page)).toBe("test-pm@test.local");

  await expectTestModePersonaUiReady(page);
  await switchToTestPersona(page, "譯者一");
  expect(await currentAuthEmail(page)).toBe("test-t1@test.local");
});
