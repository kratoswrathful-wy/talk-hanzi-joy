/**
 * 工項 4：SQL 契約——completed→in_progress 無 allow_downgrade 一律擋。
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const migPath = path.join(
  root,
  "supabase/migrations/20260722170000_cat_wf_block_completed_to_in_progress.sql",
);

describe("工項4：completed→in_progress SQL 契約", () => {
  const sql = fs.readFileSync(migPath, "utf8");

  it("REPLACE cat_resolve_effective_upsert_workflow_status", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.cat_resolve_effective_upsert_workflow_status/,
    );
  });

  it("含 completed→in_progress 擋法", () => {
    expect(sql).toMatch(/v_requested = 'in_progress'/);
    expect(sql).toMatch(/v_existing = 'completed'/);
    expect(sql).toMatch(/RETURN 'completed'/);
  });

  it("不改 upsert 簽名／不刪函式", () => {
    expect(sql).not.toMatch(/DROP FUNCTION.*cat_upsert_/i);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.cat_upsert_/);
  });
});
