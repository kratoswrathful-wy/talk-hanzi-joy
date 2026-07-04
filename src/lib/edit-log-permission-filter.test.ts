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

/**
 * 模擬 use-permissions.ts 的 checkPerm 行為：
 * - 模組本身不可見（visible: false）時，不論項目層級設定為何一律 false（即 W10 F1 根因）。
 * - 模組可見時，項目層級未指定者預設 true（沿用實際系統的預設放行）。
 */
function makeCheckPerm(
  config: Record<string, { visible: boolean; items?: Record<string, boolean> }>
): CheckPermFn {
  return (moduleKey, itemKey) => {
    const mod = config[moduleKey];
    if (!mod) return true;
    if (!mod.visible) return false;
    if (mod.items && itemKey in mod.items) return mod.items[itemKey];
    return true;
  };
}

function log(overrides: Partial<SimplePersistedLog>): SimplePersistedLog {
  return {
    id: "log-1",
    changedBy: "tester",
    description: "",
    timestamp: "2026-07-04T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveFeeDetailItemKey", () => {
  it("fieldKey 有值：直接對應白名單／禁區項目", () => {
    expect(resolveFeeDetailItemKey("譯者", "")).toBe("fee_detail_assignee");
    expect(resolveFeeDetailItemKey("assignee", "")).toBe("fee_detail_assignee");
    expect(resolveFeeDetailItemKey("標題", "")).toBe("fee_detail_title");
    expect(resolveFeeDetailItemKey("客戶", "")).toBe("fee_detail_client");
    expect(resolveFeeDetailItemKey("聯絡人", "")).toBe("fee_detail_contact");
  });

  it("fieldKey undefined：靠 description 回退判斷", () => {
    expect(resolveFeeDetailItemKey(undefined, "費率無誤 否 → 是")).toBe("fee_detail_rateConfirmed");
    expect(resolveFeeDetailItemKey(undefined, "請款完成 否 → 是")).toBe("fee_detail_invoiced");
    expect(resolveFeeDetailItemKey(undefined, "營收總額 100 → 200")).toBe("fee_detail_clientRevenue");
    expect(resolveFeeDetailItemKey(undefined, "對帳完成 否 → 是")).toBe("fee_detail_reconciled");
  });

  it("fieldKey undefined 且 description 無法辨識：回退預設值 fee_detail_title", () => {
    expect(resolveFeeDetailItemKey(undefined, "某個看不懂的變更")).toBe("fee_detail_title");
  });

  it("fieldKey 為空白字串：視同未提供，走 description 回退", () => {
    expect(resolveFeeDetailItemKey("  ", "客戶 A → B")).toBe("fee_detail_client");
  });
});

describe("resolveCaseEditLogItemKey", () => {
  it("fieldKey 有對應項目時直接查表", () => {
    expect(resolveCaseEditLogItemKey("title")).toBe("case_detail_title");
    expect(resolveCaseEditLogItemKey("client")).toBe("case_detail_client");
    expect(resolveCaseEditLogItemKey("translator")).toBe("case_detail_translator");
  });

  it("fieldKey undefined 或表中查無：回退預設值 case_detail_title", () => {
    expect(resolveCaseEditLogItemKey(undefined)).toBe("case_detail_title");
    expect(resolveCaseEditLogItemKey("未知欄位")).toBe("case_detail_title");
  });
});

describe("filterEditLogsFeeDetail", () => {
  const mixedLogs: SimplePersistedLog[] = [
    log({ id: "l-assignee", fieldKey: "譯者", description: "譯者 甲 → 乙" }),
    log({ id: "l-title", fieldKey: "標題", description: "標題 A → B" }),
    log({ id: "l-client", fieldKey: "客戶", description: "客戶 X → Y" }),
    log({ id: "l-revenue", fieldKey: undefined, description: "營收總額 100 → 200" }),
    log({ id: "l-reconciled", fieldKey: undefined, description: "對帳完成 否 → 是" }),
  ];

  it("譯者權限（view-only 白名單）：白名單條目保留、禁區條目濾除", () => {
    const checkPerm = makeCheckPerm({
      fee_management: {
        visible: true,
        items: {
          fee_detail_assignee: true,
          fee_detail_title: true,
          fee_detail_client: false,
          fee_detail_clientRevenue: false,
          fee_detail_reconciled: false,
        },
      },
    });
    const result = filterEditLogsFeeDetail(mixedLogs, checkPerm);
    expect(result.map((l) => l.id)).toEqual(["l-assignee", "l-title"]);
  });

  it("PM 權限（模組可見、無項目限制）：全部保留", () => {
    const checkPerm = makeCheckPerm({ fee_management: { visible: true } });
    const result = filterEditLogsFeeDetail(mixedLogs, checkPerm);
    expect(result).toHaveLength(mixedLogs.length);
    expect(result.map((l) => l.id)).toEqual(mixedLogs.map((l) => l.id));
  });

  it("W10 F1 重現案例：模組整體不可見時，連白名單條目也被濾光（根因，非本函式之錯）", () => {
    // 根因：checkPerm 對「模組不可見」的處理是不論項目層級一律回傳 false，
    // 這裡鎖住此函式的現況行為；實際修法是在 TranslatorFeeDetail.tsx
    // 對非管理員略過此過濾（見 W10 F1 裁決），不是改本函式。
    const checkPerm = makeCheckPerm({ fee_management: { visible: false } });
    const result = filterEditLogsFeeDetail(mixedLogs, checkPerm);
    expect(result).toEqual([]);
  });
});

describe("filterFeeListEditLogs", () => {
  const editLogs: EditLog[] = [
    { id: "e1", author: "tester", field: "譯者", oldValue: "甲", newValue: "乙", timestamp: "t1", fieldKey: "譯者" },
    { id: "e2", author: "tester", field: "客戶", oldValue: "X", newValue: "Y", timestamp: "t2", fieldKey: "客戶" },
  ];

  it("譯者權限：白名單欄位保留、禁區欄位濾除", () => {
    const checkPerm = makeCheckPerm({
      fee_management: { visible: true, items: { fee_detail_assignee: true, fee_detail_client: false } },
    });
    const result = filterFeeListEditLogs(editLogs, checkPerm);
    expect(result.map((l) => l.id)).toEqual(["e1"]);
  });

  it("PM 權限：全保留", () => {
    const checkPerm = makeCheckPerm({ fee_management: { visible: true } });
    const result = filterFeeListEditLogs(editLogs, checkPerm);
    expect(result).toHaveLength(2);
  });
});

describe("filterEditLogsCase", () => {
  const caseLogs: SimplePersistedLog[] = [
    log({ id: "c-title", fieldKey: "title", description: "案件編號 A → B" }),
    log({ id: "c-client", fieldKey: "client", description: "客戶 X → Y" }),
  ];

  it("譯者權限：白名單欄位保留、禁區欄位濾除", () => {
    const checkPerm = makeCheckPerm({
      case_management: { visible: true, items: { case_detail_title: true, case_detail_client: false } },
    });
    const result = filterEditLogsCase(caseLogs, checkPerm);
    expect(result.map((l) => l.id)).toEqual(["c-title"]);
  });

  it("PM 權限：全保留", () => {
    const checkPerm = makeCheckPerm({ case_management: { visible: true } });
    const result = filterEditLogsCase(caseLogs, checkPerm);
    expect(result).toHaveLength(2);
  });
});
