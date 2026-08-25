import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/lib/cat-cloud-rpc.ts"),
  "utf8",
);

function actionBlock(action: string, nextAction: string): string {
  const start = source.indexOf(`case "${action}"`);
  const end = source.indexOf(`case "${nextAction}"`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("CAT 模組層變更紀錄環境隔離", () => {
  it("新增紀錄時寫入目前環境", () => {
    const block = actionBlock("db.addModuleLog", "db.getModuleLogs");

    expect(block).toContain('.from("cat_module_logs").insert({');
    expect(block).toMatch(/\bat:\s*nowIso\(\),\s*\n\s*env,/);
  });

  it("讀取紀錄時先套用目前環境條件", () => {
    const block = actionBlock("db.getModuleLogs", "db.createProject");

    expect(block).toContain('.from("cat_module_logs")');
    expect(block).toContain('.eq("env", env)');
    expect(block.indexOf('.eq("env", env)')).toBeLessThan(
      block.indexOf('.order("at"'),
    );
  });
});
