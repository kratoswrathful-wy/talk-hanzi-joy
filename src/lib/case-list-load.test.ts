import { describe, expect, it } from "vitest";
import type { CaseRecord } from "@/data/case-types";
import {
  casesAfterFullListFailure,
  casesListEmptyKind,
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
  it("詳情已載入完整列時，清單刷新不得清掉 tools／edit_logs", () => {
    const current = stubCase({
      id: "a",
      updatedAt: "2026-09-08T10:00:00.000Z",
      title: "舊標題",
      tools: [{ id: "t1", tool: "memoQ", fieldValues: {} }],
      edit_logs: [{ id: "e1", changedBy: "x", description: "d", timestamp: "2026-09-08T09:00:00.000Z" }],
    });
    const incoming = stubCase({
      id: "a",
      updatedAt: "2026-09-08T11:00:00.000Z",
      title: "新標題",
      tools: [],
      edit_logs: [],
    });
    const merged = mergeCaseListProjection(current, incoming, true);
    expect(merged.title).toBe("新標題");
    expect(merged.tools).toEqual([{ id: "t1", tool: "memoQ", fieldValues: {} }]);
    expect(merged.edit_logs).toHaveLength(1);
  });

  it("僅清單列、記憶體沒有完整資料時，不把空陣列當成「保留」", () => {
    const incoming = stubCase({
      id: "b",
      updatedAt: "2026-09-08T11:00:00.000Z",
      title: "僅清單",
      tools: [],
    });
    const merged = mergeCaseListProjection(undefined, incoming, false);
    expect(merged.title).toBe("僅清單");
    expect(merged.tools).toEqual([]);
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
