import { describe, it, expect } from "vitest";
import { getFieldLock, getMultiSelectFieldLock, type FeeFieldLockContext } from "./fee-field-locks";
import { defaultClientInfo, type TranslatorFee } from "@/data/fee-mock-data";

function makeFee(overrides: Partial<TranslatorFee> = {}): TranslatorFee {
  return {
    id: "fee-1",
    title: "PO_test",
    assignee: "譯者甲",
    status: "draft",
    internalNote: "",
    taskItems: [],
    clientInfo: { ...defaultClientInfo },
    notes: [],
    editLogs: [],
    createdBy: "pm-1",
    createdAt: "2026-07-04T00:00:00.000Z",
    ...overrides,
  };
}

const noLinks: FeeFieldLockContext = { linkedTranslatorInvoiceIds: [], linkedClientInvoiceIds: [] };

describe("getFieldLock", () => {
  it("正常路徑：無任何限制條件時所有欄位皆解鎖", () => {
    const fee = makeFee();
    for (const field of ["title", "status", "assignee", "client", "contact", "reconciled", "invoiced", "sameCase"]) {
      expect(getFieldLock(fee, field, noLinks).locked).toBe(false);
    }
  });

  it("title：已開立稿費條（finalized）時鎖定", () => {
    const fee = makeFee({ status: "finalized" });
    const result = getFieldLock(fee, "title", noLinks);
    expect(result.locked).toBe(true);
    expect(result.reason).toContain("已向譯者開立稿費條");
  });

  it("status：已列入稿費請款單時鎖定，不受其他條件影響", () => {
    const fee = makeFee();
    const ctx: FeeFieldLockContext = { linkedTranslatorInvoiceIds: ["inv-1"], linkedClientInvoiceIds: [] };
    const result = getFieldLock(fee, "status", ctx);
    expect(result.locked).toBe(true);
    expect(result.reason).toContain("稿費請款單");
  });

  it("assignee：已開立或已勾選費率無誤時鎖定", () => {
    expect(getFieldLock(makeFee({ status: "finalized" }), "assignee", noLinks).locked).toBe(true);
    expect(
      getFieldLock(makeFee({ clientInfo: { ...defaultClientInfo, rateConfirmed: true } }), "assignee", noLinks).locked
    ).toBe(true);
    expect(getFieldLock(makeFee(), "assignee", noLinks).locked).toBe(false);
  });

  it("internalNote：已擷取過（非空字串）時直接鎖定，不看其他欄位狀態", () => {
    const fee = makeFee({ internalNote: "案件 A" });
    expect(getFieldLock(fee, "internalNote", noLinks).locked).toBe(true);
  });

  it("internalNote：尚未擷取（空字串）但頁面上有其他鎖定欄位時仍鎖定", () => {
    const fee = makeFee({ internalNote: "", clientInfo: { ...defaultClientInfo, reconciled: true } });
    const result = getFieldLock(fee, "internalNote", noLinks);
    expect(result.locked).toBe(true);
    expect(result.reason).toContain("頁面上目前有鎖定欄位");
  });

  it("internalNote：尚未擷取且無其他鎖定欄位時解鎖", () => {
    const fee = makeFee({ internalNote: "" });
    expect(getFieldLock(fee, "internalNote", noLinks).locked).toBe(false);
  });

  it("client／contact／clientCaseId／clientPoNumber／dispatchRoute：已列入客戶請款單或對帳完成時鎖定", () => {
    for (const field of ["client", "contact", "clientCaseId", "clientPoNumber", "dispatchRoute"]) {
      const feeReconciled = makeFee({ clientInfo: { ...defaultClientInfo, reconciled: true } });
      expect(getFieldLock(feeReconciled, field, noLinks).locked).toBe(true);

      const ctxInInvoice: FeeFieldLockContext = { linkedTranslatorInvoiceIds: [], linkedClientInvoiceIds: ["cinv-1"] };
      expect(getFieldLock(makeFee(), field, ctxInInvoice).locked).toBe(true);

      expect(getFieldLock(makeFee(), field, noLinks).locked).toBe(false);
    }
  });

  it("rateConfirmed：已列入稿費請款單或已開立時鎖定", () => {
    const ctxInInvoice: FeeFieldLockContext = { linkedTranslatorInvoiceIds: ["inv-1"], linkedClientInvoiceIds: [] };
    expect(getFieldLock(makeFee(), "rateConfirmed", ctxInInvoice).locked).toBe(true);
    expect(getFieldLock(makeFee({ status: "finalized" }), "rateConfirmed", noLinks).locked).toBe(true);
    expect(getFieldLock(makeFee(), "rateConfirmed", noLinks).locked).toBe(false);
  });

  it("reconciled／invoiced：僅受「已列入客戶請款單」影響", () => {
    const ctxInInvoice: FeeFieldLockContext = { linkedTranslatorInvoiceIds: [], linkedClientInvoiceIds: ["cinv-1"] };
    expect(getFieldLock(makeFee(), "reconciled", ctxInInvoice).locked).toBe(true);
    expect(getFieldLock(makeFee(), "invoiced", ctxInInvoice).locked).toBe(true);
    // 即使已開立、費率無誤，也不影響這兩個欄位（未列入客戶請款單時仍可編輯）
    expect(getFieldLock(makeFee({ status: "finalized" }), "reconciled", noLinks).locked).toBe(false);
  });

  it("sameCase：恆為解鎖", () => {
    expect(getFieldLock(makeFee({ status: "finalized" }), "sameCase", noLinks).locked).toBe(false);
  });

  it("邊界值：未知欄位名稱走 default 分支，回傳解鎖", () => {
    expect(getFieldLock(makeFee(), "不存在的欄位", noLinks).locked).toBe(false);
  });

  it("邊界值：clientInfo 為 undefined 時不拋錯，視同 rateConfirmed/reconciled 皆為 false", () => {
    const fee = makeFee({ clientInfo: undefined });
    expect(() => getFieldLock(fee, "assignee", noLinks)).not.toThrow();
    expect(getFieldLock(fee, "assignee", noLinks).locked).toBe(false);
  });
});

describe("getMultiSelectFieldLock", () => {
  it("多筆皆解鎖時：整體解鎖", () => {
    const fees = [makeFee({ id: "f1" }), makeFee({ id: "f2" })];
    const result = getMultiSelectFieldLock(fees, "title", () => noLinks);
    expect(result.locked).toBe(false);
  });

  it("任一筆鎖定即整體鎖定，並在原因中帶出該筆標題", () => {
    const fees = [makeFee({ id: "f1", title: "第一筆" }), makeFee({ id: "f2", title: "第二筆", status: "finalized" })];
    const result = getMultiSelectFieldLock(fees, "title", () => noLinks);
    expect(result.locked).toBe(true);
    expect(result.reason).toContain("第二筆");
  });

  it("依 getContext 回傳的不同 context 個別判斷", () => {
    const fees = [makeFee({ id: "f1" }), makeFee({ id: "f2" })];
    const ctxByFee = new Map<string, FeeFieldLockContext>([
      ["f1", noLinks],
      ["f2", { linkedTranslatorInvoiceIds: [], linkedClientInvoiceIds: ["cinv-1"] }],
    ]);
    const result = getMultiSelectFieldLock(fees, "reconciled", (fee) => ctxByFee.get(fee.id) ?? noLinks);
    expect(result.locked).toBe(true);
  });

  it("空陣列：整體解鎖", () => {
    const result = getMultiSelectFieldLock([], "title", () => noLinks);
    expect(result.locked).toBe(false);
  });
});
