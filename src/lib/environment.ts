/**
 * Environment detection utility.
 * Separates test from production data.
 *
 * 判定優先序（與 docs/CAT_LMS_TEST_MODE_IMPL_PLAN_2026-06.md 一致）：
 *   1. 身分優先：若目前登入者為「測試帳號」（profiles.is_test 或 email 以 @test.local 結尾），
 *      一律視為 test 環境 —— 即使在正式網域。
 *   2. 否則依 hostname 判斷：
 *      - *.lovableproject.com
 *      - *-preview--*.lovable.app
 *      - localhost / 127.0.0.1
 *      其餘為 production。
 *
 * 設計理由：測試模式採「環境綁定身分」——假帳號永遠在 test、真帳號永遠在 production，
 * 與資料庫 RLS 的 public.current_env() 一致，避免單純依 hostname 造成的跨環境誤判。
 */

import { getAuthSnapshot } from "@/lib/auth-ready";

let _hostEnv: "test" | "production" | null = null;

/**
 * 由 useAuth 在載入 profile 後寫入的權威旗標（profiles.is_test）。
 * null 代表尚未解析；此時退回 email 後綴的同步判斷。
 */
let _testAccountFlag: boolean | null = null;

function hostEnv(): "test" | "production" {
  if (_hostEnv) return _hostEnv;

  const host = window.location.hostname;
  const isTest =
    host.includes("lovableproject.com") ||
    host.includes("-preview--") ||
    host === "localhost" ||
    host === "127.0.0.1";

  _hostEnv = isTest ? "test" : "production";
  return _hostEnv;
}

/** 目前登入者是否為測試帳號（身分優先判斷）。 */
function isTestIdentity(): boolean {
  if (_testAccountFlag !== null) return _testAccountFlag;
  // profile 尚未載入時的同步退路：以 auth session 的 email 後綴判斷。
  const email = getAuthSnapshot().user?.email ?? null;
  return !!email && email.toLowerCase().endsWith("@test.local");
}

export function getEnvironment(): "test" | "production" {
  if (isTestIdentity()) return "test";
  return hostEnv();
}

/** 由 useAuth 設定 profiles.is_test 旗標（權威來源）。 */
export function setTestAccountFlag(isTest: boolean | null): void {
  _testAccountFlag = isTest;
}

/** 清除環境快取與測試帳號旗標；切換登入者後呼叫，再配合整頁 reload。 */
export function resetEnvironmentCache(): void {
  _hostEnv = null;
  _testAccountFlag = null;
}

/** Prefix a settings key with the current environment */
export function envKey(key: string): string {
  return `${getEnvironment()}:${key}`;
}
