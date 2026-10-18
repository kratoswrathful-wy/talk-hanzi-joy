import { describe, expect, it } from "vitest";
import {
  shouldForceTranslateCompletedDueToReview,
  shouldLockTranslateDueToReviewComplete,
  assignmentIdsTouchedByUserHits,
  extraTranslateIdsForcedByReviewComplete,
  aggregateStageStatusFromAssignmentStatuses,
  assignmentRangesOverlap,
} from "./wf-complete-independence.js";

const assigns = [
  { id: "t-1-1", kind: "translate", lineStart: 1, lineEnd: 1, workflowStatus: "in_progress" },
  { id: "t-2-2", kind: "translate", lineStart: 2, lineEnd: 2, workflowStatus: "in_progress" },
  { id: "r-1-1", kind: "review", lineStart: 1, lineEnd: 1, workflowStatus: "completed" },
  { id: "r-2-2", kind: "review", lineStart: 2, lineEnd: 2, workflowStatus: "in_progress" },
  { id: "t-overlap", kind: "translate", lineStart: 2, lineEnd: 4, workflowStatus: "in_progress" },
  { id: "r-overlap", kind: "review", lineStart: 1, lineEnd: 3, workflowStatus: "completed" },
];

describe("完成獨立：審稿不得強制／阻擋翻譯", () => {
  it("永不因審稿完成強制寫翻譯", () => {
    expect(shouldForceTranslateCompletedDueToReview()).toBe(false);
  });

  it("永不因審稿完成鎖翻譯狀態或編輯", () => {
    expect(shouldLockTranslateDueToReviewComplete()).toBe(false);
  });
});

describe("使用者改哪筆就只動哪筆", () => {
  it("同段：審稿 1-1 完成不改翻譯 1-1", () => {
    const hits = [{ id: "r-1-1", kind: "review", workflowStatus: "completed" }];
    expect(assignmentIdsTouchedByUserHits({ hits, allAssignments: assigns })).toEqual(["r-1-1"]);
    expect(extraTranslateIdsForcedByReviewComplete({ hits, allAssignments: assigns })).toEqual([]);
  });

  it("不同段：審稿 1-1 完成不改翻譯 2-2", () => {
    const hits = [{ id: "r-1-1", kind: "review", workflowStatus: "completed" }];
    expect(assignmentIdsTouchedByUserHits({ hits })).not.toContain("t-2-2");
    expect(extraTranslateIdsForcedByReviewComplete({ hits, allAssignments: assigns })).toEqual([]);
  });

  it("部分重疊範圍也不由另一角色自動改寫", () => {
    const hits = [{ id: "r-overlap", kind: "review", workflowStatus: "completed" }];
    expect(assignmentRangesOverlap(assigns[4], assigns[5])).toBe(true);
    expect(extraTranslateIdsForcedByReviewComplete({ hits, allAssignments: assigns })).toEqual([]);
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
