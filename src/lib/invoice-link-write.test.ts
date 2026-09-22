import { describe, expect, it } from "vitest";
import {
  classifyInvoiceWriteCertainty,
  decideInvoiceLinkCleanup,
  findLocalReusableInvoiceId,
  findReusableInvoiceId,
  forgetUnconfirmedInvoiceId,
  invoiceWithoutClaimedFees,
  isInvoiceLinkAlreadyExists,
  interpretInvoiceDeleteResult,
  invoiceLinkFailureMessage,
  peekUnconfirmedInvoiceId,
  rememberUnconfirmedInvoiceId,
} from "./invoice-link-write";

describe("classifyInvoiceWriteCertainty", () => {
  it("明確拒絕是 definite", () => {
    expect(classifyInvoiceWriteCertainty({ code: "23503", message: "fk" })).toBe("definite");
  });

  it("逾時／中斷是 unknown", () => {
    expect(classifyInvoiceWriteCertainty(new Error("Failed to fetch"))).toBe("unknown");
    expect(classifyInvoiceWriteCertainty(new Error("timeout"))).toBe("unknown");
  });
});

describe("decideInvoiceLinkCleanup", () => {
  it("關聯被拒才允許嘗試刪空單", () => {
    expect(decideInvoiceLinkCleanup({ code: "23503", message: "fk" })).toEqual({
      action: "delete",
      reason: "link_rejected",
    });
  });

  it("回應遺失不得刪單", () => {
    expect(decideInvoiceLinkCleanup(new Error("Failed to fetch"))).toEqual({
      action: "keep",
      reason: "link_unknown",
    });
  });
});

describe("interpretInvoiceDeleteResult", () => {
  it("有刪回 id 才算確定刪掉", () => {
    expect(interpretInvoiceDeleteResult(null, [{ id: "inv-1" }])).toEqual({ kind: "deleted" });
  });

  it("刪除沒回列則當不明，不得宣稱清理完成", () => {
    expect(interpretInvoiceDeleteResult(null, [])).toEqual({ kind: "unknown" });
  });

  it("刪除逾時是 unknown", () => {
    expect(interpretInvoiceDeleteResult(new Error("abort"), [{ id: "inv-1" }]).kind).toBe("unknown");
  });
});

describe("findReusableInvoiceId", () => {
  it("重試同一組費用沿用已存在的單", () => {
    expect(
      findReusableInvoiceId(
        [
          { invoiceId: "inv-1", feeId: "f1" },
          { invoiceId: "inv-1", feeId: "f2" },
        ],
        ["f1", "f2"],
      ),
    ).toBe("inv-1");
  });

  it("沒有完整重疊就不得沿用", () => {
    expect(
      findReusableInvoiceId([{ invoiceId: "inv-1", feeId: "f1" }], ["f1", "f2"]),
    ).toBeNull();
  });
});

describe("findLocalReusableInvoiceId", () => {
  it("本機已有同一組費用的單就沿用，排除這次新建的識別", () => {
    expect(
      findLocalReusableInvoiceId(
        [
          { id: "inv-keep", feeIds: ["f1"] },
          { id: "inv-new", feeIds: ["f1"] },
        ],
        ["f1"],
        "inv-new",
      ),
    ).toBe("inv-keep");
  });
});

describe("unconfirmed invoice reuse", () => {
  it("關聯不明後記住單號，重試沿用且本機不得宣稱已掛費用", () => {
    const map = new Map<string, string>();
    rememberUnconfirmedInvoiceId(map, ["f1"], "inv-keep");
    expect(peekUnconfirmedInvoiceId(map, ["f1"])).toBe("inv-keep");
    expect(invoiceWithoutClaimedFees({ id: "inv-keep", feeIds: ["f1"] })).toEqual({
      id: "inv-keep",
      feeIds: [],
    });
    forgetUnconfirmedInvoiceId(map, ["f1"]);
    expect(peekUnconfirmedInvoiceId(map, ["f1"])).toBeNull();
  });
});

describe("isInvoiceLinkAlreadyExists", () => {
  it("唯一鍵衝突視為已掛上", () => {
    expect(isInvoiceLinkAlreadyExists({ code: "23505", message: "duplicate" })).toBe(true);
    expect(isInvoiceLinkAlreadyExists({ code: "23503" })).toBe(false);
  });
});

describe("invoiceLinkFailureMessage", () => {
  it("不明結果要求重整、不要再新建", () => {
    expect(invoiceLinkFailureMessage({ action: "keep", reason: "link_unknown" })).toMatch(/請勿再按/);
  });
});
