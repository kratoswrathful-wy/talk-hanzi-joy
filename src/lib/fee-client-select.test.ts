import { describe, expect, it } from "vitest";
import { applyFeeClientSelection, shouldApplyClientDefaultRates } from "./fee-client-select";
import { defaultClientInfo } from "@/data/fee-mock-data";

const prices: Record<string, number> = { CCJK: 1.2, Other: 9 };
const translator: Record<number, number> = { 1.2: 0.8, 9: 6 };

const getClientPrice = (client: string) => prices[client];
const getTranslatorPrice = (cp: number) => translator[cp];

describe("shouldApplyClientDefaultRates", () => {
  it("空白改成有客戶才套預設", () => {
    expect(shouldApplyClientDefaultRates("", "CCJK")).toBe(true);
    expect(shouldApplyClientDefaultRates(undefined, "CCJK")).toBe(true);
  });

  it("相同客戶重播不套預設", () => {
    expect(shouldApplyClientDefaultRates("CCJK", "CCJK")).toBe(false);
  });

  it("使用者改選另一客戶才再套", () => {
    expect(shouldApplyClientDefaultRates("CCJK", "Other")).toBe(true);
  });
});

describe("applyFeeClientSelection", () => {
  it("第一次選客戶一次產出客戶與預設單價，不拆兩包", () => {
    const typed = {
      ...defaultClientInfo,
      client: "",
      clientTaskItems: [{ id: "ci-1", taskType: "翻譯" as const, billingUnit: "字" as const, unitCount: 3, clientPrice: 1500 }],
    };
    const tasks = [{ id: "ti-1", taskType: "翻譯" as const, billingUnit: "字" as const, unitCount: 3, unitPrice: 900 }];
    const patch = applyFeeClientSelection({
      clientInfo: typed,
      taskItems: tasks,
      clientName: "CCJK",
      getClientPrice,
      getTranslatorPrice,
    });
    expect(patch.clientInfo.client).toBe("CCJK");
    expect(patch.appliedDefaultRates).toBe(true);
    expect(patch.clientInfo.clientTaskItems[0]?.clientPrice).toBe(1.2);
    expect(patch.taskItems[0]?.unitPrice).toBe(0.8);
    expect(patch.clientInfo.clientTaskItems[0]?.unitCount).toBe(3);
  });

  it("相同客戶回灌不重套預設，保留手填單價", () => {
    const current = {
      ...defaultClientInfo,
      client: "CCJK",
      clientTaskItems: [{ id: "ci-1", taskType: "翻譯" as const, billingUnit: "字" as const, unitCount: 3, clientPrice: 1500 }],
    };
    const tasks = [{ id: "ti-1", taskType: "翻譯" as const, billingUnit: "字" as const, unitCount: 3, unitPrice: 900 }];
    const patch = applyFeeClientSelection({
      clientInfo: current,
      taskItems: tasks,
      clientName: "CCJK",
      getClientPrice,
      getTranslatorPrice,
    });
    expect(patch.appliedDefaultRates).toBe(false);
    expect(patch.clientInfo.clientTaskItems[0]?.clientPrice).toBe(1500);
    expect(patch.taskItems[0]?.unitPrice).toBe(900);
  });
});
