import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const dbPath = resolve(process.cwd(), "cat-tool/db.js");
const dbSource = readFileSync(dbPath, "utf8");

function loadPager() {
  const start = dbSource.indexOf("function pageTmSegmentRows(");
  const end = dbSource.indexOf("function sortSegmentsByImportOrder(", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${dbSource.slice(start, end)}\nthis.pageTmSegmentRows = pageTmSegmentRows;`, context);
  return context.pageTmSegmentRows;
}

describe("離線翻譯記憶分頁", () => {
  const pageTmSegmentRows = loadPager();

  it("單機 DBService 在團隊覆寫之前就有分頁與計數", () => {
    const offline = dbSource.slice(0, dbSource.indexOf("function enableTeamCloudProvider("));
    expect(offline).toContain("async getTMSegmentsPage(tmId, offsetOrOpts = 0, limit = 1000)");
    expect(offline).toContain("async countTMSegments(tmId)");
    expect(offline).toContain("return pageTmSegmentRows(rows, offsetOrOpts, limit);");
  });

  it("依 id 遞增分頁，並用最後一筆 id 當下一頁游標", () => {
    const rows = [
      { id: 3, sourceText: "c" },
      { id: 1, sourceText: "a" },
      { id: 2, sourceText: "b" },
      { id: 4, sourceText: "d" },
    ];
    const first = pageTmSegmentRows(rows, { afterId: null, limit: 2 });
    expect(first.segments.map((row) => row.id)).toEqual([1, 2]);
    expect(first.nextCursor).toBe(2);
    const second = pageTmSegmentRows(rows, { afterId: first.nextCursor, limit: 2 });
    expect(second.segments.map((row) => row.id)).toEqual([3, 4]);
    expect(second.nextCursor).toBe(null);
  });

  it("沒有剩餘資料時不給游標", () => {
    const only = pageTmSegmentRows([{ id: 7, sourceText: "only" }], { limit: 1000 });
    expect(only.segments).toHaveLength(1);
    expect(only.nextCursor).toBe(null);
  });
});
