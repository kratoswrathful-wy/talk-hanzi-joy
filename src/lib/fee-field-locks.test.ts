import { describe, it, expect } from "vitest";
import { getFieldLock, getMultiSelectFieldLock, type FeeFieldLockContext } from "./fee-field-locks";
import { defaultClientInfo, type TranslatorFee } from "@/data/fee-mock-data";

function baseFee(overrides: Partial<TranslatorFee> = {}): TranslatorFee {
  return {
    id: "fee-1",
    title: "測試費用",
    assignee: "譯者甲",
    status: "draft",
    internalNote: "",
    taskItems: [],
    clientInfo: { ...defaultClientInfo },
    notes: [],
    editLogs: [],
    createdBy: "pm-1",
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

const emptyCtx: FeeFieldLockContext = { linkedTranslatorInvoiceIds: [], linkedClientInvoiceIds: [] };

describe("getFieldLock", () => {
  it("title：已開立稿費條時鎖定", () => {
    const result = getFieldLock(baseFee({ status: "finalized" }), "title", emptyCtx);
    expect(result.locked).toBe(true);
    expect(result.reason).toContain("已向譯者開立稿費條");
  });

  it("title：草稿狀態不鎖定", () => {
    expect(getFieldLock(baseFee(), "title", emptyCtx)).toEqual({ locked: false, reason: "" });
  });

  it("status：已列入稿費請款單時鎖定", () => {
    const ctx: FeeFieldLockContext = { linkedTranslatorInvoiceIds: ["inv-1"], linkedClientInvoiceIds: [] };
    const result = getFieldLock(baseFee(), "status", ctx);
    expect(result.locked).toBe(true);
    expect(result.reason).toContain("稿費請款單");
  });

  it("assignee：已開立稿費條時鎖定", () => {
    const result = getFieldLock(baseFee({ status: "finalized" }), "assignee", emptyCtx);
    expect(result.locked).toBe(true);
  });

  it("assignee：已勾選費率無誤時鎖定（即使仍是草稿）", () => {
    const fee = baseFee({ clientInfo: { ...defaultClientInfo, rateConfirmed: true } });
    const result = getFieldLock(fee, "assignee", emptyCtx);
    expect(result.locked).toBe(true);
    expect(result.reason).toContain("費率無誤");
  });

  it("assignee：草稿且未勾選費率無誤時不鎖定", () => {
    expect(getFieldLock(baseFee(), "assignee", emptyCtx).locked).toBe(false);
  });

  it("internalNote：已擷取內容（非空）時鎖定，優先於其他鎖定條件", () => {
    const result = getFieldLock(baseFee({ internalNote: "案件 ABC" }), "internalNote", emptyCtx);
    expect(result.locked).toBe(true);
    expect(result.reason).toContain("已擷取完畢");
  });

  it("internalNote：為空但頁面有其他鎖定欄位（已開立）時鎖定，理由不同", () => {
    const result = getFieldLock(baseFee({ status: "finalized", internalNote: "" }), "internalNote", emptyCtx);
    expect(result.locked).toBe(true);
    expect(result.reason).toContain("目前有鎖定欄位");
  });

  it("internalNote：為空且無其他鎖定欄位時不鎖定", () => {
    expect(getFieldLock(baseFee({ internalNote: "" }), "internalNote", emptyCtx).locked).toBe(false);
  });

  it("client：已列入客戶請款單時鎖定", () => {
    const ctx: FeeFieldLockContext = { linkedTranslatorInvoiceIds: [], linkedClientInvoiceIds: ["cinv-1"] };
    expect(getFieldLock(baseFee(), "client", ctx).locked).toBe(true);
  });

  it("client：已勾選對帳完成時鎖定", () => {
    const fee = baseFee({ clientInfo: { ...defaultClientInfo, reconciled: true } });
    expect(getFieldLock(fee, "client", emptyCtx).locked).toBe(true);
  });

  it("client：未列入請款單且未對帳時不鎖定", () => {
    expect(getFieldLock(baseFee(), "client", emptyCtx).locked).toBe(false);
  });

  it("reconciled：已列入客戶請款單時鎖定", () => {
    const ctx: FeeFieldLockContext = { linkedTranslatorInvoiceIds: [], linkedClientInvoiceIds: ["cinv-1"] };
    expect(getFieldLock(baseFee(), "reconciled", ctx).locked).toBe(true);
  });

  it("sameCase：永不鎖定", () => {
    const fee = baseFee({ status: "finalized", clientInfo: { ...defaultClientInfo, reconciled: true, rateConfirmed: true } });
    const ctx: FeeFieldLockContext = { linkedTranslatorInvoiceIds: ["a"], linkedClientInvoiceIds: ["b"] };
    expect(getFieldLock(fee, "sameCase", ctx)).toEqual({ locked: false, reason: "" });
  });

  it("未知欄位名稱回傳未鎖定（default 分支）", () => {
    expect(getFieldLock(baseFee(), "不存在的欄位", emptyCtx)).toEqual({ locked: false, reason: "" });
  });
});

describe("getMultiSelectFieldLock", () => {
  it("多筆中僅一筆鎖定時，整體視為鎖定，理由帶出該筆標題", () => {
    const fees: TranslatorFee[] = [
      baseFee({ id: "f1", title: "費用一" }),
      baseFee({ id: "f2", title: "費用二", status: "finalized" }),
    ];
    const result = getMultiSelectFieldLock(fees, "assignee", () => emptyCtx);
    expect(result.locked).toBe(true);
    expect(result.reason).toContain("費用二");
  });

  it("全部未鎖定時整體視為未鎖定", () => {
    const fees: TranslatorFee[] = [baseFee({ id: "f1" }), baseFee({ id: "f2" })];
    const result = getMultiSelectFieldLock(fees, "assignee", () => emptyCtx);
    expect(result).toEqual({ locked: false, reason: "" });
  });

  it("空陣列時視為未鎖定", () => {
    expect(getMultiSelectFieldLock([], "assignee", () => emptyCtx)).toEqual({ locked: false, reason: "" });
  });

  it("依各筆分別取得 context（getContext 逐筆呼叫）", () => {
    const fees: TranslatorFee[] = [baseFee({ id: "f1" }), baseFee({ id: "f2" })];
    const contextByFeeId: Record<string, FeeFieldLockContext> = {
      f1: emptyCtx,
      f2: { linkedTranslatorInvoiceIds: [], linkedClientInvoiceIds: ["cinv-1"] },
    };
    const result = getMultiSelectFieldLock(fees, "client", (fee) => contextByFeeId[fee.id]);
    expect(result.locked).toBe(true);
    expect(result.reason).toContain(fees[1].title);
  });

  it("未命名稿費單時理由使用預設文字", () => {
    const fees: TranslatorFee[] = [baseFee({ title: "", status: "finalized" })];
    const result = getMultiSelectFieldLock(fees, "title", () => emptyCtx);
    expect(result.reason).toContain("未命名稿費單");
  });
});
