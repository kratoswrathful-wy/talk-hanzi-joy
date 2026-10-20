/**
 * TASK-002：同檔受派者可讀全部階段指派——審稿完成鎖才能罩到隔壁譯者。
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const migPath = path.join(
  root,
  "supabase/migrations/20261020184000_task002_stage_assignment_coassignee_select.sql",
);

describe("TASK-002：同檔受派者可讀階段指派 SQL 契約", () => {
  const sql = fs.readFileSync(migPath, "utf8");

  it("新增 private.cat_uid_assigned_to_file 避免 RLS 自我參照", () => {
    expect(sql).toMatch(
      /create or replace function private\.cat_uid_assigned_to_file/i,
    );
    expect(sql).toMatch(/security definer/);
  });

  it("政策允許同檔其他受派者 SELECT", () => {
    expect(sql).toMatch(/private\.cat_uid_assigned_to_file/);
    expect(sql).toMatch(/drop policy if exists cat_stage_assignments_select_own_or_admin/);
    expect(sql).toMatch(/create policy cat_stage_assignments_select_own_or_admin/);
  });

  it("不開放寫入、不授給 anon", () => {
    expect(sql).not.toMatch(/for insert/i);
    expect(sql).not.toMatch(/for update/i);
    expect(sql).toMatch(/from public, anon/);
  });
});
