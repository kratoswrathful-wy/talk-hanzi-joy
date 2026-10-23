import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = resolve(
  process.cwd(),
  "supabase/migrations/20261023140000_task002_shared_row_both_stages.sql",
);

describe("TASK-002 同一列翻譯與審稿可並存", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("拿掉只准一筆的列編號唯一索引，改為列編號加階段", () => {
    expect(sql).toMatch(/drop index if exists public\.cat_stage_assignments_collab_row_uidx/i);
    expect(sql).toMatch(/cat_stage_assignments_collab_row_stage_uidx/);
    expect(sql).toMatch(/\(collab_row_id,\s*file_workflow_stage_id\)/);
  });

  it("審稿寫入只找審稿階段", () => {
    expect(sql).toMatch(/file_workflow_stage_id = v_review_stage_id/);
    expect(sql).not.toMatch(
      /where collab_row_id = v_collab_row_id\s+limit 1/i,
    );
  });
});
