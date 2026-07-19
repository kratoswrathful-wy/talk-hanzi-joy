/**
 * 工項 F：sync SQL 契約——單人案 reviewer fallback；review 清理僅 multi；不傳 allow_downgrade。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = resolve(
  process.cwd(),
  "supabase/migrations/20260719150000_cat_wf_sync_review_single_fallback.sql",
);

describe("工項 F：sync review 單人 fallback 契約", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const syncStart = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.sync_cat_workflow_assignments_for_case",
  );
  const syncBody = sql.slice(syncStart);

  it("函式存在且可擷取本體", () => {
    expect(syncStart).toBeGreaterThanOrEqual(0);
    expect(syncBody.length).toBeGreaterThan(500);
  });

  it("SELECT 含 cases.reviewer（單人 fallback 來源）", () => {
    expect(syncBody).toMatch(/SELECT\s+multi_collab[\s\S]*?\breviewer\b/i);
  });

  it("單人 fallback 呼叫 review upsert（整檔 NULL collab）", () => {
    expect(syncBody).toMatch(/cases\.reviewer|v_case_reviewer/i);
    expect(syncBody).toMatch(
      /cat_upsert_review_stage_assignment\(\s*v_file_id,\s*v_assignee_id,\s*NULL,\s*NULL/i,
    );
  });

  it("review 清理 DELETE 註解／結構標明僅多人", () => {
    expect(syncBody).toMatch(/僅多人案執行清理/);
    // multi 條件包住 review_rows 路徑
    expect(syncBody).toMatch(
      /coalesce\(v_multi_collab,\s*false\)\s+AND\s+jsonb_typeof\(v_review_rows\)\s*=\s*'array'/i,
    );
  });

  it("sync 內 upsert 不傳 p_allow_downgrade", () => {
    expect(syncBody).not.toMatch(/p_allow_downgrade\s*:=\s*true/i);
    expect(syncBody).not.toMatch(/cat_upsert_\w+_stage_assignment\([^;]*p_allow_downgrade/i);
    expect(syncBody).toMatch(/故意不傳 p_allow_downgrade/);
    const performReview = syncBody.match(
      /PERFORM public\.cat_upsert_review_stage_assignment\(\s*[^)]+\)/g,
    );
    expect(performReview?.length).toBeGreaterThanOrEqual(2); // multi + single fallback
    for (const call of performReview || []) {
      expect(call).not.toMatch(/allow_downgrade/i);
    }
  });
});
