import { describe, it, expect } from "vitest";
import { getFinalizeEligibility, resolveAssigneeEmail } from "./fee-finalize-eligibility";
import { defaultClientInfo, type TranslatorFee } from "@/data/fee-mock-data";
import type { SelectOption } from "@/stores/select-options-store";

function makeFee(overrides: Partial<TranslatorFee> = {}): TranslatorFee {
  return {
    id: "fee-1",
    title: "PO_test",
    assignee: "譯者甲",
    status: "draft",
    internalNote: "",
    taskItems: [],
    clientInfo: { ...defaultClientInfo, rateConfirmed: true },
    notes: [],
    editLogs: [],
    createdBy: "pm-1",
    createdAt: "2026-07-04T00:00:00.000Z",
    ...overrides,
  };
}

function makeOption(overrides: Partial<SelectOption> = {}): SelectOption {
  return { id: "opt-1", label: "譯者甲", email: "a@example.com", color: "blue", ...overrides };
}

describe("resolveAssigneeEmail", () => {
  it("以 label 找到對應 option 時回傳其 email", () => {
    const options = [makeOption()];
    expect(resolveAssigneeEmail("譯者甲", options)).toBe("a@example.com");
  });

  it("以 email 本身當 assignee 也能找到對應 option", () => {
    const options = [makeOption()];
    expect(resolveAssigneeEmail("a@example.com", options)).toBe("a@example.com");
  });

  it("找不到對應 option 時，原樣回傳 assignee", () => {
    const options = [makeOption()];
    expect(resolveAssigneeEmail("不存在的人", options)).toBe("不存在的人");
  });

  it("option 沒有 email 欄位時，回退為原 assignee", () => {
    const options = [makeOption({ email: undefined })];
    expect(resolveAssigneeEmail("譯者甲", options)).toBe("譯者甲");
  });
});

describe("getFinalizeEligibility", () => {
  const baseCtx = { assigneeOptions: [makeOption()], noFeeByEmail: new Map<string, boolean>() };

  it("欄位齊備（狀態草稿、有譯者、費率無誤）：eligible", () => {
    const fee = makeFee();
    const result = getFinalizeEligibility(fee, baseCtx);
    expect(result).toEqual({ ok: true });
  });

  it("狀態非 draft（已開立過）：not eligible，原因為重複開立", () => {
    const fee = makeFee({ status: "finalized" });
    const result = getFinalizeEligibility(fee, baseCtx);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toContain("已向譯者開立稿費條");
  });

  it("未選擇譯者（空字串）：not eligible", () => {
    const fee = makeFee({ assignee: "" });
    const result = getFinalizeEligibility(fee, baseCtx);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toContain("請先選擇譯者");
  });

  it("assignee 僅有空白字元：視同未選擇譯者", () => {
    const fee = makeFee({ assignee: "   " });
    const result = getFinalizeEligibility(fee, baseCtx);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toContain("請先選擇譯者");
  });

  it("未勾選費率無誤（一般譯者）：not eligible", () => {
    const fee = makeFee({ clientInfo: { ...defaultClientInfo, rateConfirmed: false } });
    const result = getFinalizeEligibility(fee, baseCtx);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toContain("費率無誤");
  });

  it("clientInfo 為 null／undefined（邊界值）：視同未勾選費率無誤", () => {
    const fee = makeFee({ clientInfo: undefined });
    const result = getFinalizeEligibility(fee, baseCtx);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toContain("費率無誤");
  });

  it("不開單譯者（no_fee=true）：即使未勾選費率無誤也 eligible", () => {
    const fee = makeFee({ clientInfo: { ...defaultClientInfo, rateConfirmed: false } });
    const ctx = { assigneeOptions: [makeOption()], noFeeByEmail: new Map([["a@example.com", true]]) };
    const result = getFinalizeEligibility(fee, ctx);
    expect(result).toEqual({ ok: true });
  });

  it("noFeeByEmail 查無此人（Map 為空）：預設視為需要費率確認", () => {
    const fee = makeFee({ clientInfo: { ...defaultClientInfo, rateConfirmed: false } });
    const result = getFinalizeEligibility(fee, baseCtx);
    expect(result.ok).toBe(false);
  });
});
