import { describe, expect, it, vi } from "vitest";
import type { SimplePersistedLog } from "@/lib/edit-log-coalesce";
import {
  addFeesThenPersistLog,
  handleInvoiceDetailAddFees,
  invoiceFeeAddLogFeedback,
  persistInvoiceFeeAddLog,
} from "./invoice-fee-add-log";
import { invoiceLinkAddFromConfirmed } from "./invoice-link-add";

function log(description: string): SimplePersistedLog {
  return {
    id: "log-1",
    changedBy: "PM",
    description,
    timestamp: "2026/10/17 20:08 (UTC+8)",
    fieldKey: "費用",
  };
}

describe("persistInvoiceFeeAddLog", () => {
  it("尚未開始記錄不誤報失敗、不寫入", async () => {
    const persist = vi.fn(async () => ({ error: null }));
    const result = await persistInvoiceFeeAddLog({
      started: false,
      previousLogs: [],
      append: () => [log("新增 1 筆: D")],
      persist,
      revert: () => undefined,
    });
    expect(result.attempted).toBe(false);
    expect(result.saved).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    expect(invoiceFeeAddLogFeedback(result).toast).toBe("none");
  });

  it("關聯已成功、紀錄明確失敗時撤回本機偽裝，提示不得再收費用", async () => {
    let current: SimplePersistedLog[] = [];
    const previous: SimplePersistedLog[] = [];
    const result = await persistInvoiceFeeAddLog({
      started: true,
      previousLogs: previous,
      append: () => {
        current = [log("費用  → 新增 1 筆: D")];
        return current;
      },
      persist: async () => ({ error: { code: "42501", message: "rls" } }),
      revert: (logs) => {
        current = logs;
      },
    });
    expect(result.saved).toBe(false);
    expect(result.uncertain).toBe(false);
    expect(current).toEqual([]);
    expect(invoiceFeeAddLogFeedback(result).message).toContain("費用已收錄");
    expect(invoiceFeeAddLogFeedback(result).message).toContain("變更紀錄未儲存");
    expect(invoiceFeeAddLogFeedback(result).message).not.toContain("費用關聯未寫入");
  });

  it("紀錄回應遺失標示不明，不撤回以免蓋掉可能已存的一筆", async () => {
    let current: SimplePersistedLog[] = [];
    const result = await persistInvoiceFeeAddLog({
      started: true,
      previousLogs: [],
      append: () => {
        current = [log("費用  → 新增 1 筆: D")];
        return current;
      },
      persist: async () => ({ error: new Error("Failed to fetch") }),
      revert: () => {
        current = [];
      },
    });
    expect(result.uncertain).toBe(true);
    expect(result.saved).toBe(false);
    expect(current).toHaveLength(1);
    expect(invoiceFeeAddLogFeedback(result).message).toContain("結果待確認");
  });

  it("已有相同紀錄時不重複寫入", async () => {
    const existing = [log("費用  → 新增 1 筆: D")];
    const persist = vi.fn(async () => ({ error: null }));
    const result = await persistInvoiceFeeAddLog({
      started: true,
      previousLogs: existing,
      append: () => [...existing, log("費用  → 新增 1 筆: D")],
      persist,
      revert: () => undefined,
    });
    expect(result.attempted).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });
});

describe("addFeesThenPersistLog", () => {
  it("呼叫端：費用仍在、紀錄失敗、不會再呼叫收錄", async () => {
    const add = vi.fn(async () => invoiceLinkAddFromConfirmed(["a"], [], ["a"]));
    const persist = vi.fn(async () => ({ error: { code: "PGRST116", message: "0 rows" } }));
    const out = await addFeesThenPersistLog({
      add,
      started: true,
      previousLogs: [],
      append: () => [log("費用  → 新增 1 筆: A")],
      persist,
      revert: () => undefined,
    });
    expect(out.fee.added).toEqual(["a"]);
    expect(out.fee.missing).toEqual([]);
    expect(out.log.saved).toBe(false);
    expect(add).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe("handleInvoiceDetailAddFees 明細頁呼叫端", () => {
  it("關聯成功、紀錄零列：費用仍在、提示紀錄失敗、不再收錄", async () => {
    const add = vi.fn(async () => invoiceLinkAddFromConfirmed(["fee-d"], [], ["fee-d"]));
    const persist = vi.fn(async () => ({ error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } }));
    const revert = vi.fn();
    const out = await handleInvoiceDetailAddFees({
      add,
      started: true,
      previousLogs: [],
      addedDescription: (addedIds) => ({
        field: "費用",
        oldValue: "",
        newValue: `新增 ${addedIds.length} 筆: D`,
      }),
      append: (_field, _old, neu) => [log(neu)],
      persist,
      revert,
    });
    expect(out.fee.added).toEqual(["fee-d"]);
    expect(out.closePicker).toBe(true);
    expect(out.log.saved).toBe(false);
    expect(out.log.uncertain).toBe(false);
    expect(add).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(revert).toHaveBeenCalledTimes(1);
    expect(invoiceFeeAddLogFeedback(out.log).message).toContain("費用已收錄");
    expect(invoiceFeeAddLogFeedback(out.log).message).not.toContain("費用關聯未寫入");
  });

  it("紀錄回應遺失標不明、不撤回；再操作時相同紀錄不重寫、不重收", async () => {
    const add = vi.fn(async () => invoiceLinkAddFromConfirmed(["fee-d"], [], ["fee-d"]));
    const persist = vi.fn(async () => ({ error: new Error("Failed to fetch") }));
    let current: SimplePersistedLog[] = [];
    const first = await handleInvoiceDetailAddFees({
      add,
      started: true,
      previousLogs: [],
      addedDescription: () => ({ field: "費用", oldValue: "", newValue: "新增 1 筆: D" }),
      append: () => {
        current = [log("新增 1 筆: D")];
        return current;
      },
      persist,
      revert: () => {
        current = [];
      },
    });
    expect(first.log.uncertain).toBe(true);
    expect(current).toHaveLength(1);
    const retryPersist = vi.fn(async () => ({ error: null }));
    const second = await handleInvoiceDetailAddFees({
      add,
      started: true,
      previousLogs: current,
      addedDescription: () => ({ field: "費用", oldValue: "", newValue: "新增 1 筆: D" }),
      append: () => [...current, log("新增 1 筆: D")],
      persist: retryPersist,
      revert: () => undefined,
    });
    expect(add).toHaveBeenCalledTimes(2);
    expect(second.fee.added).toEqual(["fee-d"]);
    expect(retryPersist).not.toHaveBeenCalled();
    expect(second.log.attempted).toBe(false);
  });

  it("尚未開始記錄不誤報失敗", async () => {
    const persist = vi.fn(async () => ({ error: { code: "42501" } }));
    const out = await handleInvoiceDetailAddFees({
      add: async () => invoiceLinkAddFromConfirmed(["fee-d"], [], ["fee-d"]),
      started: false,
      previousLogs: [],
      addedDescription: () => ({ field: "費用", oldValue: "", newValue: "新增 1 筆: D" }),
      append: () => [log("新增 1 筆: D")],
      persist,
      revert: () => undefined,
    });
    expect(out.log.attempted).toBe(false);
    expect(persist).not.toHaveBeenCalled();
    expect(invoiceFeeAddLogFeedback(out.log).toast).toBe("none");
  });
});
