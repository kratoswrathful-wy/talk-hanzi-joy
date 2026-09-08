import { expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * 隔離環境（本機 Supabase）直呼 REST/RPC 的共用工具。
 * 一律先確認不是正式專案，再允許任何讀寫；page.request 不受 page.route 攔截，
 * 適合用來做「後端讀回」與「另一個操作」的對照證據。
 */
const PRODUCTION_REF = "wshsmerltcakffllgyul";

export function localApi(): { url: string; anonKey: string } {
  const url = process.env.VITE_SUPABASE_URL ?? "";
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  expect(url).toBeTruthy();
  expect(new RegExp(PRODUCTION_REF, "i").test(url)).toBe(false);
  expect(/^https?:\/\/(127\.0\.0\.1|localhost)/i.test(url)).toBe(true);
  return { url, anonKey };
}

/** 從瀏覽器 localStorage 取出目前登入者的 access token（不輸出到 log）。 */
export async function accessToken(page: Page): Promise<string> {
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

export interface RestClient {
  get<T>(pathAndQuery: string): Promise<T>;
  rpc<T>(fn: string, body: unknown): Promise<{ ok: boolean; status: number; text: string; data?: T }>;
}

export function restClient(request: APIRequestContext, token: string): RestClient {
  const { url, anonKey } = localApi();
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

export interface CaseStateRow {
  id: string;
  status: string;
  revision: number;
}

export async function readCaseState(rest: RestClient, caseId: string): Promise<CaseStateRow | null> {
  const rows = await rest.get<CaseStateRow[]>(
    `cases_visible?select=id,status,revision&id=eq.${caseId}`,
  );
  return rows[0] ?? null;
}

export interface ParticipantRow {
  user_id: string;
  role: string;
  work_status: string;
  access_revoked_at: string | null;
}

export async function readParticipants(rest: RestClient, caseId: string): Promise<ParticipantRow[]> {
  return rest.get<ParticipantRow[]>(
    `case_participants?select=user_id,role,work_status,access_revoked_at&case_id=eq.${caseId}`,
  );
}

export interface AuditRow {
  actor_user_id: string;
  action: string;
  previous_revision: number;
  new_revision: number;
}

export async function readAudit(rest: RestClient, caseId: string): Promise<AuditRow[]> {
  return rest.get<AuditRow[]>(
    `case_mutation_audit?select=actor_user_id,action,previous_revision,new_revision`
      + `&case_id=eq.${caseId}&order=created_at.asc`,
  );
}

export async function userIdByEmail(rest: RestClient, email: string): Promise<string> {
  const rows = await rest.get<{ id: string }[]>(
    `profiles?select=id&email=eq.${encodeURIComponent(email)}`,
  );
  expect(rows[0]?.id, `找不到 ${email} 的 profile`).toBeTruthy();
  return rows[0].id;
}
