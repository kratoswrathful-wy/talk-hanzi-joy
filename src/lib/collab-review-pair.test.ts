import { describe, expect, it } from "vitest";
import type { CollabRow, ReviewCollabRow } from "@/data/case-types";
import {
  applyPairedReviewRowsToCollab,
  collabReviewScopeKey,
  leftoverUnpairedReviewRows,
  mergeCatCollabSavePayload,
  partitionReviewRowsByCollab,
  projectCollabReviewIntoReviewRows,
} from "./collab-review-pair";

function collab(partial: Partial<CollabRow> & { id: string }): CollabRow {
  return {
    segment: "",
    translator: "",
    unitCount: 0,
    accepted: false,
    translationDeadline: null,
    reviewer: "",
    reviewDeadline: null,
    taskCompleted: false,
    delivered: false,
    ...partial,
  };
}

function review(partial: Partial<ReviewCollabRow> & { id: string; reviewer: string }): ReviewCollabRow {
  return {
    segment: "",
    reviewDeadline: null,
    taskCompleted: false,
    ...partial,
  };
}

describe("collabReviewScopeKey", () => {
  it("沒有檔案或檢視時不配對", () => {
    expect(collabReviewScopeKey({ lineRange: "1-10" })).toBe("");
    expect(collabReviewScopeKey({ linkedCatFileId: "  ", lineRange: "1-10" })).toBe("");
  });

  it("同一檔同一範圍視為同一把鑰匙，空白範圍＝整檔", () => {
    expect(collabReviewScopeKey({ linkedCatFileId: "f1", lineRange: "10-50" })).toBe(
      collabReviewScopeKey({ linkedCatFileId: "f1", lineRange: "10 - 50" }),
    );
    expect(collabReviewScopeKey({ linkedCatFileId: "f1", lineRange: "" })).toBe(
      collabReviewScopeKey({ linkedCatFileId: "f1", lineRange: null }),
    );
  });
});

describe("partitionReviewRowsByCollab", () => {
  it("檔案與範圍一對一才配對", () => {
    const { uniqueByCollabId, leftoverReviewRows } = partitionReviewRowsByCollab(
      [collab({ id: "c1", linkedCatFileId: "f1", lineRange: "1-10" })],
      [review({ id: "r1", reviewer: "甲", linkedCatFileId: "f1", lineRange: "1-10" })],
    );
    expect(uniqueByCollabId.get("c1")?.id).toBe("r1");
    expect(leftoverReviewRows).toEqual([]);
  });

  it("一對多或交叉範圍不猜配對", () => {
    const leftover = leftoverUnpairedReviewRows(
      [
        collab({ id: "c1", linkedCatFileId: "f1", lineRange: "1-10" }),
        collab({ id: "c2", linkedCatFileId: "f1", lineRange: "1-10" }),
      ],
      [review({ id: "r1", reviewer: "甲", linkedCatFileId: "f1", lineRange: "1-10" })],
    );
    expect(leftover.map((r) => r.id)).toEqual(["r1"]);

    const crossed = leftoverUnpairedReviewRows(
      [collab({ id: "c1", linkedCatFileId: "f1", lineRange: "1-20" })],
      [
        review({ id: "r1", reviewer: "甲", linkedCatFileId: "f1", lineRange: "1-10" }),
        review({ id: "r2", reviewer: "乙", linkedCatFileId: "f1", lineRange: "11-20" }),
      ],
    );
    expect(crossed.map((r) => r.id)).toEqual(["r1", "r2"]);
  });
});

describe("projectCollabReviewIntoReviewRows", () => {
  it("同段填審稿會寫回 review_rows，清空則移除該一對一列", () => {
    const rows = [collab({ id: "c1", linkedCatFileId: "f1", lineRange: "1-10", reviewer: "甲", reviewerUserId: "uid-a" })];
    const written = projectCollabReviewIntoReviewRows(rows, []);
    expect(written).toEqual([
      expect.objectContaining({
        reviewer: "甲",
        reviewerUserId: "uid-a",
        linkedCatFileId: "f1",
        lineRange: "1-10",
      }),
    ]);

    const cleared = projectCollabReviewIntoReviewRows(
      [collab({ id: "c1", linkedCatFileId: "f1", lineRange: "1-10", reviewer: "" })],
      written,
    );
    expect(cleared).toEqual([]);
  });

  it("無法配對的舊審稿列保留，不依列序併入", () => {
    const leftover = review({
      id: "old",
      reviewer: "舊",
      linkedCatFileId: "f9",
      lineRange: "99-100",
    });
    const next = projectCollabReviewIntoReviewRows(
      [collab({ id: "c1", linkedCatFileId: "f1", lineRange: "1-10", reviewer: "甲", reviewerUserId: "uid-a" })],
      [leftover],
    );
    expect(next).toEqual([
      leftover,
      expect.objectContaining({ reviewer: "甲", linkedCatFileId: "f1" }),
    ]);
  });

  it("審稿可空：沒有審稿者不虛構人員", () => {
    expect(
      projectCollabReviewIntoReviewRows(
        [collab({ id: "c1", linkedCatFileId: "f1", lineRange: "1-10" })],
        [],
      ),
    ).toEqual([]);
  });

  it("未綁 CAT 的新案同段填審稿：寫回且不當無法對應、不重複列", () => {
    const rows = [collab({ id: "c1", segment: "第一段", reviewer: "甲", reviewerUserId: "uid-a" })];
    const written = projectCollabReviewIntoReviewRows(rows, []);
    expect(written).toEqual([
      expect.objectContaining({ id: "c1", reviewer: "甲", reviewerUserId: "uid-a" }),
    ]);
    expect(leftoverUnpairedReviewRows(rows, written)).toEqual([]);
    const again = projectCollabReviewIntoReviewRows(rows, written);
    expect(again).toHaveLength(1);
    expect(again[0]?.id).toBe("c1");
  });
});

describe("applyPairedReviewRowsToCollab / mergeCatCollabSavePayload", () => {
  const file = "5e85226f-576e-42f3-8520-5175918974a5";

  it("CAT 改一對一審稿後，案件主列也換成同一人", () => {
    const collabs = [
      collab({
        id: "cr-2",
        linkedCatFileId: file,
        lineRange: "9-13",
        reviewer: "譯者二（測試）",
        reviewerUserId: "uid-t2",
        translator: "譯者一（測試）",
      }),
    ];
    const reviews = [
      review({
        id: "cr-2",
        linkedCatFileId: file,
        lineRange: "9-13",
        reviewer: "譯者一（測試）",
        reviewerUserId: "uid-t1",
      }),
    ];
    const next = applyPairedReviewRowsToCollab(collabs, reviews);
    expect(next[0]).toEqual(
      expect.objectContaining({
        id: "cr-2",
        reviewer: "譯者一（測試）",
        reviewerUserId: "uid-t1",
        translator: "譯者一（測試）",
      }),
    );
  });

  it("一對多不猜，主列審稿維持原值", () => {
    const next = applyPairedReviewRowsToCollab(
      [
        collab({ id: "c1", linkedCatFileId: file, lineRange: "1-10", reviewer: "甲" }),
        collab({ id: "c2", linkedCatFileId: file, lineRange: "1-10", reviewer: "乙" }),
      ],
      [review({ id: "r1", reviewer: "丙", linkedCatFileId: file, lineRange: "1-10" })],
    );
    expect(next.map((r) => r.reviewer)).toEqual(["甲", "乙"]);
  });

  it("儲存合併後主列與 review_rows 同一人，無法配對舊列仍在", () => {
    const leftover = review({
      id: "old",
      reviewer: "舊",
      linkedCatFileId: "other",
      lineRange: "99-100",
    });
    const merged = mergeCatCollabSavePayload(
      [
        collab({
          id: "cr-2",
          linkedCatFileId: file,
          lineRange: "9-13",
          reviewer: "譯者二（測試）",
          reviewerUserId: "uid-t2",
        }),
      ],
      [
        leftover,
        review({
          id: "cr-2",
          linkedCatFileId: file,
          lineRange: "9-13",
          reviewer: "譯者一（測試）",
          reviewerUserId: "uid-t1",
        }),
      ],
    );
    expect(merged.collabRows[0]).toEqual(
      expect.objectContaining({ reviewer: "譯者一（測試）", reviewerUserId: "uid-t1" }),
    );
    expect(merged.reviewRows.map((r) => r.reviewer)).toEqual(["舊", "譯者一（測試）"]);
  });
});
