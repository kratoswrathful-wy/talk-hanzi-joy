import { describe, expect, it } from "vitest";
import {
  invoiceLinkAddFeedback,
  invoiceLinkAddFromConfirmed,
  persistAttemptedInvoiceLinks,
} from "./invoice-link-add";

describe("invoiceLinkAddFromConfirmed", () => {
  it("分開已存在、這次新加入、未成功", () => {
    const result = invoiceLinkAddFromConfirmed(["a", "b", "c"], ["a"], ["a", "b"]);
    expect(result.already).toEqual(["a"]);
    expect(result.added).toEqual(["b"]);
    expect(result.missing).toEqual(["c"]);
  });
});

describe("invoiceLinkAddFeedback", () => {
  it("不把部分成功說成關聯完全沒寫入", () => {
    const result = invoiceLinkAddFromConfirmed(["a", "b"], [], ["a"], new Error("23505"));
    const fb = invoiceLinkAddFeedback(result);
    expect(fb.message).toContain("部分費用已收錄");
    expect(fb.message).not.toContain("費用關聯未寫入");
    expect(fb.closePicker).toBe(false);
  });
});

describe("persistAttemptedInvoiceLinks", () => {
  it("整批 insert 因 A 撞唯一鍵失敗時，回讀後只補仍缺的 B", async () => {
    const inserts: string[][] = [];
    const confirmed = new Set<string>(["a"]);
    const result = await persistAttemptedInvoiceLinks({
      attempted: ["a", "b"],
      insert: async (ids) => {
        inserts.push([...ids]);
        if (ids.includes("a") && ids.includes("b")) return { error: { code: "23505" } };
        for (const id of ids) confirmed.add(id);
        return { error: null };
      },
      fetchConfirmed: async (ids) => ({ ids: ids.filter((id) => confirmed.has(id)), error: null }),
    });
    expect(inserts).toEqual([["a", "b"], ["b"]]);
    expect(result.confirmed).toEqual(["a", "b"]);
    expect(result.error).toBeNull();
    expect(result.uncertain).toBe(false);
  });

  it("第二次只補缺列仍失敗時，畫面不得把未寫入的 B 當成成功", async () => {
    const confirmed = new Set<string>(["a"]);
    const result = await persistAttemptedInvoiceLinks({
      attempted: ["a", "b"],
      insert: async (ids) => {
        if (ids.includes("b") && !ids.includes("a")) return { error: { code: "23503" } };
        return { error: { code: "23505" } };
      },
      fetchConfirmed: async (ids) => ({ ids: ids.filter((id) => confirmed.has(id)), error: null }),
    });
    expect(result.confirmed).toEqual(["a"]);
    expect(result.error).toEqual({ code: "23503" });
    expect(result.uncertain).toBe(false);
  });

  it("第一次整批成功就不回讀、不重送", async () => {
    let fetches = 0;
    const result = await persistAttemptedInvoiceLinks({
      attempted: ["a", "b"],
      insert: async () => ({ error: null }),
      fetchConfirmed: async () => {
        fetches += 1;
        return { ids: [], error: null };
      },
    });
    expect(fetches).toBe(0);
    expect(result.confirmed).toEqual(["a", "b"]);
  });
});
