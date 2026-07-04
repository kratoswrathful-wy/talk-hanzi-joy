import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CaseRecord } from "@/data/case-types";
import type { SelectOption } from "@/stores/select-options-store";

const addFeeMock = vi.fn();
const getFeesMock = vi.fn<() => unknown[]>(() => []);
const getSortedOptionsMock = vi.fn<(fieldKey: string) => SelectOption[]>(() => []);
const addOptionMock = vi.fn();
const getClientPriceMock = vi.fn<(client: string, taskType: string, billingUnit?: string) => number | undefined>(() => 0);
const getTranslatorPriceMock = vi.fn<(clientPrice: number, taskType?: string, billingUnit?: string) => number | undefined>(() => 0);

vi.mock("@/stores/fee-store", () => ({
  feeStore: {
    addFee: (...args: unknown[]) => addFeeMock(...args),
    getFees: () => getFeesMock(),
  },
}));

vi.mock("@/stores/select-options-store", async () => {
  const actual = await vi.importActual<typeof import("@/stores/select-options-store")>("@/stores/select-options-store");
  return {
    ...actual,
    selectOptionsStore: {
      getSortedOptions: (...args: [string]) => getSortedOptionsMock(...args),
      addOption: (...args: unknown[]) => addOptionMock(...args),
    },
  };
});

vi.mock("@/stores/default-pricing-store", () => ({
  defaultPricingStore: {
    getClientPrice: (...args: [string, string, string?]) => getClientPriceMock(...args),
    getTranslatorPrice: (...args: [number, string?, string?]) => getTranslatorPriceMock(...args),
  },
}));

// 動態 import 需在 mock 設定完成後執行
const { generateFeesForCase, caseHasLinkedFees } = await import("./generate-case-fees");

function baseCase(overrides: Partial<CaseRecord> = {}): CaseRecord {
  return {
    id: "case-1",
    title: "Moncler 260321",
    status: "dispatched",
    client: "ECI",
    contact: "王小明",
    keyword: "",
    clientPoNumber: "",
    clientCaseLink: { url: "", label: "" },
    dispatchRoute: "",
    category: "",
    workType: [],
    workGroups: [],
    processNote: "",
    billingUnit: "字",
    unitCount: 0,
    inquiryNote: "",
    translator: ["譯者甲"],
    translationDeadline: null,
    reviewer: "",
    reviewDeadline: null,
    executionTool: "",
    toolFieldValues: {},
    catToolEnabled: false,
    tools: [],
    questionTools: [],
    deliveryMethod: "",
    deliveryMethodFiles: [],
    clientReceipt: "",
    clientReceiptFiles: [],
    customGuidelinesUrl: [],
    clientGuidelines: [],
    commonInfo: [],
    commonLinks: [],
    internalNoteForm: false,
    clientQuestionForm: false,
    workingFiles: [],
    otherLoginInfo: "",
    loginAccount: "",
    loginPassword: "",
    onlineToolProject: "",
    onlineToolFilename: "",
    sourceFiles: [],
    seriesReferenceMaterials: [],
    caseReferenceMaterials: [],
    referenceMaterials: [],
    questionForm: "",
    translatorFinal: [],
    internalReviewFinal: [],
    trackChanges: [],
    feeEntry: "",
    internalRecords: [],
    comments: [],
    internalComments: [],
    bodyContent: [],
    multiCollab: false,
    collabCount: 0,
    collabRows: [],
    declineRecords: [],
    iconUrl: "",
    createdBy: "pm-1",
    createdAt: "2026-03-21T00:00:00.000Z",
    updatedAt: "2026-03-21T00:00:00.000Z",
    inquirySlackRecords: [],
    ...overrides,
  };
}

beforeEach(() => {
  addFeeMock.mockClear();
  getSortedOptionsMock.mockReset().mockReturnValue([]);
  addOptionMock.mockClear();
  getClientPriceMock.mockReset().mockReturnValue(0);
  getTranslatorPriceMock.mockReset().mockReturnValue(0);
});

describe("generateFeesForCase", () => {
  it("單一譯者、單一 workGroup：只產生一筆稿費，欄位帶入案件資訊", () => {
    const caseData = baseCase({
      workGroups: [{ id: "wg-1", workType: "翻譯", billingUnit: "字", unitCount: 500 }],
    });
    getClientPriceMock.mockReturnValue(1.5);
    getTranslatorPriceMock.mockReturnValue(1.0);

    const result = generateFeesForCase(caseData, "pm-1");

    expect(result.feeCount).toBe(1);
    expect(result.feeIds).toHaveLength(1);
    expect(addFeeMock).toHaveBeenCalledTimes(1);

    const createdFee = addFeeMock.mock.calls[0][0];
    expect(createdFee.title).toBe("PO_Moncler 260321");
    expect(createdFee.assignee).toBe("譯者甲");
    expect(createdFee.status).toBe("draft");
    expect(createdFee.taskItems).toHaveLength(1);
    expect(createdFee.taskItems[0]).toMatchObject({ taskType: "翻譯", billingUnit: "字", unitCount: 500, unitPrice: 1.0 });
    expect(createdFee.clientInfo.client).toBe("ECI");
    expect(createdFee.clientInfo.contact).toBe("王小明");
    // 單一譯者不應帶入 sameCase／isFirstFee 群組標記
    expect(createdFee.clientInfo.sameCase).toBe(false);
  });

  it("多位譯者：第一筆為 isFirstFee，其餘為 notFirstFee，皆標記 sameCase", () => {
    const caseData = baseCase({
      translator: ["譯者甲", "譯者乙", "譯者丙"],
      workGroups: [{ id: "wg-1", workType: "翻譯", billingUnit: "字", unitCount: 300 }],
    });

    const result = generateFeesForCase(caseData, "pm-1");

    expect(result.feeCount).toBe(3);
    expect(addFeeMock).toHaveBeenCalledTimes(3);

    const firstFee = addFeeMock.mock.calls[0][0];
    const secondFee = addFeeMock.mock.calls[1][0];
    const thirdFee = addFeeMock.mock.calls[2][0];

    expect(firstFee.title).toBe("PO_Moncler 260321_01");
    expect(firstFee.assignee).toBe("譯者甲");
    expect(firstFee.clientInfo.isFirstFee).toBe(true);
    expect(firstFee.clientInfo.notFirstFee).toBe(false);
    expect(firstFee.clientInfo.sameCase).toBe(true);

    expect(secondFee.title).toBe("PO_Moncler 260321_02");
    expect(secondFee.assignee).toBe("譯者乙");
    expect(secondFee.clientInfo.isFirstFee).toBe(false);
    expect(secondFee.clientInfo.notFirstFee).toBe(true);

    expect(thirdFee.title).toBe("PO_Moncler 260321_03");
    expect(thirdFee.assignee).toBe("譯者丙");
  });

  it("workGroups 為空陣列時，退回使用案件層級 billingUnit／unitCount 建立單一預設群組", () => {
    const caseData = baseCase({ workGroups: [], billingUnit: "小時", unitCount: 10 });

    generateFeesForCase(caseData, "pm-1");

    const createdFee = addFeeMock.mock.calls[0][0];
    expect(createdFee.taskItems).toHaveLength(1);
    expect(createdFee.taskItems[0]).toMatchObject({ taskType: "翻譯", billingUnit: "小時", unitCount: 10 });
  });

  it("workType 含中文別名（審稿）時對應為「校對」任務類型", () => {
    const caseData = baseCase({
      workGroups: [{ id: "wg-1", workType: "審稿", billingUnit: "字", unitCount: 100 }],
    });

    generateFeesForCase(caseData, "pm-1");

    const createdFee = addFeeMock.mock.calls[0][0];
    expect(createdFee.taskItems[0].taskType).toBe("校對");
  });

  it("workType 完全無法辨識時原樣保留（供使用者事後修正）", () => {
    const caseData = baseCase({
      workGroups: [{ id: "wg-1", workType: "神秘任務類型", billingUnit: "字", unitCount: 100 }],
    });

    generateFeesForCase(caseData, "pm-1");

    const createdFee = addFeeMock.mock.calls[0][0];
    expect(createdFee.taskItems[0].taskType).toBe("神秘任務類型");
  });

  it("無譯者（translator 為空陣列）：assignee 為空字串，仍產生一筆草稿", () => {
    const caseData = baseCase({ translator: [] });

    const result = generateFeesForCase(caseData, "pm-1");

    expect(result.feeCount).toBe(1);
    const createdFee = addFeeMock.mock.calls[0][0];
    expect(createdFee.assignee).toBe("");
    expect(createdFee.title).toBe("PO_Moncler 260321");
  });

  it("案件 client 已存在選項清單中時不重複呼叫 addOption 新增", () => {
    getSortedOptionsMock.mockImplementation((fieldKey: string) => {
      if (fieldKey === "client") return [{ id: "opt-1", label: "ECI", color: "blue" }];
      return [];
    });
    const caseData = baseCase({ client: "ECI" });

    generateFeesForCase(caseData, "pm-1");

    const clientAddCalls = addOptionMock.mock.calls.filter((c) => c[0] === "client");
    expect(clientAddCalls).toHaveLength(0);
  });

  it("案件 client 尚未存在於選項清單時會呼叫 addOption 新增", () => {
    const caseData = baseCase({ client: "全新客戶" });

    generateFeesForCase(caseData, "pm-1");

    const clientAddCalls = addOptionMock.mock.calls.filter((c) => c[0] === "client");
    expect(clientAddCalls).toHaveLength(1);
    expect(clientAddCalls[0][1]).toBe("全新客戶");
  });

  it("譯者名稱可依 assignee 選項清單解析為顯示用 label（email 對應）", () => {
    getSortedOptionsMock.mockImplementation((fieldKey: string) => {
      if (fieldKey === "assignee") return [{ id: "opt-1", label: "譯者甲顯示名", email: "譯者甲", color: "blue" }];
      return [];
    });
    const caseData = baseCase({ translator: ["譯者甲"] });

    generateFeesForCase(caseData, "pm-1");

    const createdFee = addFeeMock.mock.calls[0][0];
    expect(createdFee.assignee).toBe("譯者甲顯示名");
  });
});

describe("caseHasLinkedFees", () => {
  it("已有 fee 的 internalNoteUrl 對應到該案件時回傳 true", () => {
    const caseId = "case-42";
    const caseUrl = `${window.location.origin}/cases/${caseId}`;
    getFeesMock.mockReturnValueOnce([{ id: "fee-1", internalNoteUrl: caseUrl }]);

    expect(caseHasLinkedFees(caseId)).toBe(true);
  });

  it("無任何 fee 對應該案件時回傳 false", () => {
    getFeesMock.mockReturnValueOnce([]);
    expect(caseHasLinkedFees("case-無關聯")).toBe(false);
  });
});
