import { describe, expect, it } from "vitest";
import {
  areAllReviewAssignmentsCompleted,
  deriveReviewerSummary,
} from "./review-rows";

describe("deriveReviewerSummary", () => {
  it("去重並以頓號串接", () => {
    expect(
      deriveReviewerSummary([
        { id: "1", segment: "", reviewer: "甲", reviewDeadline: null, taskCompleted: false },
        { id: "2", segment: "", reviewer: "乙", reviewDeadline: null, taskCompleted: false },
        { id: "3", segment: "", reviewer: "甲", reviewDeadline: null, taskCompleted: false },
      ]),
    ).toBe("甲、乙");
  });

  it("空陣列 → 空字串", () => {
    expect(deriveReviewerSummary([])).toBe("");
  });
});

describe("areAllReviewAssignmentsCompleted（§2.4）", () => {
  it("空集合不得誤完成", () => {
    expect(areAllReviewAssignmentsCompleted([])).toBe(false);
  });

  it("全部 completed → true", () => {
    expect(areAllReviewAssignmentsCompleted(["completed", "completed"])).toBe(true);
  });

  it("任一非 completed → false", () => {
    expect(areAllReviewAssignmentsCompleted(["completed", "assigned"])).toBe(false);
  });
});
