import { describe, expect, it } from "vitest";
import { editLogsFromJson, hydrateInvoiceEditLogsOnOpen } from "./invoice-edit-logs";

const sample = {
  id: "log-1790422704410-a90dh5tq",
  fieldKey: "note",
  changedBy: "PM（測試）",
  timestamp: "2026/09/26 19:38 (UTC+8)",
  description: "客戶請款備註 AIQA-備註-260926-01 → AIQA-備註-260926-02",
};

describe("editLogsFromJson", () => {
  it("保留完整一筆紀錄", () => {
    expect(editLogsFromJson([sample])).toEqual([sample]);
  });

  it("空陣列仍是空陣列", () => {
    expect(editLogsFromJson([])).toEqual([]);
  });

  it("缺欄或非陣列不當有紀錄", () => {
    expect(editLogsFromJson(null)).toBeUndefined();
    expect(editLogsFromJson(undefined)).toBeUndefined();
    expect(editLogsFromJson("x")).toBeUndefined();
  });

  it("略過缺欄的損壞列，留下合法列", () => {
    expect(editLogsFromJson([{ id: "bad" }, sample])).toEqual([sample]);
  });
});

describe("hydrateInvoiceEditLogsOnOpen", () => {
  it("進頁時帶出後端同一筆", () => {
    expect(hydrateInvoiceEditLogsOnOpen("inv-1", [sample])).toEqual([sample]);
  });

  it("後端沒有紀錄時畫面是空，不捏造", () => {
    expect(hydrateInvoiceEditLogsOnOpen("inv-1", undefined)).toEqual([]);
    expect(hydrateInvoiceEditLogsOnOpen(undefined, [sample])).toEqual([]);
  });
});
