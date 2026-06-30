import { describe, it, expect } from "vitest";
import { mergeClientInfoPatch } from "./ai-agent-bridge";
import { defaultClientInfo, type ClientInfo } from "@/data/fee-mock-data";

const existingFromReport: ClientInfo = {
  ...defaultClientInfo,
  client: "ECI",
  contact: "Eman W.",
  clientCaseId: "Locpick - Job J148-167 offer + Job J148-168 offer + Job J148-169 offer",
  dispatchRoute: "V 信箱",
  clientPoNumber: "",
  reconciled: false,
  rateConfirmed: false,
  invoiced: false,
  clientTaskItems: [
    {
      id: "ci-case-1782797873621-0",
      taskType: "翻譯",
      billingUnit: "字",
      unitCount: 507,
      clientPrice: 0.05,
    },
  ],
};

describe("mergeClientInfoPatch", () => {
  it("案例 A：部分 patch 保留未提及欄位與 clientTaskItems（Claude 報告）", () => {
    const result = mergeClientInfoPatch(existingFromReport, {
      clientPoNumber: "ECI_JAS_202606_018788",
      reconciled: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.client).toBe("ECI");
    expect(result.data.contact).toBe("Eman W.");
    expect(result.data.clientCaseId).toBe(existingFromReport.clientCaseId);
    expect(result.data.dispatchRoute).toBe("V 信箱");
    expect(result.data.clientPoNumber).toBe("ECI_JAS_202606_018788");
    expect(result.data.reconciled).toBe(true);
    expect(result.data.clientTaskItems).toHaveLength(1);
    expect(result.data.clientTaskItems[0].unitCount).toBe(507);
    expect(result.data.clientTaskItems[0].clientPrice).toBe(0.05);
    expect(result.data.clientTaskItems[0].id).toBe("ci-case-1782797873621-0");
  });

  it("案例 B：可寫入 clientTaskItems（整包取代）", () => {
    const result = mergeClientInfoPatch(existingFromReport, {
      clientTaskItems: [
        { taskType: "翻譯", billingUnit: "字", unitCount: 200, clientPrice: 0.08 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.clientTaskItems).toHaveLength(1);
    expect(result.data.clientTaskItems[0].unitCount).toBe(200);
    expect(result.data.clientTaskItems[0].clientPrice).toBe(0.08);
    expect(result.data.client).toBe("ECI");
  });

  it("案例 C：以 default 為底的部分 patch 不清空其他預設欄位", () => {
    const result = mergeClientInfoPatch(defaultClientInfo, {
      client: "CCJK",
      reconciled: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.client).toBe("CCJK");
    expect(result.data.reconciled).toBe(true);
    expect(result.data.contact).toBe("");
    expect(result.data.clientTaskItems[0].unitCount).toBe(0);
    expect(result.data.isFirstFee).toBe(false);
  });

  it("clientCaseLink 可部分合併", () => {
    const existing: ClientInfo = {
      ...defaultClientInfo,
      clientCaseLink: { url: "https://example.com/case", label: "舊標籤" },
    };
    const result = mergeClientInfoPatch(existing, {
      clientCaseLink: { label: "新標籤" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.clientCaseLink).toEqual({
      url: "https://example.com/case",
      label: "新標籤",
    });
  });

  it("非法 taskType 回傳 allowed", () => {
    const result = mergeClientInfoPatch(existingFromReport, {
      clientTaskItems: [{ taskType: "不存在的類型", billingUnit: "字", unitCount: 1, clientPrice: 1 }],
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.allowed).toBeDefined();
      expect(result.allowed!.length).toBeGreaterThan(0);
    }
  });
});
