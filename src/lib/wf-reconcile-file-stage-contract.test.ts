/**
 * TASK-002：整檔步驟重算 RPC 契約——依全部有效分段衍生，不接受前端自報完成。
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const migPath = path.join(
  root,
  "supabase/migrations/20261019181000_task002_reconcile_file_workflow_stage.sql",
);

describe("TASK-002：整檔步驟重算 SQL 契約", () => {
  const sql = fs.readFileSync(migPath, "utf8");

  it("新增 cat_reconcile_file_workflow_stage_from_assignments", () => {
    expect(sql).toMatch(
      /create or replace function public\.cat_reconcile_file_workflow_stage_from_assignments/i,
    );
  });

  it("不接受前端傳入目標狀態", () => {
    expect(sql).not.toMatch(/p_status\b/);
    expect(sql).toMatch(/p_allow_downgrade boolean default false/);
  });

  it("用該步全部指派列重算，全部完成才標 completed", () => {
    expect(sql).toMatch(/from public\.cat_stage_assignments sa/);
    expect(sql).toMatch(/v_completed = v_n/);
    expect(sql).toMatch(/v_next := 'completed'/);
  });

  it("未受派者不可呼叫", () => {
    expect(sql).toMatch(/sa\.assignee_user_id = v_uid/);
    expect(sql).toMatch(/not_authorized/);
  });
});
