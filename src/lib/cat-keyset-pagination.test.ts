import { describe, it, expect } from "vitest";
import { sortMappedCatSegmentsByImportOrder } from "./cat-segment-import-order";
import { compareIdSets, nextKeysetCursor } from "./cat-keyset-pagination";

describe("sortMappedCatSegmentsByImportOrder", () => {
  it("orders by globalId then rowIdx then sheetName then colSrc then id", () => {
    const rows = [
      { id: "b", globalId: 2, rowIdx: 0, sheetName: "A", colSrc: "x" },
      { id: "a", globalId: 1, rowIdx: 0, sheetName: "A", colSrc: "x" },
      { id: "c", globalId: null, rowIdx: 1, sheetName: "A", colSrc: "x" },
      { id: "d", globalId: null, rowIdx: 0, sheetName: "B", colSrc: "x" },
    ];
    const sorted = sortMappedCatSegmentsByImportOrder(rows);
    expect(sorted.map((r) => r.id)).toEqual(["a", "b", "d", "c"]);
  });

  it("places null globalId after numbered ones", () => {
    const rows = [
      { id: "legacy", globalId: null, rowIdx: 0 },
      { id: "n1", globalId: 1, rowIdx: 99 },
    ];
    expect(sortMappedCatSegmentsByImportOrder(rows).map((r) => r.id)).toEqual(["n1", "legacy"]);
  });
});

describe("nextKeysetCursor", () => {
  it("returns null for short final page", () => {
    expect(nextKeysetCursor([{ id: "a" }, { id: "b" }], 1000)).toBeNull();
  });

  it("returns last id for full page", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    }));
    expect(nextKeysetCursor(rows, 1000)).toBe(rows[999].id);
  });
});

describe("compareIdSets", () => {
  it("detects identical sets", () => {
    const a = [{ id: "1" }, { id: "2" }];
    const b = [{ id: "2" }, { id: "1" }];
    const r = compareIdSets(a, b);
    expect(r.sameCount).toBe(true);
    expect(r.sameSet).toBe(true);
  });

  it("detects missing ids", () => {
    const r = compareIdSets([{ id: "1" }], [{ id: "1" }, { id: "2" }]);
    expect(r.sameSet).toBe(false);
    expect(r.onlyInB).toEqual(["2"]);
  });
});

describe("keyset pagination simulation", () => {
  it("walks all pages without gaps or duplicates for 1001 UUID rows", () => {
    const all = Array.from({ length: 1001 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      globalId: i + 1,
    }));
    // Sort by id ASC as DB would
    const byId = all.slice().sort((a, b) => a.id.localeCompare(b.id));
    const PAGE = 1000;
    const collected: typeof byId = [];
    let cursor: string | null = null;
    for (;;) {
      const start = cursor
        ? byId.findIndex((r) => r.id > cursor!) + 0
        : 0;
      const from = cursor ? byId.findIndex((r) => r.id > (cursor as string)) : 0;
      const page = byId.slice(from < 0 ? byId.length : from, (from < 0 ? byId.length : from) + PAGE);
      void start;
      collected.push(...page);
      cursor = nextKeysetCursor(page, PAGE);
      if (!cursor) break;
    }
    const cmp = compareIdSets(byId, collected);
    expect(cmp.sameCount).toBe(true);
    expect(cmp.sameSet).toBe(true);
    expect(sortMappedCatSegmentsByImportOrder(collected).map((r) => r.globalId)).toEqual(
      sortMappedCatSegmentsByImportOrder(byId).map((r) => r.globalId)
    );
  });
});
