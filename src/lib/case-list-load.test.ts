import { describe, expect, it } from "vitest";
import type { CaseRecord } from "@/data/case-types";
import {
  caseUpdateBlockedReason,
  casesAfterFullListFailure,
  casesListEmptyKind,
  listSnapshotIsNewer,
  mergeCaseListProjection,
} from "./case-list-load";

function stubCase(partial: Partial<CaseRecord> & { id: string; updatedAt: string }): CaseRecord {
  return {
    title: "",
    status: "draft",
    client: "",
    contact: "",
    keyword: "",
    clientPoNumber: "",
    clientCaseLink: { url: "", label: "" },
    dispatchRoute: "",
    category: "",
    workType: [],
    workGroups: [],
    processNote: "",
    billingUnit: "",
    unitCount: 0,
    inquiryNote: "",
    translator: [],
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
    reviewRows: [],
    declineRecords: [],
    iconUrl: "",
    createdBy: null,
    createdAt: partial.updatedAt,
    revision: 0,
    inquirySlackRecords: [],
    edit_logs: [],
    ...partial,
  };
}

describe("mergeCaseListProjection", () => {
  it("詳情已載入完整列且清單未更新時，保留 tools／edit_logs 且仍為 full", () => {
    const current = stubCase({
      id: "a",
      updatedAt: "2026-09-08T10:00:00.000Z",
      revision: 3,
      title: "舊標題",
      tools: [{ id: "t1", tool: "memoQ", fieldValues: {} }],
      edit_logs: [{ id: "e1", changedBy: "x", description: "d", timestamp: "2026-09-08T09:00:00.000Z" }],
    });
    const incoming = stubCase({
      id: "a",
      updatedAt: "2026-09-08T10:00:00.000Z",
      revision: 3,
      title: "舊標題",
      tools: [],
      edit_logs: [],
    });
    const merged = mergeCaseListProjection(current, incoming, "full");
    expect(merged.completeness).toBe("full");
    expect(merged.record.title).toBe("舊標題");
    expect(merged.record.tools).toEqual([{ id: "t1", tool: "memoQ", fieldValues: {} }]);
    expect(merged.record.edit_logs).toHaveLength(1);
  });

  it("已快取完整案件、清單收到較新版本：保留舊內文但標 stale，不得當最新完整資料", () => {
    const current = stubCase({
      id: "a",
      updatedAt: "2026-09-08T10:00:00.000Z",
      revision: 3,
      title: "舊標題",
      processNote: "舊備註",
      tools: [{ id: "t1", tool: "memoQ", fieldValues: {} }],
    });
    const incoming = stubCase({
      id: "a",
      updatedAt: "2026-09-08T11:00:00.000Z",
      revision: 4,
      title: "新標題",
      processNote: "",
      tools: [],
    });
    const merged = mergeCaseListProjection(current, incoming, "full");
    expect(merged.completeness).toBe("stale");
    expect(merged.record.title).toBe("新標題");
    expect(merged.record.revision).toBe(4);
    expect(merged.record.processNote).toBe("舊備註");
    expect(merged.record.tools).toEqual([{ id: "t1", tool: "memoQ", fieldValues: {} }]);
  });

  it("完整快取、清單標題已變但 revision 未變：仍標 stale", () => {
    const current = stubCase({
      id: "a",
      updatedAt: "2026-09-08T10:00:00.000Z",
      revision: 4,
      title: "舊標題",
      processNote: "舊備註",
    });
    const incoming = stubCase({
      id: "a",
      updatedAt: "2026-09-08T10:00:00.000Z",
      revision: 4,
      title: "新標題",
      processNote: "",
    });
    const merged = mergeCaseListProjection(current, incoming, "full");
    expect(merged.completeness).toBe("stale");
    expect(merged.record.processNote).toBe("舊備註");
  });

  it("僅清單列、記憶體沒有完整資料時，不把空陣列當成「保留」", () => {
    const incoming = stubCase({
      id: "b",
      updatedAt: "2026-09-08T11:00:00.000Z",
      title: "僅清單",
      tools: [],
    });
    const merged = mergeCaseListProjection(undefined, incoming, undefined);
    expect(merged.completeness).toBe("list");
    expect(merged.record.title).toBe("僅清單");
    expect(merged.record.tools).toEqual([]);
  });
});

describe("listSnapshotIsNewer", () => {
  it("revision 較高即為較新，即使 updatedAt 較舊", () => {
    const current = stubCase({ id: "a", updatedAt: "2026-09-08T12:00:00.000Z", revision: 2 });
    const incoming = stubCase({ id: "a", updatedAt: "2026-09-08T11:00:00.000Z", revision: 3 });
    expect(listSnapshotIsNewer(current, incoming)).toBe(true);
  });

  it("同 revision／updatedAt 但標題已變，仍視為較新清單列", () => {
    const current = stubCase({
      id: "a",
      updatedAt: "2026-09-08T10:00:00.000Z",
      revision: 4,
      title: "舊標題",
    });
    const incoming = stubCase({
      id: "a",
      updatedAt: "2026-09-08T10:00:00.000Z",
      revision: 4,
      title: "新標題",
    });
    expect(listSnapshotIsNewer(current, incoming)).toBe(true);
  });
});

describe("caseUpdateBlockedReason", () => {
  it("完整列可寫 omitted 欄", () => {
    expect(caseUpdateBlockedReason("full", { processNote: "x" })).toBeNull();
  });

  it("清單列／過期列不得寫入內文或附件", () => {
    expect(caseUpdateBlockedReason("list", { processNote: "x" })).toMatch(/完整內容尚未載入或已過期/);
    expect(caseUpdateBlockedReason("stale", { bodyContent: [] })).toMatch(/完整內容尚未載入或已過期/);
  });

  it("清單列仍可寫標題／狀態", () => {
    expect(caseUpdateBlockedReason("list", { title: "t", status: "draft" })).toBeNull();
    expect(caseUpdateBlockedReason("stale", { title: "t" })).toBeNull();
  });
});

describe("casesAfterFullListFailure", () => {
  it("失敗時保留先前清單", () => {
    const prev = [{ id: "keep" }];
    expect(casesAfterFullListFailure(prev)).toBe(prev);
    expect(casesAfterFullListFailure([])).toEqual([]);
  });
});

describe("casesListEmptyKind", () => {
  it("載入失敗不得當成尚無案件", () => {
    expect(casesListEmptyKind({ loadError: "timeout", count: 0 })).toBe("error");
    expect(casesListEmptyKind({ loadError: null, count: 0 })).toBe("empty");
    expect(casesListEmptyKind({ loadError: null, count: 2 })).toBe("ready");
  });
});
