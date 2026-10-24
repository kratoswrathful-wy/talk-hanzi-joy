import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const nextFile = resolve(
  repoRoot,
  "supabase/migrations/20261024103000_task002_review_complete_keep_wrapper.sql",
);
const cancelFile = resolve(
  repoRoot,
  "supabase/migrations/20261024160000_task002_cancel_case_review_row.sql",
);
const deferredOld = resolve(
  repoRoot,
  "supabase/migrations-deferred/20261021160000_task002_shared_review_complete.sql",
);
const liveOld = resolve(
  repoRoot,
  "supabase/migrations/20261021160000_task002_shared_review_complete.sql",
);

describe("TASK-002 review-complete wrapper contract", () => {
  it("keeps the strip-wrapper file out of the live migration folder", () => {
    expect(existsSync(liveOld)).toBe(false);
    expect(existsSync(deferredOld)).toBe(true);
    const oldSql = readFileSync(deferredOld, "utf8");
    expect(oldSql).toMatch(/create or replace function public\.complete_case_review_row/);
    expect(oldSql).toMatch(/errcode = '40001'/);
    expect(oldSql).not.toMatch(/assert_maintenance_write_allowed/);
  });

  it("replaces only the private impl and restores the public maintenance wrapper", () => {
    const sql = readFileSync(nextFile, "utf8");
    expect(sql).toMatch(/create or replace function private\.complete_case_review_row_impl/);
    expect(sql).toMatch(/perform private\.assert_maintenance_write_allowed\(\)/);
    expect(sql).toMatch(
      /return private\.complete_case_review_row_impl\(p_case_id, p_review_row_id, p_expected_revision\)/,
    );
    expect(sql).toMatch(/errcode = 'P0001'/);
    expect(sql).not.toMatch(/errcode = '40001'/);
    expect(sql).toMatch(/status not in \('dispatched', 'task_completed', 'delivered', 'feedback'\)/);
    expect(sql).toMatch(
      /revoke all on function private\.complete_case_review_row_impl\(uuid, text, bigint\)/,
    );
    expect(sql).toMatch(/authenticated, service_role/);
  });

  it("cancel review keeps the public maintenance wrapper and rejects delivered rows", () => {
    const sql = readFileSync(cancelFile, "utf8");
    expect(sql).toMatch(/create or replace function private\.cancel_case_review_row_impl/);
    expect(sql).toMatch(/perform private\.assert_maintenance_write_allowed\(\)/);
    expect(sql).toMatch(
      /return private\.cancel_case_review_row_impl\(p_case_id, p_review_row_id, p_expected_revision\)/,
    );
    expect(sql).toMatch(/errcode = 'P0001'/);
    expect(sql).toMatch(/review_row_delivered_locked/);
    expect(sql).toMatch(/'reviewTaskCompleted', false/);
    expect(sql).not.toMatch(/'reviewTaskCompleted', false,\s*'taskCompleted', false/);
    expect(sql).toMatch(
      /revoke all on function private\.cancel_case_review_row_impl\(uuid, text, bigint\)/,
    );
  });
});
