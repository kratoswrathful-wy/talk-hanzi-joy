import { describe, it, expect } from "vitest";
import {
  filterEditLogsFeeDetail,
  filterFeeListEditLogs,
  filterEditLogsCase,
  resolveFeeDetailItemKey,
  resolveCaseEditLogItemKey,
  type CheckPermFn,
} from "./edit-log-permission-filter";
import type { SimplePersistedLog } from "@/lib/edit-log-coalesce";
import type { EditLog } from "@/data/fee-mock-data";

/** 白名單（譯者 view-only 可見）之 fee_management 項目 key */
const TRANSLATOR_VISIBLE_ITEMS = new Set([
  "fee_detail_title",
  "fee_detail_assignee",
  "fee_detail_internalNote",
  "fee_detail_taskType",
  "fee_detail_billingUnit",
  "fee_detail_unitPrice",
  "fee_detail_unitCount",
  "fee_detail_addItem",
  "fee_detail_deleteItem",
  "fee_detail_rateConfirmed",
]);

/** 譯者（view-only）checkPerm stub：僅白名單項目回傳 true，禁區（客戶／營收等）一律 false */
const translatorCheckPerm: CheckPermFn = (_moduleKey, itemKey) => TRANSLATOR_VISIBLE_ITEMS.has(itemKey);

/** PM／執行長 checkPerm stub：全模組全項目皆可檢視 */
const pmCheckPerm: CheckPermFn = () => true;

function log(overrides: Partial<SimplePersistedLog>): SimplePersistedLog {
  return {
    id: "log-1",
    changedBy: "someone",
    description: "",
    timestamp: "2026-07-04T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveFeeDetailItemKey", () => {
  it("譯者欄位（中文 fieldKey）對應 fee_detail_assignee", () => {
    expect(resolveFeeDetailItemKey("譯者", "譯者 A → B")).toBe("fee_detail_assignee");
  });

  it("英文 fieldKey 'assignee' 亦對應 fee_detail_assignee", () => {
    expect(resolveFeeDetailItemKey("assignee", "assignee A → B")).toBe("fee_detail_assignee");
  });

  it("客戶欄位對應 fee_detail_client（禁區）", () => {
    expect(resolveFeeDetailItemKey("客戶", "客戶 A → B")).toBe("fee_detail_client");
  });

  it("營收總額欄位對應 fee_detail_clientRevenue（禁區，靠 description 回退）", () => {
    // fieldKey 為 undefined，只能靠 description 判斷
    expect(resolveFeeDetailItemKey(undefined, "營收總額 100 → 200")).toBe("fee_detail_clientRevenue");
  });

  it("費率無誤欄位對應 fee_detail_rateConfirmed（白名單）", () => {
    expect(resolveFeeDetailItemKey("費率", "費率無誤 否 → 是")).toBe("fee_detail_rateConfirmed");
  });

  it("未知 fieldKey 且 description 無關鍵字時退回標題", () => {
    expect(resolveFeeDetailItemKey(undefined, "無法辨識的描述文字")).toBe("fee_detail_title");
  });

  it("fieldKey 為空白字串時視同 undefined，仍能靠 description 回退辨識", () => {
    expect(resolveFeeDetailItemKey("  ", "對帳完成 否 → 是")).toBe("fee_detail_reconciled");
  });
});

describe("filterEditLogsFeeDetail — W10 F1 重現案例", () => {
  const mixedLogs: SimplePersistedLog[] = [
    log({ id: "1", fieldKey: "譯者", description: "譯者 甲 → 乙" }), // 白名單
    log({ id: "2", fieldKey: "標題", description: "標題 A → B" }), // 白名單
    log({ id: "3", fieldKey: "客戶", description: "客戶 ECI → CCJK" }), // 禁區
    log({ id: "4", fieldKey: undefined, description: "營收總額 100 → 200" }), // 禁區（description 回退）
    log({ id: "5", fieldKey: "費率", description: "費率無誤 否 → 是" }), // 白名單
    log({ id: "6", fieldKey: "聯絡人", description: "聯絡人 王 → 李" }), // 禁區
  ];

  it("譯者權限（view-only）下：白名單條目保留、禁區條目濾除", () => {
    const result = filterEditLogsFeeDetail(mixedLogs, translatorCheckPerm);
    expect(result.map((l) => l.id)).toEqual(["1", "2", "5"]);
  });

  it("PM 權限下：全部條目保留", () => {
    const result = filterEditLogsFeeDetail(mixedLogs, pmCheckPerm);
    expect(result).toHaveLength(mixedLogs.length);
    expect(result.map((l) => l.id)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("checkPerm 全部回傳 false 時（無任何模組檢視權限）結果為空陣列", () => {
    const noPerm: CheckPermFn = () => false;
    expect(filterEditLogsFeeDetail(mixedLogs, noPerm)).toEqual([]);
  });
});

describe("filterFeeListEditLogs", () => {
  const mixedList: EditLog[] = [
    { id: "1", author: "x", field: "譯者", oldValue: "甲", newValue: "乙", timestamp: "t1", fieldKey: "譯者" },
    { id: "2", author: "x", field: "客戶", oldValue: "ECI", newValue: "CCJK", timestamp: "t2", fieldKey: "客戶" },
  ];

  it("譯者權限下僅保留白名單欄位對應的列表事件", () => {
    const result = filterFeeListEditLogs(mixedList, translatorCheckPerm);
    expect(result.map((l) => l.id)).toEqual(["1"]);
  });

  it("PM 權限下全部保留", () => {
    const result = filterFeeListEditLogs(mixedList, pmCheckPerm);
    expect(result.map((l) => l.id)).toEqual(["1", "2"]);
  });
});

describe("resolveCaseEditLogItemKey", () => {
  it("已知欄位對應正確 item key", () => {
    expect(resolveCaseEditLogItemKey("translator")).toBe("case_detail_translator");
    expect(resolveCaseEditLogItemKey("client")).toBe("case_detail_client");
  });

  it("未知欄位回退為 case_detail_title", () => {
    expect(resolveCaseEditLogItemKey("這個欄位不存在")).toBe("case_detail_title");
  });

  it("fieldKey 為 undefined 時回退為 case_detail_title", () => {
    expect(resolveCaseEditLogItemKey(undefined)).toBe("case_detail_title");
  });
});

describe("filterEditLogsCase", () => {
  const caseLogs: SimplePersistedLog[] = [
    log({ id: "1", fieldKey: "translator", description: "譯者變更" }),
    log({ id: "2", fieldKey: "client", description: "客戶變更" }),
  ];

  it("依 checkPerm 保留／濾除對應項目", () => {
    const checkPerm: CheckPermFn = (_m, itemKey) => itemKey === "case_detail_translator";
    const result = filterEditLogsCase(caseLogs, checkPerm);
    expect(result.map((l) => l.id)).toEqual(["1"]);
  });

  it("checkPerm 全通過時保留全部", () => {
    expect(filterEditLogsCase(caseLogs, pmCheckPerm).map((l) => l.id)).toEqual(["1", "2"]);
  });
});
