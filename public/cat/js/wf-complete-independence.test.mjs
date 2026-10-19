import { describe, expect, it } from "vitest";
import {
  shouldForceTranslateCompletedDueToReview,
  shouldLockTranslateDueToReviewComplete,
  assignmentIdsTouchedByUserHits,
  extraTranslateIdsForcedByReviewComplete,
  translateAssignmentsCompletedWithReview,
  translateIdsForExplicitWholeFileReviewComplete,
  aggregateStageStatusFromAssignmentStatuses,
  assignmentRangesOverlap,
  assignmentsHaveExactSameRange,
  shouldReopenCompleteOnTranslatorTargetEdit,
  assignmentIdsToReopenOnTranslatorEdit,
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

  it("覆蓋該句的已完成翻譯與審稿都列入，其他段不列入", () => {
    const covering = [
      { id: "t-1-1", kind: "translate", workflowStatus: "completed" },
      { id: "r-1-1", kind: "review", workflowStatus: "completed" },
      { id: "t-2-2", kind: "translate", workflowStatus: "completed" },
    ];
    expect(assignmentIdsToReopenOnTranslatorEdit({
      covering: covering.filter((a) => a.id !== "t-2-2"),
    })).toEqual(["t-1-1", "r-1-1"]);
  });

  it("未完成指派不列入", () => {
    expect(assignmentIdsToReopenOnTranslatorEdit({
      covering: [{ id: "t-1-1", kind: "translate", workflowStatus: "in_progress" }],
    })).toEqual([]);
  });
});
