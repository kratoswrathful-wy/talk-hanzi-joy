import { describe, expect, it } from "vitest";
import { fetchAllRestPages, restIncompleteReadError } from "./rest-page-fetch";

describe("fetchAllRestPages", () => {
  it("單頁不足一頁視為讀完", async () => {
    const result = await fetchAllRestPages(async () => ({ data: [{ id: "a" }, { id: "b" }], error: null }), 10);
    expect(result).toEqual({ ok: true, rows: [{ id: "a" }, { id: "b" }] });
  });

  it("跨過頁面邊界會把各頁接起來", async () => {
    const pages = [
      Array.from({ length: 3 }, (_, i) => ({ id: `p0-${i}` })),
      Array.from({ length: 3 }, (_, i) => ({ id: `p1-${i}` })),
      [{ id: "last" }],
    ];
    const result = await fetchAllRestPages(async (from, to) => {
      const page = Math.floor(from / 3);
      expect(to - from).toBe(2);
      return { data: pages[page] ?? [], error: null };
    }, 3);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows).toHaveLength(7);
  });

  it("中途失敗不把已讀列當成完整成功", async () => {
    const result = await fetchAllRestPages(async (from) => {
      if (from > 0) return { data: null, error: new Error("boom") };
      return { data: [{ id: "a" }, { id: "b" }, { id: "c" }], error: null };
    }, 3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.partialRows).toHaveLength(3);
      expect((result.error as Error).message).toBe("boom");
    }
  });

  it("空結果且無錯誤是真的零筆", async () => {
    const result = await fetchAllRestPages(async () => ({ data: [], error: null }));
    expect(result).toEqual({ ok: true, rows: [] });
  });

  it("讀到頁數上限仍滿頁則視為不完整", async () => {
    const result = await fetchAllRestPages(
      async () => ({ data: Array.from({ length: 2 }, (_, i) => ({ id: String(i) })), error: null }),
      2,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as Error).message).toBe(restIncompleteReadError().message);
      expect(result.partialRows).toHaveLength(100);
    }
  });
});
