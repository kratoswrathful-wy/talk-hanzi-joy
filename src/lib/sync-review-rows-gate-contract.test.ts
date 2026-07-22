/**
 * 工項 1：sync SQL 契約——review_rows 非空即分段；不讀 cases.reviewer；不傳 allow_downgrade。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = resolve(
  process.cwd(),
  "supabase/migrations/20260722160000_cat_wf_sync_review_rows_gate.sql",
);

describe("工項1：sync review_rows 閘門契約", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const syncStart = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.sync_cat_workflow_assignments_for_case",
  );
  const syncBody = sql.slice(syncStart);

  it("函式存在且可擷取本體", () => {
    expect(syncStart).toBeGreaterThanOrEqual(0);
    expect(syncBody.length).toBeGreaterThan(500);
  });

  it("review 閘門為 review_rows 非空 array（不要求 multi_collab）", () => {
    expect(syncBody).toMatch(
      /jsonb_typeof\(v_review_rows\)\s*=\s*'array'\s+AND\s+jsonb_array_length\(v_review_rows\)\s*>\s*0/i,
    );
    // 不得再用 multi_collab AND review_rows 當唯一閘門
    expect(syncBody).not.toMatch(
      /coalesce\(v_multi_collab,\s*false\)\s+AND\s+jsonb_typeof\(v_review_rows\)\s*=\s*'array'/i,
    );
  });

  it("collab_row_id 來自 review_rows 列 id", () => {
    expect(syncBody).toMatch(/v_collab_row_id\s*:=\s*nullif\(trim\(v_row->>'id'\),\s*''\)/);
    expect(syncBody).toMatch(
      /cat_upsert_review_stage_assignment\(\s*v_file_id,\s*v_assignee_id,\s*v_collab_row_id/i,
    );
  });

  it("不再有 cases.reviewer fallback upsert（NULL collab）", () => {
    expect(syncBody).not.toMatch(/v_case_reviewer/);
    expect(syncBody).not.toMatch(
      /cat_upsert_review_stage_assignment\(\s*v_file_id,\s*v_assignee_id,\s*NULL,\s*NULL/i,
    );
  });

  it("凡走 review_rows 即清理 stale／NULL", () => {
    expect(syncBody).toMatch(/凡走 review_rows 路徑即清理/);
    expect(syncBody).toMatch(/a\.collab_row_id IS NULL/);
  });

  it("sync 內 upsert 不傳 p_allow_downgrade", () => {
    expect(syncBody).not.toMatch(/p_allow_downgrade\s*:=\s*true/i);
    expect(syncBody).toMatch(/故意不傳 p_allow_downgrade/);
    const performReview = syncBody.match(
      /PERFORM public\.cat_upsert_review_stage_assignment\(\s*[^)]+\)/g,
    );
    expect(performReview?.length).toBeGreaterThanOrEqual(1);
    for (const call of performReview || []) {
      expect(call).not.toMatch(/allow_downgrade/i);
    }
  });

  it("translate 多人閘門仍依 multi_collab（零變動錨點）", () => {
    expect(syncBody).toMatch(
      /coalesce\(v_multi_collab,\s*false\)\s+AND\s+jsonb_typeof\(v_collab_rows\)\s*=\s*'array'/i,
    );
  });
});
