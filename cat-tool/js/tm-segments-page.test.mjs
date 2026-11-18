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
  vm.runInContext(`${dbSource.slice(start, end)}\nthis.pageTmSegmentRows = pageTmSegmentRows;\nthis.createTmSegmentSnapshotStore = createTmSegmentSnapshotStore;`, context);
  return context;
}

describe("離線翻譯記憶分頁", () => {
  const loaded = loadPager();
  const pageTmSegmentRows = loaded.pageTmSegmentRows;
  const createTmSegmentSnapshotStore = loaded.createTmSegmentSnapshotStore;

  it("單機 DBService 在團隊覆寫之前就有分頁與計數", () => {
    const offline = dbSource.slice(0, dbSource.indexOf("function enableTeamCloudProvider("));
    expect(offline).toContain("async getTMSegmentsPage(tmId, offsetOrOpts = 0, limit = 1000)");
    expect(offline).toContain("async beginTmSegmentSnapshot(tmId)");
    expect(offline).toContain("async countTMSegments(tmId)");
    expect(offline).toContain("return pageTmSegmentRows(rows, offsetOrOpts, limit);");
    const team = dbSource.slice(dbSource.indexOf("function enableTeamCloudProvider("));
    expect(team).toContain("DBService.beginTmSegmentSnapshot = async () =>");
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

  it("超過兩頁時只讀一次來源，分頁不再整庫重讀", () => {
    const store = createTmSegmentSnapshotStore();
    const rows = Array.from({ length: 2001 }, (_, index) => ({ id: index + 1, sourceText: `s${index + 1}` }));
    store.begin("tm-a", rows);
    const seen = [];
    let cursor = null;
    let pages = 0;
    do {
      const page = store.page("tm-a", { afterId: cursor, limit: 1000 });
      expect(page.sourceReads).toBe(1);
      seen.push(...page.segments.map((row) => row.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor != null);
    expect(pages).toBe(3);
    expect(seen).toEqual(rows.map((row) => row.id));
    expect(store.stats("tm-a").sourceReads).toBe(1);
    expect(store.page("tm-b", { limit: 1000 })).toBe(null);
    store.end("tm-a");
    expect(store.page("tm-a", { limit: 1000 })).toBe(null);
    store.begin("tm-a", rows.concat([{ id: 2002, sourceText: "added" }]));
    const refreshed = store.page("tm-a", { afterId: 2001, limit: 1000 });
    expect(refreshed.segments.map((row) => row.id)).toEqual([2002]);
    expect(refreshed.nextCursor).toBe(null);
    store.invalidate("tm-a");
    expect(store.stats("tm-a").active).toBe(false);
  });

  it("空記憶庫的快照分頁是空的", () => {
    const store = createTmSegmentSnapshotStore();
    store.begin("empty", []);
    const page = store.page("empty", { limit: 1000 });
    expect(page.segments).toEqual([]);
    expect(page.nextCursor).toBe(null);
    expect(page.sourceReads).toBe(1);
  });
});
