import { describe, expect, it } from "vitest";
import {
  buildCaseTableCellPartial,
  buildCaseTableUndoFieldChanges,
  caseTableBatchDialogTitle,
  classifyAfterReadback,
  classifyCaseTableWriteResult,
  describeCaseTableItemReason,
  isCaseTableCellUnchanged,
  liveRecordMatchesPatch,
  summarizeCaseTableBatchWrites,
} from "./case-table-cell-write";

describe("buildCaseTableCellPartial", () => {
  it("譯者寫入保留可信帳號，不把姓名當身分", () => {
    expect(buildCaseTableCellPartial("translator", ["譯者一"], {
      translatorUserId: "11111111-1111-4111-8111-111111111111",
    })).toEqual({
      translator: ["譯者一"],
      translatorUserId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("審稿寫入保留可信帳號", () => {
    expect(buildCaseTableCellPartial("reviewer", "審稿甲", {
      reviewerUserId: "22222222-2222-4222-8222-222222222222",
    })).toEqual({
      reviewer: "審稿甲",
      reviewerUserId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("清空譯者一併清帳號", () => {
    expect(buildCaseTableCellPartial("translator", [], {})).toEqual({
      translator: [],
      translatorUserId: null,
    });
  });

  it("一般欄位不夾帶人員帳號", () => {
    expect(buildCaseTableCellPartial("status", "dispatched")).toEqual({
      status: "dispatched",
    });
  });
});

describe("isCaseTableCellUnchanged", () => {
  const current = {
    translator: ["譯者一"],
    translatorUserId: "11111111-1111-4111-8111-111111111111",
    reviewer: "審稿甲",
    reviewerUserId: "22222222-2222-4222-8222-222222222222",
    status: "inquiry",
  };

  it("相同狀態列為未變更", () => {
    expect(isCaseTableCellUnchanged(current, "status", "inquiry")).toBe(true);
  });

  it("同名不同帳號視為有變更", () => {
    expect(isCaseTableCellUnchanged(current, "translator", ["譯者一"], {
      translatorUserId: "33333333-3333-4333-8333-333333333333",
    })).toBe(false);
  });

  it("姓名與帳號都相同才略過寫入", () => {
    expect(isCaseTableCellUnchanged(current, "translator", ["譯者一"], {
      translatorUserId: "11111111-1111-4111-8111-111111111111",
    })).toBe(true);
  });
});

describe("classifyCaseTableWriteResult / classifyAfterReadback", () => {
  it("沒有錯誤才算成功，不以送出當成功", () => {
    expect(classifyCaseTableWriteResult(null)).toBe("success");
    expect(classifyCaseTableWriteResult(undefined)).toBe("success");
    expect(classifyCaseTableWriteResult(new Error("stale_revision"))).toBe("failed");
  });

  it("逾時先當不明，讀回相符才改成功", () => {
    const intended = { status: "dispatched" };
    expect(classifyCaseTableWriteResult(new Error("TypeError: Failed to fetch"))).toBe("unknown");
    expect(classifyAfterReadback({
      writeError: new Error("timeout"),
      intended,
      live: { status: "dispatched" },
      readbackOk: true,
    })).toBe("success");
    expect(classifyAfterReadback({
      writeError: new Error("timeout"),
      intended,
      live: { status: "inquiry" },
      readbackOk: true,
    })).toBe("unknown");
    expect(classifyAfterReadback({
      writeError: new Error("timeout"),
      intended,
      live: null,
      readbackOk: false,
    })).toBe("unknown");
  });

  it("已知拒絕維持失敗，不因讀回改口", () => {
    expect(classifyAfterReadback({
      writeError: new Error("field_not_permitted"),
      intended: { status: "dispatched" },
      live: { status: "inquiry" },
      readbackOk: true,
    })).toBe("failed");
  });
});

describe("liveRecordMatchesPatch", () => {
  it("比對人員帳號時把空字串與 null 當相同", () => {
    expect(liveRecordMatchesPatch(
      { reviewer: "", reviewerUserId: "" },
      { reviewer: "", reviewerUserId: null },
    )).toBe(true);
  });
});

describe("buildCaseTableUndoFieldChanges", () => {
  it("復原要帶回人員帳號，不能只還原顯示名", () => {
    expect(buildCaseTableUndoFieldChanges(
      "reviewer",
      {
        translator: [],
        translatorUserId: null,
        reviewer: "舊審稿",
        reviewerUserId: "22222222-2222-4222-8222-222222222222",
      },
      "新審稿",
      { reviewerUserId: "44444444-4444-4444-8444-444444444444" },
    )).toEqual({
      reviewer: { oldValue: "舊審稿", newValue: "新審稿" },
      reviewerUserId: {
        oldValue: "22222222-2222-4222-8222-222222222222",
        newValue: "44444444-4444-4444-8444-444444444444",
      },
    });
  });
});

describe("summarizeCaseTableBatchWrites", () => {
  it("不以勾選數當成功數", () => {
    const summary = summarizeCaseTableBatchWrites([
      { id: "1", title: "A", kind: "success" },
      { id: "2", title: "B", kind: "failed", reason: "拒絕" },
      { id: "3", title: "C", kind: "unchanged" },
    ]);
    expect(summary).toEqual({
      successCount: 1,
      failedCount: 1,
      unchangedCount: 1,
      unknownCount: 0,
    });
    expect(caseTableBatchDialogTitle(summary)).toBe("批次編輯結果");
    expect(caseTableBatchDialogTitle({
      successCount: 2,
      failedCount: 0,
      unknownCount: 0,
    })).toBe("批次編輯完成");
    expect(caseTableBatchDialogTitle({
      successCount: 0,
      failedCount: 2,
      unknownCount: 0,
    })).toBe("批次編輯未完成");
  });

  it("結果不明不要寫成已儲存", () => {
    expect(describeCaseTableItemReason("unknown")).toContain("結果不明");
    expect(describeCaseTableItemReason("unchanged")).toContain("未重複寫入");
  });
});
