import { describe, expect, it } from "vitest";
import {
  shouldForceTranslateCompletedDueToReview,
  shouldLockTranslateDueToReviewComplete,
  assignmentIdsTouchedByUserHits,
  extraTranslateIdsForcedByReviewComplete,
  translateAssignmentsCompletedWithReview,
  translateIdsForExplicitWholeFileReviewComplete,
  aggregateStageStatusFromAssignmentStatuses,
  nextFileWorkflowStageStatusFromAssignments,
  assignmentRangesOverlap,
  assignmentsHaveExactSameRange,
  shouldReopenCompleteOnTranslatorTargetEdit,
  assignmentIdsToReopenOnTranslatorEdit,
  memberSegmentEditForbidden,
  assignmentCoversLine,
  reviewStageForbidsMemberEdit,
  reviewAssignmentRangeCompleted,
  reviewWorkForbidsMemberEdit,
  resolveMemberWorkKind,
  assignmentLmsCollabRowId,
  assignmentsNeedingCaseLevelLmsSync,
  assignmentsForLmsRollbackOnTranslatorEdit,
  pendingLmsRollbackOnTranslatorEdit,
} from "./wf-complete-independence.js";

const assigns = [
  { id: "t-1-1", kind: "translate", fileId: "f1", lineStart: 1, lineEnd: 1, workflowStatus: "in_progress" },
  { id: "t-2-2", kind: "translate", fileId: "f1", lineStart: 2, lineEnd: 2, workflowStatus: "in_progress" },
  { id: "r-1-1", kind: "review", fileId: "f1", lineStart: 1, lineEnd: 1, workflowStatus: "completed" },
  { id: "r-2-2", kind: "review", fileId: "f1", lineStart: 2, lineEnd: 2, workflowStatus: "in_progress" },
  { id: "t-overlap", kind: "translate", fileId: "f1", lineStart: 2, lineEnd: 4, workflowStatus: "in_progress" },
  { id: "r-overlap", kind: "review", fileId: "f1", lineStart: 1, lineEnd: 3, workflowStatus: "completed" },
];

describe("不得恢復舊整檔強制／編輯鎖", () => {
  it("永不因單段審稿完成強制寫全檔翻譯", () => {
    expect(shouldForceTranslateCompletedDueToReview()).toBe(false);
  });

  it("永不因審稿完成鎖翻譯狀態或編輯", () => {
    expect(shouldLockTranslateDueToReviewComplete()).toBe(false);
  });

  it("舊整檔強制清單仍為空", () => {
    const hits = [{ id: "r-1-1", kind: "review", workflowStatus: "completed" }];
    expect(extraTranslateIdsForcedByReviewComplete({ hits, allAssignments: assigns })).toEqual([]);
  });
});

describe("手動審稿完成只帶精確同範圍翻譯", () => {
  it("同段：審稿 1-1 完成帶翻譯 1-1，不帶 2-2", () => {
    const hits = [{ id: "r-1-1", kind: "review", workflowStatus: "completed" }];
    expect(assignmentIdsTouchedByUserHits({ hits, allAssignments: assigns })).toEqual(["r-1-1"]);
    expect(translateAssignmentsCompletedWithReview({
      review: assigns[2],
      all: assigns,
    })).toEqual(["t-1-1"]);
  });

  it("不同段：審稿 1-1 完成不改翻譯 2-2", () => {
    expect(translateAssignmentsCompletedWithReview({
      review: assigns[2],
      all: assigns,
    })).not.toContain("t-2-2");
  });

  it("部分重疊範圍不完成另一整段翻譯", () => {
    expect(assignmentRangesOverlap(assigns[4], assigns[5])).toBe(true);
    expect(assignmentsHaveExactSameRange(assigns[4], assigns[5])).toBe(false);
    expect(translateAssignmentsCompletedWithReview({
      review: assigns[5],
      all: assigns,
    })).toEqual([]);
  });

  it("明確整檔審稿全部完成才列出全部翻譯", () => {
    expect(translateIdsForExplicitWholeFileReviewComplete({
      all: assigns,
      isExplicitWholeFile: false,
    })).toEqual([]);
    expect(translateIdsForExplicitWholeFileReviewComplete({
      all: assigns,
      isExplicitWholeFile: true,
    })).toEqual(["t-1-1", "t-2-2", "t-overlap"]);
  });
});

describe("整檔彙整不得反寫未完成分段", () => {
  it("一段完成 → 步驟仍進行中，不是整檔完成", () => {
    expect(aggregateStageStatusFromAssignmentStatuses(["completed", "in_progress"])).toBe("active");
  });

  it("全部完成才是整檔完成", () => {
    expect(aggregateStageStatusFromAssignmentStatuses(["completed", "completed"])).toBe("completed");
  });

  it("最後一段完成才把整步標完成；只完成一段維持進行中", () => {
    expect(nextFileWorkflowStageStatusFromAssignments({
      stageKind: "translate",
      currentStatus: "active",
      assignmentStatuses: ["completed", "in_progress"],
    })).toBe(null);
    expect(nextFileWorkflowStageStatusFromAssignments({
      stageKind: "translate",
      currentStatus: "active",
      assignmentStatuses: ["completed", "completed"],
    })).toBe("completed");
  });

  it("沒有分段列時不捏造整檔完成", () => {
    expect(nextFileWorkflowStageStatusFromAssignments({
      stageKind: "translate",
      currentStatus: "active",
      assignmentStatuses: [],
    })).toBe(null);
  });

  it("翻譯已完成且未允許降級時，不因未完成分段自動退回", () => {
    expect(nextFileWorkflowStageStatusFromAssignments({
      stageKind: "translate",
      currentStatus: "completed",
      assignmentStatuses: ["completed", "in_progress"],
      allowDowngrade: false,
    })).toBe(null);
  });

  it("允許降級時，重開後整步回到進行中；審稿完成不全也退回", () => {
    expect(nextFileWorkflowStageStatusFromAssignments({
      stageKind: "translate",
      currentStatus: "completed",
      assignmentStatuses: ["completed", "in_progress"],
      allowDowngrade: true,
    })).toBe("active");
    expect(nextFileWorkflowStageStatusFromAssignments({
      stageKind: "review",
      currentStatus: "completed",
      assignmentStatuses: ["completed", "in_progress"],
    })).toBe("active");
  });
});

describe("譯者改譯文取消該範圍完成", () => {
  it("未改內容、審稿工作都不取消", () => {
    expect(shouldReopenCompleteOnTranslatorTargetEdit({
      textChanged: false,
      sessionKind: "translate",
    })).toBe(false);
    expect(shouldReopenCompleteOnTranslatorTargetEdit({
      textChanged: true,
      sessionKind: "review",
    })).toBe(false);
  });

  it("翻譯工作且譯文變更才取消；兼審稿時仍以翻譯工作為準", () => {
    expect(shouldReopenCompleteOnTranslatorTargetEdit({
      textChanged: true,
      sessionKind: "translate",
      actingAsReviewer: false,
    })).toBe(true);
    expect(shouldReopenCompleteOnTranslatorTargetEdit({
      textChanged: true,
      actingAsReviewer: true,
      sessionKind: "translate",
    })).toBe(true);
  });

  it("沒有工作階段且標成審稿身分時不取消", () => {
    expect(shouldReopenCompleteOnTranslatorTargetEdit({
      textChanged: true,
      actingAsReviewer: true,
    })).toBe(false);
  });

  it("stageKind 與 kind 同等，可找到同範圍翻譯", () => {
    expect(translateAssignmentsCompletedWithReview({
      review: { id: "r", stageKind: "review", fileId: "f1", lineStart: 1, lineEnd: 1 },
      all: [{ id: "t", stageKind: "translate", fileId: "f1", lineStart: 1, lineEnd: 1 }],
    })).toEqual(["t"]);
  });

  it("沒有 kind／stageKind 的 CAT 列找不到對應翻譯（呼叫端必須先蓋角色）", () => {
    expect(translateAssignmentsCompletedWithReview({
      review: { id: "r", fileId: "f1", lineStart: 1, lineEnd: 1 },
      all: [{ id: "t", fileId: "f1", lineStart: 1, lineEnd: 1 }],
    })).toEqual([]);
  });

  it("覆蓋該句的已完成翻譯列入，已完成審稿不由譯者改譯文取消", () => {
    const covering = [
      { id: "t-1-1", kind: "translate", workflowStatus: "completed" },
      { id: "r-1-1", kind: "review", workflowStatus: "completed" },
      { id: "t-2-2", kind: "translate", workflowStatus: "completed" },
    ];
    expect(assignmentIdsToReopenOnTranslatorEdit({
      covering: covering.filter((a) => a.id !== "t-2-2"),
    })).toEqual(["t-1-1"]);
  });

  it("沒有協作列 id 的單人整檔指派要走案件層 LMS", () => {
    expect(assignmentLmsCollabRowId({ collabRowId: "row-1" })).toBe("row-1");
    expect(assignmentLmsCollabRowId({ collab_row_id: null })).toBe("");
    expect(assignmentsNeedingCaseLevelLmsSync([
      { id: "e411", collabRowId: null },
      { id: "e001", collabRowId: "row-1" },
      { id: "e411", collab_row_id: "" },
    ]).map((a) => a.id)).toEqual(["e411"]);
  });

  it("未完成指派不列入", () => {
    expect(assignmentIdsToReopenOnTranslatorEdit({
      covering: [{ id: "t-1-1", kind: "translate", workflowStatus: "in_progress" }],
    })).toEqual([]);
  });

  it("CAT 未完成時仍列出覆蓋該句的翻譯指派給案件頁回退", () => {
    const covering = [
      { id: "t-1-2", kind: "translate", workflowStatus: "assigned", lineStart: 1, lineEnd: 2, collabRowId: "row-a" },
      { id: "r-1-2", kind: "review", workflowStatus: "completed", lineStart: 1, lineEnd: 2, collabRowId: "row-a" },
      { id: "t-3-4", kind: "translate", workflowStatus: "assigned", lineStart: 3, lineEnd: 4, collabRowId: "row-b" },
    ];
    expect(assignmentsForLmsRollbackOnTranslatorEdit({
      covering,
      lineNo: 1,
    }).map((a) => a.id)).toEqual(["t-1-2"]);
    expect(assignmentIdsToReopenOnTranslatorEdit({ covering })).toEqual([]);
  });

  it("只有審稿指派時仍用該列編號做案件頁翻譯重開", () => {
    const covering = [
      { id: "r-1-2", kind: "review", workflowStatus: "assigned", lineStart: 1, lineEnd: 2, collabRowId: "row-a" },
      { id: "r-3-4", kind: "review", workflowStatus: "assigned", lineStart: 3, lineEnd: 4, collabRowId: "row-b" },
    ];
    const hits = assignmentsForLmsRollbackOnTranslatorEdit({ covering, lineNo: 1 });
    expect(hits.map((a) => a.collabRowId)).toEqual(["row-a"]);
    expect(hits[0].kind).toBe("translate");
  });

  it("同一列已在途或已退過就不再重送案件頁回退", () => {
    const covering = [
      { id: "t-1-2", kind: "translate", workflowStatus: "assigned", lineStart: 1, lineEnd: 2, collabRowId: "row-a" },
    ];
    expect(pendingLmsRollbackOnTranslatorEdit({
      covering,
      lineNo: 1,
      inFlight: new Set(["row-a"]),
    }).keys).toEqual([]);
    expect(pendingLmsRollbackOnTranslatorEdit({
      covering,
      lineNo: 1,
      done: new Set(["row-a"]),
    }).keys).toEqual([]);
    expect(pendingLmsRollbackOnTranslatorEdit({
      covering,
      lineNo: 1,
    }).keys).toEqual(["row-a"]);
  });
});

describe("完成後不得因審稿尚未指派而鎖死已完成翻譯範圍", () => {
  const t1 = "u-t1";
  const t2 = "u-t2";
  const cWhole = [
    {
      id: "e411",
      kind: "translate",
      fileWorkflowStageId: "d-translate",
      assigneeUserId: t1,
      lineStart: null,
      lineEnd: null,
      workflowStatus: "completed",
    },
  ];
  const aSplit = [
    {
      id: "e001",
      kind: "translate",
      fileWorkflowStageId: "d-translate",
      assigneeUserId: t1,
      lineStart: 1,
      lineEnd: 1,
      workflowStatus: "completed",
    },
    {
      id: "e003",
      kind: "translate",
      fileWorkflowStageId: "d-translate",
      assigneeUserId: t2,
      lineStart: 2,
      lineEnd: 2,
      workflowStatus: "completed",
    },
    {
      id: "e002",
      kind: "review",
      fileWorkflowStageId: "d-review",
      assigneeUserId: t1,
      lineStart: 1,
      lineEnd: 1,
      workflowStatus: "in_progress",
    },
    {
      id: "e004",
      kind: "review",
      fileWorkflowStageId: "d-review",
      assigneeUserId: t1,
      lineStart: 2,
      lineEnd: 2,
      workflowStatus: "in_progress",
    },
  ];

  it("單人整檔：翻譯已完成、審稿尚未開始也尚未指派、未明示身分 → 兩句都可編", () => {
    const base = {
      assignments: cWhole,
      userId: t1,
      sessionStageId: "d-review",
      sessionKind: null,
      reviewStageStatus: "pending",
    };
    expect(memberSegmentEditForbidden({ ...base, lineNo: 1 })).toBe(false);
    expect(memberSegmentEditForbidden({ ...base, lineNo: 2 })).toBe(false);
  });

  it("單人整檔：明示審稿身分但沒有審稿指派 → 仍可用本人翻譯整檔範圍", () => {
    expect(memberSegmentEditForbidden({
      assignments: cWhole,
      userId: t1,
      sessionStageId: "d-review",
      sessionKind: "review",
      reviewStageStatus: "pending",
      lineNo: 1,
    })).toBe(false);
  });

  it("審稿進行中：沒有審稿指派的譯者仍可改自己的翻譯範圍", () => {
    const base = {
      assignments: aSplit,
      userId: t2,
      sessionStageId: "d-review",
      sessionKind: null,
      reviewStageStatus: "active",
    };
    expect(memberSegmentEditForbidden({ ...base, lineNo: 2 })).toBe(false);
    expect(memberSegmentEditForbidden({ ...base, lineNo: 1 })).toBe(true);
  });

  it("整份檔案審稿完成：受派譯者仍可改", () => {
    expect(reviewStageForbidsMemberEdit("completed")).toBe(true);
    expect(reviewStageForbidsMemberEdit("active")).toBe(false);
    expect(reviewWorkForbidsMemberEdit({
      assignments: cWhole,
      reviewStageStatus: "completed",
      lineNo: 1,
    })).toBe(false);
    expect(memberSegmentEditForbidden({
      assignments: cWhole,
      userId: t1,
      sessionStageId: "d-review",
      sessionKind: null,
      reviewStageStatus: "completed",
      lineNo: 1,
    })).toBe(false);
  });

  it("審稿進行中：本人有審稿指派的列仍可編", () => {
    expect(memberSegmentEditForbidden({
      assignments: aSplit,
      userId: t1,
      sessionStageId: "d-review",
      sessionKind: null,
      reviewStageStatus: "active",
      lineNo: 1,
    })).toBe(false);
  });

  it("未受派者仍禁止", () => {
    expect(memberSegmentEditForbidden({
      assignments: cWhole,
      userId: "nobody",
      sessionStageId: "d-review",
      sessionKind: null,
      reviewStageStatus: "pending",
      lineNo: 1,
    })).toBe(true);
  });

  it("列範圍字串或無效數字不當成全檔鎖死", () => {
    expect(assignmentCoversLine({ lineRange: "1-2" }, 1)).toBe(true);
    expect(assignmentCoversLine({ lineRange: "1-2" }, 3)).toBe(false);
    expect(assignmentCoversLine({ lineStart: "1-2" }, 1)).toBe(true);
    expect(assignmentCoversLine({ lineStart: 1, lineEnd: 2 }, 1)).toBe(true);
  });

  it("句段已審稿完成、檔案與分段仍審稿進行中：譯者仍可改自己的範圍", () => {
    const withSegConfirm = aSplit.map((a) => (
      a.id === "e002" ? { ...a, workflowStatus: "in_progress" } : a
    ));
    expect(memberSegmentEditForbidden({
      assignments: withSegConfirm,
      userId: t1,
      sessionStageId: "d-review",
      sessionKind: null,
      reviewStageStatus: "active",
      lineNo: 1,
      segmentReviewConfirmed: true,
    })).toBe(false);
    expect(reviewAssignmentRangeCompleted(withSegConfirm, 1)).toBe(false);
  });

  it("單人整檔：翻譯完成後跳到未指派審稿、未明示身分 → 仍視為翻譯工作", () => {
    expect(resolveMemberWorkKind({
      assignments: cWhole,
      userId: t1,
      sessionStageId: "d-review",
      sessionKind: null,
      reviewStageStatus: "pending",
    })).toBe("translate");
    expect(shouldReopenCompleteOnTranslatorTargetEdit({
      textChanged: true,
      sessionKind: null,
      actingAsReviewer: false,
    })).toBe(true);
  });

  it("審稿進行中、譯者只有翻譯指派、未明示身分 → 視為翻譯", () => {
    expect(resolveMemberWorkKind({
      assignments: aSplit,
      userId: t2,
      sessionStageId: "d-review",
      sessionKind: null,
      reviewStageStatus: "active",
    })).toBe("translate");
  });

  it("明示審稿身分時仍為審稿，不因翻譯指派改判", () => {
    expect(resolveMemberWorkKind({
      assignments: cWhole,
      userId: t1,
      sessionStageId: "d-review",
      sessionKind: "review",
      reviewStageStatus: "pending",
    })).toBe("review");
  });

  it("該分段審稿指派已完成：受派譯者仍可改，審稿完成不再鎖編輯", () => {
    const rangeReviewDone = aSplit.map((a) => (
      a.id === "e002" ? { ...a, workflowStatus: "completed" } : a
    ));
    expect(reviewAssignmentRangeCompleted(rangeReviewDone, 1)).toBe(true);
    expect(reviewWorkForbidsMemberEdit({
      assignments: rangeReviewDone,
      reviewStageStatus: "active",
      lineNo: 1,
    })).toBe(false);
    expect(memberSegmentEditForbidden({
      assignments: rangeReviewDone,
      userId: t1,
      sessionStageId: "d-translate",
      sessionKind: "translate",
      reviewStageStatus: "active",
      lineNo: 1,
    })).toBe(false);
  });

  it("相鄰分段審稿未完成：該段受派譯者仍可改", () => {
    const rangeReviewDone = aSplit.map((a) => (
      a.id === "e002" ? { ...a, workflowStatus: "completed" } : a
    ));
    expect(reviewAssignmentRangeCompleted(rangeReviewDone, 2)).toBe(false);
    expect(memberSegmentEditForbidden({
      assignments: rangeReviewDone,
      userId: t2,
      sessionStageId: "d-translate",
      sessionKind: "translate",
      reviewStageStatus: "active",
      lineNo: 2,
    })).toBe(false);
  });

  it("他人完成的審稿分段：該段受派譯者仍可改", () => {
    const rangeReviewDone = aSplit.map((a) => (
      a.id === "e004" ? { ...a, workflowStatus: "completed" } : a
    ));
    expect(reviewWorkForbidsMemberEdit({
      assignments: rangeReviewDone,
      reviewStageStatus: "active",
      lineNo: 2,
    })).toBe(false);
    expect(memberSegmentEditForbidden({
      assignments: rangeReviewDone,
      userId: t2,
      sessionStageId: "d-translate",
      sessionKind: "translate",
      reviewStageStatus: "active",
      lineNo: 2,
    })).toBe(false);
    expect(memberSegmentEditForbidden({
      assignments: rangeReviewDone,
      userId: t1,
      sessionStageId: "d-translate",
      sessionKind: "translate",
      reviewStageStatus: "active",
      lineNo: 1,
    })).toBe(false);
  });

  it("整檔審稿殘留完成、其中一段已重開：兩段受派譯者都可改", () => {
    const oneReopened = aSplit.map((a) => {
      if (a.id === "e002") return { ...a, workflowStatus: "in_progress" };
      if (a.id === "e004") return { ...a, workflowStatus: "completed" };
      return a;
    });
    expect(reviewWorkForbidsMemberEdit({
      assignments: oneReopened,
      reviewStageStatus: "completed",
      lineNo: 1,
    })).toBe(false);
    expect(memberSegmentEditForbidden({
      assignments: oneReopened,
      userId: t1,
      sessionStageId: "d-translate",
      sessionKind: "translate",
      reviewStageStatus: "completed",
      lineNo: 1,
    })).toBe(false);
    expect(memberSegmentEditForbidden({
      assignments: oneReopened,
      userId: t2,
      sessionStageId: "d-translate",
      sessionKind: "translate",
      reviewStageStatus: "completed",
      lineNo: 2,
    })).toBe(false);
  });
});
