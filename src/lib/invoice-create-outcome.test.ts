import { describe, expect, it } from "vitest";
import {
  applyInvoiceCreateOutcome,
  invoiceCreateOutcomeFeedback,
  resolveInvoiceAfterDuplicateLink,
} from "./invoice-create-outcome";

describe("resolveInvoiceAfterDuplicateLink", () => {
  it("讀回失敗不把樂觀單據當完成", async () => {
    const result = await resolveInvoiceAfterDuplicateLink({
      wanted: ["a", "b"],
      fetchConfirmedInvoice: async () => null,
      persistRemaining: async () => ({ confirmed: ["a", "b"], error: null, uncertain: false }),
    });
    expect(result.complete).toBe(false);
    expect(result.uncertain).toBe(true);
    expect(result.invoice).toBeNull();
    expect(invoiceCreateOutcomeFeedback(result).navigate).toBe(false);
    expect(invoiceCreateOutcomeFeedback(result).message).toContain("結果待確認");
    expect(invoiceCreateOutcomeFeedback(result).message).not.toContain("費用關聯未寫入");
  });

  it("讀回單據成功但仍缺部分費用時，只補缺的、不宣告整批成功", async () => {
    const inserts: string[][] = [];
    const result = await resolveInvoiceAfterDuplicateLink({
      wanted: ["a", "b"],
      fetchConfirmedInvoice: async () => ({ id: "inv-1", feeIds: ["a"] }),
      persistRemaining: async (missing) => {
        inserts.push([...missing]);
        return { confirmed: [], error: { code: "23503" }, uncertain: false };
      },
    });
    expect(inserts).toEqual([["b"]]);
    expect(result.complete).toBe(false);
    expect(result.invoice?.id).toBe("inv-1");
    expect(result.missing).toEqual(["b"]);
    expect(invoiceCreateOutcomeFeedback(result).navigate).toBe(false);
  });

  it("補缺成功後才算完成", async () => {
    const result = await resolveInvoiceAfterDuplicateLink({
      wanted: ["a", "b"],
      fetchConfirmedInvoice: async () => ({ id: "inv-1", feeIds: ["a"] }),
      persistRemaining: async (missing) => ({ confirmed: missing, error: null, uncertain: false }),
    });
    expect(result.complete).toBe(true);
    expect(result.invoice?.feeIds).toEqual(["a", "b"]);
  });
});

describe("applyInvoiceCreateOutcome 呼叫端", () => {
  it("完整成功才導頁", () => {
    const ok = applyInvoiceCreateOutcome(
      { invoice: { id: "inv-1" }, complete: true, uncertain: false, missing: [] },
      "已建立客戶請款單",
    );
    expect(ok.navigate).toBe(true);
    expect(ok.invoiceId).toBe("inv-1");
    const incomplete = { invoice: { id: "inv-1", feeIds: ["a"] }, complete: false, uncertain: false, missing: ["b"] };
    const bad = applyInvoiceCreateOutcome(incomplete, "已建立客戶請款單");
    expect(bad.navigate).toBe(false);
    expect(invoiceCreateOutcomeFeedback(incomplete).message).not.toContain("費用關聯未寫入");
  });

  it("讀回失敗呼叫端不導頁、不當完成", () => {
    const applied = applyInvoiceCreateOutcome(
      { invoice: null, complete: false, uncertain: true, missing: ["a", "b"] },
      "已建立客戶請款單",
    );
    expect(applied.navigate).toBe(false);
    expect(applied.invoiceId).toBeNull();
  });
});

describe("恢復後同一張單", () => {
  it("第一次缺 B、第二次只補 B 且同一 id", async () => {
    const inserts: string[][] = [];
    const first = await resolveInvoiceAfterDuplicateLink({
      wanted: ["a", "b"],
      fetchConfirmedInvoice: async () => ({ id: "inv-keep", feeIds: ["a"] }),
      persistRemaining: async (missing) => {
        inserts.push([...missing]);
        return { confirmed: [], error: { message: "Failed to fetch" }, uncertain: true };
      },
    });
    expect(first.complete).toBe(false);
    expect(first.invoice?.id).toBe("inv-keep");
    const second = await resolveInvoiceAfterDuplicateLink({
      wanted: ["a", "b"],
      fetchConfirmedInvoice: async () => ({ id: "inv-keep", feeIds: ["a"] }),
      persistRemaining: async (missing) => {
        inserts.push([...missing]);
        return { confirmed: missing, error: null, uncertain: false };
      },
    });
    expect(inserts).toEqual([["b"], ["b"]]);
    expect(second.complete).toBe(true);
    expect(second.invoice?.id).toBe("inv-keep");
    expect(second.invoice?.feeIds).toEqual(["a", "b"]);
  });
});
