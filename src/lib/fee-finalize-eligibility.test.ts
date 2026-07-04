import { describe, it, expect } from "vitest";
import { getFinalizeEligibility, resolveAssigneeEmail } from "./fee-finalize-eligibility";
import { defaultClientInfo, type TranslatorFee } from "@/data/fee-mock-data";
import type { SelectOption } from "@/stores/select-options-store";

function baseFee(overrides: Partial<TranslatorFee> = {}): TranslatorFee {
  return {
    id: "fee-1",
    title: "測試費用",
    assignee: "譯者甲",
    status: "draft",
    internalNote: "",
    taskItems: [],
    clientInfo: { ...defaultClientInfo, rateConfirmed: true },
    notes: [],
    editLogs: [],
    createdBy: "pm-1",
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

const assigneeOptions: SelectOption[] = [
  { id: "opt-1", label: "譯者甲", email: "translator-a@example.com", color: "blue" },
  { id: "opt-2", label: "譯者乙", email: "translator-b@example.com", color: "green" },
];

describe("resolveAssigneeEmail", () => {
  it("依 label 找到對應 option 時回傳其 email", () => {
    expect(resolveAssigneeEmail("譯者甲", assigneeOptions)).toBe("translator-a@example.com");
  });

  it("依 email 本身找到對應 option 時回傳同一 email", () => {
    expect(resolveAssigneeEmail("translator-b@example.com", assigneeOptions)).toBe("translator-b@example.com");
  });

  it("找不到對應 option 時原樣回傳輸入值", () => {
    expect(resolveAssigneeEmail("不存在的人", assigneeOptions)).toBe("不存在的人");
  });

  it("options 為空陣列時原樣回傳輸入值", () => {
    expect(resolveAssigneeEmail("譯者甲", [])).toBe("譯者甲");
  });
});

describe("getFinalizeEligibility", () => {
  const emptyNoFeeMap = new Map<string, boolean>();

  it("欄位齊備（已選譯者＋費率無誤）→ eligible", () => {
    const result = getFinalizeEligibility(baseFee(), { assigneeOptions, noFeeByEmail: emptyNoFeeMap });
    expect(result).toEqual({ ok: true });
  });

  it("status 非 draft（已開立）→ not eligible，理由為已開立", () => {
    const result = getFinalizeEligibility(baseFee({ status: "finalized" }), {
      assigneeOptions,
      noFeeByEmail: emptyNoFeeMap,
    });
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("已向譯者開立") });
  });

  it("未選譯者（空字串）→ not eligible，理由為請先選擇譯者", () => {
    const result = getFinalizeEligibility(baseFee({ assignee: "" }), {
      assigneeOptions,
      noFeeByEmail: emptyNoFeeMap,
    });
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("請先選擇譯者") });
  });

  it("譯者欄位僅有空白字元 → 視同未選擇", () => {
    const result = getFinalizeEligibility(baseFee({ assignee: "   " }), {
      assigneeOptions,
      noFeeByEmail: emptyNoFeeMap,
    });
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("請先選擇譯者") });
  });

  it("clientInfo 為 undefined（未初始化）→ 視同未勾選費率無誤", () => {
    const result = getFinalizeEligibility(baseFee({ clientInfo: undefined }), {
      assigneeOptions,
      noFeeByEmail: emptyNoFeeMap,
    });
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("費率無誤") });
  });

  it("未勾選費率無誤且非不開單譯者 → not eligible", () => {
    const result = getFinalizeEligibility(
      baseFee({ clientInfo: { ...defaultClientInfo, rateConfirmed: false } }),
      { assigneeOptions, noFeeByEmail: emptyNoFeeMap }
    );
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("費率無誤") });
  });

  it("不開單譯者（noFeeByEmail=true）即使未勾選費率無誤也 eligible", () => {
    const noFeeMap = new Map([["translator-a@example.com", true]]);
    const result = getFinalizeEligibility(
      baseFee({ clientInfo: { ...defaultClientInfo, rateConfirmed: false } }),
      { assigneeOptions, noFeeByEmail: noFeeMap }
    );
    expect(result).toEqual({ ok: true });
  });

  it("noFeeByEmail 查無該 email（Map 未命中）預設視為需開單譯者", () => {
    const result = getFinalizeEligibility(
      baseFee({ clientInfo: { ...defaultClientInfo, rateConfirmed: false } }),
      { assigneeOptions, noFeeByEmail: new Map([["other@example.com", true]]) }
    );
    expect(result).toEqual({ ok: false, reason: expect.any(String) });
  });
});
