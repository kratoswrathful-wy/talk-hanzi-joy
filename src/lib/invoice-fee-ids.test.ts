import { describe, expect, it } from "vitest";
import { groupUniqueFeeIdsByInvoice, uniqueFeeIds } from "./invoice-fee-ids";

describe("uniqueFeeIds", () => {
  it("去掉同一張單的重複關聯並維持先出現順序", () => {
    expect(uniqueFeeIds(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
  });

  it("略過空字串", () => {
    expect(uniqueFeeIds(["", "a", ""])).toEqual(["a"]);
  });

  it("注入歷史重複讀取時，顯示與加總只認每個費用一次", () => {
    expect(uniqueFeeIds(["a", "a", "b"])).toEqual(["a", "b"]);
  });
});

describe("groupUniqueFeeIdsByInvoice", () => {
  it("SYL 這類 40 筆關聯 6 個費用只留下 6 個", () => {
    const feeIds = ["f1", "f2", "f3", "f4", "f5", "f6"];
    const links = Array.from({ length: 40 }, (_, i) => ({
      invoiceId: "syl",
      feeId: feeIds[i % 6],
    }));
    const grouped = groupUniqueFeeIdsByInvoice(links);
    expect(grouped.get("syl")).toEqual(feeIds);
  });

  it("不同請款單互不混入", () => {
    const grouped = groupUniqueFeeIdsByInvoice([
      { invoiceId: "a", feeId: "f1" },
      { invoiceId: "b", feeId: "f1" },
      { invoiceId: "a", feeId: "f1" },
    ]);
    expect(grouped.get("a")).toEqual(["f1"]);
    expect(grouped.get("b")).toEqual(["f1"]);
  });

  it("同一張單重複關聯列只留下不同費用", () => {
    const grouped = groupUniqueFeeIdsByInvoice([
      { invoiceId: "inv", feeId: "a" },
      { invoiceId: "inv", feeId: "a" },
      { invoiceId: "inv", feeId: "b" },
    ]);
    expect(grouped.get("inv")).toEqual(["a", "b"]);
  });
});
