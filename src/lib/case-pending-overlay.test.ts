import { describe, expect, it } from "vitest";
import { applyPendingCaseOverlay } from "./case-pending-overlay";
import type { CaseRecord } from "@/data/case-types";

function base(partial: Partial<CaseRecord>): CaseRecord {
  return {
    id: "c1",
    title: "t",
    status: "inquiry",
    revision: 1,
    client: "",
    contact: "",
    keyword: "",
    clientPoNumber: "",
    clientCaseLink: { name: "", url: "" },
    dispatchRoute: "",
    category: "",
    workType: [],
    workGroups: [],
    processNote: "",
    billingUnit: "",
    unitCount: 0,
    translator: [],
    translationDeadline: null,
    reviewer: "",
    reviewDeadline: null,
    inquiryNote: "",
    executionTool: "",
    tools: [],
    questionTools: [],
    deliveryMethod: "",
    deliveryMethodFiles: [],
    workingFiles: [],
    sourceFiles: [],
    clientReceiptFiles: [],
    clientGuidelines: [],
    customGuidelinesUrl: [],
    referenceMaterials: [],
    seriesReferenceMaterials: [],
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
    createdBy: "",
    createdAt: "",
    inquirySlackRecords: [],
    updatedAt: "2026-09-08T00:00:00.000Z",
    edit_logs: [],
    ...partial,
  };
}

describe("applyPendingCaseOverlay", () => {
  it("re-derives reviewer display when pending clears reviewer but review_rows remain", () => {
    const current = base({
      reviewer: "威儀",
      reviewRows: [{
        id: "rr1",
        segment: "",
        reviewer: "威儀",
        reviewDeadline: null,
        taskCompleted: false,
        reviewerUserId: "9f96ef05-18c9-4442-929d-42fd6ad47990",
      }],
    });
    const next = applyPendingCaseOverlay(current, { reviewer: "", revision: 38 });
    expect(next.reviewer).toBe("威儀");
    expect(next.reviewRows?.[0]?.reviewerUserId).toBe("9f96ef05-18c9-4442-929d-42fd6ad47990");
  });

  it("keeps explicit clear when review_rows also cleared", () => {
    const current = base({
      reviewer: "威儀",
      reviewRows: [{ id: "rr1", segment: "", reviewer: "威儀", reviewDeadline: null, taskCompleted: false }],
    });
    const next = applyPendingCaseOverlay(current, { reviewer: "", reviewRows: [] });
    expect(next.reviewer).toBe("");
    expect(next.reviewRows).toEqual([]);
  });
});
