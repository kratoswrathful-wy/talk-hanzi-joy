import { describe, expect, it } from "vitest";
import {
  areAllReviewAssignmentsCompleted,
  caseListReviewerPeople,
  caseListReviewerText,
  deriveReviewerSummary,
  listReviewerPeople,
  isReviewRowsSegmented,
  listReviewerLabels,
  pickReviewDeadlineForList,
  shouldShowReviewSegmentBlock,
  writeThroughWholeFileReviewDeadline,
  writeThroughWholeFileReviewer,
} from "./review-rows";
import type { ReviewCollabRow } from "@/data/case-types";

function row(partial: Partial<ReviewCollabRow> & { id: string; reviewer: string }): ReviewCollabRow {
  return {
    segment: "",
    reviewDeadline: null,
    taskCompleted: false,
    ...partial,
  };
}

describe("deriveReviewerSummary", () => {
  it("去重並以頓號串接", () => {
    expect(
      deriveReviewerSummary([
        row({ id: "1", reviewer: "甲" }),
        row({ id: "2", reviewer: "乙" }),
        row({ id: "3", reviewer: "甲" }),
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

describe("isReviewRowsSegmented / shouldShowReviewSegmentBlock", () => {
  it("空或單列整檔 → 未分段", () => {
    expect(isReviewRowsSegmented([])).toBe(false);
    expect(
      isReviewRowsSegmented([row({ id: "1", reviewer: "甲", linkedCatFileId: "f1" })]),
    ).toBe(false);
  });

  it("列數 ≥2 → 分段", () => {
    expect(
      isReviewRowsSegmented([
        row({ id: "1", reviewer: "甲", linkedCatFileId: "f1" }),
        row({ id: "2", reviewer: "甲", linkedCatFileId: "f2" }),
      ]),
    ).toBe(true);
  });

  it("單列但有 lineRange → 分段", () => {
    expect(
      isReviewRowsSegmented([row({ id: "1", reviewer: "甲", lineRange: "1-100" })]),
    ).toBe(true);
  });

  it("顯示條件：多人協作或已分段", () => {
    expect(shouldShowReviewSegmentBlock({ multiCollab: true, reviewRows: [] })).toBe(true);
    expect(
      shouldShowReviewSegmentBlock({
        multiCollab: false,
        reviewRows: [row({ id: "1", reviewer: "甲" })],
      }),
    ).toBe(false);
    expect(
      shouldShowReviewSegmentBlock({
        multiCollab: false,
        reviewRows: [
          row({ id: "1", reviewer: "甲" }),
          row({ id: "2", reviewer: "乙" }),
        ],
      }),
    ).toBe(true);
  });

  it("已分段時即使取消多人協作仍顯示", () => {
    expect(
      shouldShowReviewSegmentBlock({
        multiCollab: false,
        reviewRows: [
          row({ id: "1", reviewer: "甲", lineRange: "1-50" }),
          row({ id: "2", reviewer: "乙", lineRange: "51-100" }),
        ],
      }),
    ).toBe(true);
  });
});

describe("listReviewerLabels / caseListReviewerText", () => {
  it("有帳號時按帳號去重，同名不同帳號分開", () => {
    expect(
      listReviewerLabels([
        row({ id: "1", reviewer: "甲", reviewerUserId: "uid-a" }),
        row({ id: "2", reviewer: "甲", reviewerUserId: "uid-b" }),
        row({ id: "3", reviewer: "甲", reviewerUserId: "uid-a" }),
      ]),
    ).toBe("甲、甲");
  });

  it("沒有帳號才用顯示名去重", () => {
    expect(
      listReviewerLabels([
        row({ id: "1", reviewer: "甲" }),
        row({ id: "2", reviewer: "乙" }),
        row({ id: "3", reviewer: "甲" }),
      ]),
    ).toBe("甲、乙");
  });

  it("有審稿列時不用舊欄；空列才沿用舊欄", () => {
    expect(
      caseListReviewerText({
        reviewRows: [row({ id: "1", reviewer: "乙", reviewerUserId: "uid-b" })],
        reviewer: "舊欄甲",
      }),
    ).toBe("乙");
    expect(caseListReviewerText({ reviewRows: [], reviewer: "舊欄甲" })).toBe("舊欄甲");
    expect(caseListReviewerText({ reviewRows: [], reviewer: "" })).toBe("");
  });
});

describe("listReviewerPeople / caseListReviewerPeople", () => {
  it("每人各一筆，同帳號去重、同名不同帳號分開", () => {
    expect(
      listReviewerPeople([
        row({ id: "1", reviewer: "甲", reviewerUserId: "uid-a" }),
        row({ id: "2", reviewer: "甲", reviewerUserId: "uid-b" }),
        row({ id: "3", reviewer: "甲", reviewerUserId: "uid-a" }),
      ]),
    ).toEqual([
      { userId: "uid-a", label: "甲" },
      { userId: "uid-b", label: "甲" },
    ]);
  });

  it("有審稿列時不回退舊欄；空列才沿用舊欄單人", () => {
    expect(
      caseListReviewerPeople({
        reviewRows: [row({ id: "1", reviewer: "乙", reviewerUserId: "uid-b" })],
        reviewer: "舊欄甲",
      }),
    ).toEqual([{ userId: "uid-b", label: "乙" }]);
    expect(caseListReviewerPeople({ reviewRows: [], reviewer: "舊欄甲" })).toEqual([
      { userId: "", label: "舊欄甲" },
    ]);
  });
});

describe("pickReviewDeadlineForList", () => {
  it("未完成列取最早有效日期，含逾期；空日期不捏造", () => {
    expect(
      pickReviewDeadlineForList({
        reviewRows: [
          row({ id: "1", reviewer: "甲", reviewDeadline: "2026-10-20T00:00:00.000Z" }),
          row({ id: "2", reviewer: "乙", reviewDeadline: "2026-09-01T00:00:00.000Z" }),
          row({ id: "3", reviewer: "丙", reviewDeadline: null }),
        ],
      }),
    ).toBe("2026-09-01T00:00:00.000Z");
  });

  it("仍有未完成但都沒日期 → 空白，不改用已完成列", () => {
    expect(
      pickReviewDeadlineForList({
        reviewRows: [
          row({ id: "1", reviewer: "甲", reviewDeadline: null }),
          row({
            id: "2",
            reviewer: "乙",
            reviewDeadline: "2026-08-01T00:00:00.000Z",
            taskCompleted: true,
          }),
        ],
      }),
    ).toBeNull();
  });

  it("完成最早一段後改顯示下一筆未完成", () => {
    const rows = [
      row({ id: "1", reviewer: "甲", reviewDeadline: "2026-09-01T00:00:00.000Z" }),
      row({ id: "2", reviewer: "乙", reviewDeadline: "2026-10-20T00:00:00.000Z" }),
    ];
    expect(pickReviewDeadlineForList({ reviewRows: rows })).toBe("2026-09-01T00:00:00.000Z");
    rows[0].taskCompleted = true;
    expect(pickReviewDeadlineForList({ reviewRows: rows })).toBe("2026-10-20T00:00:00.000Z");
  });

  it("全部完成保留最晚歷史交期；沒有審稿列沿用舊欄", () => {
    expect(
      pickReviewDeadlineForList({
        reviewRows: [
          row({
            id: "1",
            reviewer: "甲",
            reviewDeadline: "2026-09-01T00:00:00.000Z",
            taskCompleted: true,
          }),
          row({
            id: "2",
            reviewer: "乙",
            reviewDeadline: "2026-10-20T00:00:00.000Z",
            taskCompleted: true,
          }),
        ],
      }),
    ).toBe("2026-10-20T00:00:00.000Z");
    expect(
      pickReviewDeadlineForList({
        reviewRows: [],
        fallbackDeadline: "2026-07-01T00:00:00.000Z",
      }),
    ).toBe("2026-07-01T00:00:00.000Z");
  });
});

describe("writeThroughWholeFileReviewer / Deadline", () => {
  it("無列時建立整檔列", () => {
    const next = writeThroughWholeFileReviewer([], "威儀", "uid-1", "2026-07-20T00:00:00.000Z");
    expect(next).toHaveLength(1);
    expect(next[0].reviewer).toBe("威儀");
    expect(next[0].reviewerUserId).toBe("uid-1");
    expect(next[0].reviewDeadline).toBe("2026-07-20T00:00:00.000Z");
    expect(next[0].lineRange == null || next[0].lineRange === "").toBe(true);
  });

  it("清空審稿人 → 空陣列", () => {
    expect(
      writeThroughWholeFileReviewer([row({ id: "1", reviewer: "甲" })], "", null, null),
    ).toEqual([]);
  });

  it("單人案已連結檔時，新列帶上檔案編號", () => {
    const next = writeThroughWholeFileReviewer(
      [],
      "威儀",
      "uid-1",
      null,
      [{ id: "file-9", name: "a.xlsx" }],
    );
    expect(next[0].linkedCatFileId).toBe("file-9");
    expect(next[0].segment).toBe("a.xlsx");
  });

  it("更新既有列審稿人", () => {
    const next = writeThroughWholeFileReviewer(
      [row({ id: "1", reviewer: "甲", linkedCatFileId: "f1" })],
      "乙",
      "uid-2",
      null,
    );
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("1");
    expect(next[0].reviewer).toBe("乙");
    expect(next[0].linkedCatFileId).toBe("f1");
  });

  it("交期 write-through 更新既有列", () => {
    const next = writeThroughWholeFileReviewDeadline(
      [row({ id: "1", reviewer: "甲", reviewDeadline: null })],
      "2026-08-01T12:00:00.000Z",
    );
    expect(next[0].reviewDeadline).toBe("2026-08-01T12:00:00.000Z");
  });
});
