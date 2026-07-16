/**
 * 釘死：LMS sync 呼叫鏈不得傳 p_allow_downgrade（永遠走 DEFAULT false）。
 * 以 migration SQL 原文為契約（避免 JS 繞過）。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = resolve(
  process.cwd(),
  "supabase/migrations/20260716120000_cat_review_segment_assign.sql",
);

describe("sync → upsert：不得傳 p_allow_downgrade", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("sync 函式內的 upsert 呼叫為 8 參數（無 allow_downgrade）", () => {
    // 擷取 sync 函式本體
    const syncStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.sync_cat_workflow_assignments_for_case");
    expect(syncStart).toBeGreaterThanOrEqual(0);
    const syncBody = sql.slice(syncStart);

    // 禁止在 sync 內出現 p_allow_downgrade := true 或具名傳入
    expect(syncBody).not.toMatch(/p_allow_downgrade\s*:=\s*true/i);
    expect(syncBody).not.toMatch(/cat_upsert_\w+_stage_assignment\([^;]*p_allow_downgrade/i);

    // 兩處 PERFORM upsert 應為 8 引數形式（檔註解亦聲明故意不傳）
    expect(syncBody).toMatch(/故意不傳 p_allow_downgrade/);
    const performTranslate = syncBody.match(
      /PERFORM public\.cat_upsert_translate_stage_assignment\(\s*[^)]+\)/g,
    );
    const performReview = syncBody.match(
      /PERFORM public\.cat_upsert_review_stage_assignment\(\s*[^)]+\)/g,
    );
    expect(performTranslate?.length).toBeGreaterThanOrEqual(1);
    expect(performReview?.length).toBeGreaterThanOrEqual(1);
    for (const call of [...(performTranslate || []), ...(performReview || [])]) {
      expect(call).not.toMatch(/allow_downgrade/i);
    }
  });
});
