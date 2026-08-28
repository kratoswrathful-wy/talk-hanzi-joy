import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

/**
 * 回歸測試背景（2026-07-04）：TranslatorInvoiceStatus／ClientInvoiceStatusCell
 * 曾在 `if (!linked) return ...` 之後才呼叫 `useSelectOptions("statusLabel")`，
 * 違反 React Hooks 規則（同一元件不同次 render 呼叫的 hook 數量不得改變）。
 * `linked` 由 props/store 資料決定，執行期一旦從「無連結請款單」變為「有連結」，
 * 即可能觸發 "Rendered fewer hooks than expected" 而整頁白屏。
 *
 * 本測試以子行程跑 ESLint（`--rulesdir` 不可用，改用 `--rule`／JSON 輸出過濾
 * `react-hooks/rules-of-hooks`），確保日後若再次把 Hook 呼叫搬到條件式 return
 * 之後，測試會先擋下來，不必等到瀏覽器執行期崩潰才發現。改用子行程而非
 * ESLint API：ESLint 內部 retry/abort 邏輯依賴原生 `AbortSignal`，本專案
 * vitest 全域環境為 jsdom，jsdom 覆寫的 `AbortSignal` 缺少 `throwIfAborted`
 * 會導致 API 呼叫失敗，子行程可完全避開此環境衝突。
 */
describe("TranslatorFees.tsx — React Hooks 規則回歸", () => {
  it(
    "不應有 react-hooks/rules-of-hooks 違規（Hook 不得於條件式 return 之後才呼叫）",
    () => {
    const result = spawnSync(
      "npx",
      ["eslint", "--format", "json", "src/pages/TranslatorFees.tsx"],
      { cwd: process.cwd(), encoding: "utf-8", shell: true },
    );

    // eslint 有 lint 錯誤時 exit code 為 1，仍要往下解析 JSON 輸出，不能靠 exit code 判斷。
    expect(result.stdout, result.stderr).toBeTruthy();
    const report = JSON.parse(result.stdout) as Array<{
      messages: Array<{ ruleId: string | null }>;
    }>;
    const hookRuleErrors = report
      .flatMap((r) => r.messages)
      .filter((m) => m.ruleId === "react-hooks/rules-of-hooks");

    expect(hookRuleErrors).toEqual([]);
    },
    30_000,
  );
});
