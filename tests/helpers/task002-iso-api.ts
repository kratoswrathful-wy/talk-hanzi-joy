import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { RestClient } from "./isolated-api";

const FORMAL_REF = "wshsmerltcakffllgyul";
const ISOLATION_REF = "kymyughnkleuoyzsuiob";

/** 本輪只准隔離遠端或本機庫；正式一律拒絕。 */
export function task002Api(): { url: string; anonKey: string } {
  const url = process.env.VITE_SUPABASE_URL ?? "";
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  expect(url, "缺少 VITE_SUPABASE_URL").toBeTruthy();
  expect(anonKey, "缺少 VITE_SUPABASE_PUBLISHABLE_KEY").toBeTruthy();
  expect(new RegExp(FORMAL_REF, "i").test(url), "禁止對正式後端寫入").toBe(false);
  const isolation = new RegExp(ISOLATION_REF, "i").test(url);
  const local = /^https?:\/\/(127\.0\.0\.1|localhost)/i.test(url);
  expect(isolation || local, "只准隔離或本機後端").toBe(true);
  return { url, anonKey };
}

export function task002Rest(request: APIRequestContext, token: string): RestClient {
  const { url, anonKey } = task002Api();
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  return {
    async get<T>(pathAndQuery: string): Promise<T> {
      const res = await request.get(`${url}/rest/v1/${pathAndQuery}`, { headers });
      const text = await res.text();
      expect(res.ok(), `GET ${pathAndQuery} ${res.status()}: ${text}`).toBe(true);
      return JSON.parse(text) as T;
    },
    async rpc<T>(fn: string, body: unknown) {
      const res = await request.post(`${url}/rest/v1/rpc/${fn}`, { headers, data: body });
      const text = await res.text();
      let data: T | undefined;
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = undefined;
      }
      return { ok: res.ok(), status: res.status(), text, data };
    },
  };
}

export async function task002AccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
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
    return (JSON.parse(raw) as { access_token?: string }).access_token ?? null;
  });
  expect(token, "找不到登入 token").toBeTruthy();
  return token!;
}
