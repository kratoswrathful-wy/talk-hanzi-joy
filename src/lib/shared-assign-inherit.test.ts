import { describe, expect, it } from "vitest";
import type { CollabRow, ReviewCollabRow } from "@/data/case-types";
import {
  applyMergeableLegacyReviews,
  applySafeLegacyReviewConversion,
  applyWholeCaseReviewToSharedRows,
  attachLinkedFilesToWholeFileReview,
  classifyLegacyReviewRows,
  describeInheritFailure,
  matchSharedRowsForLinkedFile,
} from "./shared-assign-inherit";

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

function review(partial: Partial<ReviewCollabRow> & { id: string }): ReviewCollabRow {
  return {
    segment: "",
    reviewer: "",
    reviewDeadline: null,
    taskCompleted: false,
    ...partial,
  };
}

describe("attachLinkedFilesToWholeFileReview", () => {
  it("沒有連結檔時維持原列，不捏造檔案編號", () => {
    const rows = [review({ id: "r1", reviewer: "甲" })];
    expect(attachLinkedFilesToWholeFileReview(rows, [])).toEqual(rows);
  });

  it("單人整案審稿補上已連結檔案", () => {
    const next = attachLinkedFilesToWholeFileReview(
      [review({ id: "r1", reviewer: "甲", reviewerUserId: "u1" })],
      [{ id: "file-1", name: "a.xlsx" }],
    );
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("r1");
    expect(next[0].linkedCatFileId).toBe("file-1");
    expect(next[0].reviewer).toBe("甲");
  });

  it("兩個已連結檔各建一列，重跑不重複", () => {
    const first = attachLinkedFilesToWholeFileReview(
      [review({ id: "r1", reviewer: "甲", reviewerUserId: "u1" })],
      [
        { id: "file-1", name: "a.xlsx" },
        { id: "file-2", name: "b.xlsx" },
      ],
    );
    expect(first).toHaveLength(2);
    expect(first.map((r) => r.linkedCatFileId).sort()).toEqual(["file-1", "file-2"]);
    const again = attachLinkedFilesToWholeFileReview(first, [
      { id: "file-1", name: "a.xlsx" },
      { id: "file-2", name: "b.xlsx" },
    ]);
    expect(again).toHaveLength(2);
  });
});

describe("matchSharedRowsForLinkedFile", () => {
  it("全列未綁檔、未寫範圍 → 整案指派", () => {
    expect(
      matchSharedRowsForLinkedFile({
        fileId: "f1",
        fileName: "a.xlsx",
        collabRows: [collab({ id: "c1", translator: "甲" }), collab({ id: "c2", translator: "乙" })],
      }),
    ).toEqual({ kind: "whole-case" });
  });

  it("已綁同一檔的唯一列才承接", () => {
    const match = matchSharedRowsForLinkedFile({
      fileId: "f1",
      fileName: "a.xlsx",
      collabRows: [
        collab({ id: "c1", linkedCatFileId: "f1", translator: "甲" }),
        collab({ id: "c2", linkedCatFileId: "f2", translator: "乙" }),
      ],
    });
    expect(match.kind).toBe("unique");
    if (match.kind === "unique") expect(match.collabRows.map((r) => r.id)).toEqual(["c1"]);
  });

  it("純文字檔名唯一才可對應，同名多列要確認", () => {
    const unique = matchSharedRowsForLinkedFile({
      fileId: "f-new",
      fileName: "說明.xlsx",
      collabRows: [
        collab({ id: "c1", segment: "說明.xlsx", translator: "甲" }),
        collab({ id: "c2", segment: "另一份.xlsx", translator: "乙" }),
      ],
    });
    expect(unique.kind).toBe("unique");

    const ambiguous = matchSharedRowsForLinkedFile({
      fileId: "f-new",
      fileName: "說明.xlsx",
      collabRows: [
        collab({ id: "c1", segment: "說明.xlsx", lineRange: "1-10", translator: "甲" }),
        collab({ id: "c2", segment: "說明.xlsx", lineRange: "11-20", translator: "乙" }),
      ],
    });
    expect(ambiguous.kind).toBe("ambiguous");
  });

  it("不依列序把第一列當成目標檔", () => {
    expect(
      matchSharedRowsForLinkedFile({
        fileId: "f-new",
        fileName: "沒人寫過的檔.xlsx",
        collabRows: [
          collab({ id: "c1", segment: "其他.xlsx", translator: "甲" }),
          collab({ id: "c2", segment: "另一份.xlsx", translator: "乙" }),
        ],
      }),
    ).toEqual({ kind: "none" });
  });
});

describe("classifyLegacyReviewRows", () => {
  it("同檔同範圍唯一 → 可合併", () => {
    const classes = classifyLegacyReviewRows({
      collabRows: [collab({ id: "c1", linkedCatFileId: "f1", lineRange: "1-10" })],
      reviewRows: [review({ id: "r1", reviewer: "甲", linkedCatFileId: "f1", lineRange: "1-10" })],
    });
    expect(classes).toEqual([
      expect.objectContaining({ kind: "mergeable", collabId: "c1" }),
    ]);
  });

  it("純文字同檔名同範圍也可合併", () => {
    const classes = classifyLegacyReviewRows({
      collabRows: [collab({ id: "c1", segment: "說明.xlsx", lineRange: "1-2" })],
      reviewRows: [review({ id: "r1", reviewer: "甲", segment: "說明.xlsx", lineRange: "1-2" })],
    });
    expect(classes[0]).toMatchObject({ kind: "mergeable", collabId: "c1" });
  });

  it("主列已有不同審稿人 → 衝突，不覆蓋", () => {
    const classes = classifyLegacyReviewRows({
      collabRows: [collab({ id: "c1", linkedCatFileId: "f1", reviewer: "乙", reviewerUserId: "u2" })],
      reviewRows: [review({ id: "r1", reviewer: "甲", reviewerUserId: "u1", linkedCatFileId: "f1" })],
    });
    expect(classes[0]).toMatchObject({ kind: "conflict", reason: "mismatch" });
  });

  it("跨範圍一對多不猜", () => {
    const classes = classifyLegacyReviewRows({
      collabRows: [collab({ id: "c1", linkedCatFileId: "f1", lineRange: "1-20" })],
      reviewRows: [
        review({ id: "r1", reviewer: "甲", linkedCatFileId: "f1", lineRange: "1-10" }),
        review({ id: "r2", reviewer: "乙", linkedCatFileId: "f1", lineRange: "11-20" }),
      ],
    });
    expect(classes.every((item) => item.kind === "conflict")).toBe(true);
  });
});

describe("apply merge / whole-case", () => {
  it("可合併列寫回人員與交期，不改另一列", () => {
    const next = applyMergeableLegacyReviews(
      [
        collab({ id: "c1", linkedCatFileId: "f1" }),
        collab({ id: "c2", linkedCatFileId: "f2", reviewer: "原" }),
      ],
      [
        {
          kind: "mergeable",
          collabId: "c1",
          review: review({ id: "r1", reviewer: "甲", reviewDeadline: "2026-10-01T00:00:00.000Z" }),
        },
      ],
    );
    expect(next[0].reviewer).toBe("甲");
    expect(next[1].reviewer).toBe("原");
  });

  it("整案審稿只填空白列，不覆蓋已有人員", () => {
    const next = applyWholeCaseReviewToSharedRows(
      [
        collab({ id: "c1" }),
        collab({ id: "c2", reviewer: "已有" }),
      ],
      review({ id: "r1", reviewer: "甲" }),
    );
    expect(next[0].reviewer).toBe("甲");
    expect(next[1].reviewer).toBe("已有");
  });
});

describe("applySafeLegacyReviewConversion", () => {
  it("可合併與整案審稿寫回共用列，衝突列不覆蓋另一列", () => {
    const next = applySafeLegacyReviewConversion(
      [
        collab({ id: "c1", linkedCatFileId: "f1", lineRange: "1-10" }),
        collab({ id: "c2", linkedCatFileId: "f2", reviewer: "已有", reviewerUserId: "u9" }),
      ],
      [
        review({ id: "r1", reviewer: "甲", linkedCatFileId: "f1", lineRange: "1-10" }),
        review({ id: "r2", reviewer: "乙", linkedCatFileId: "f9", lineRange: "99-100" }),
      ],
    );
    expect(next.collabRows[0].reviewer).toBe("甲");
    expect(next.collabRows[1].reviewer).toBe("已有");
    expect(next.conflicts.map((item) => item.review.id)).toEqual(["r2"]);
    expect(next.reviewRows.some((row) => row.reviewer === "乙")).toBe(true);
  });
});

describe("describeInheritFailure", () => {
  it("匯入成功、帶入失敗要分開說", () => {
    const msg = describeInheritFailure({ importOk: true, inheritOk: false });
    expect(msg.title).toContain("檔案已匯入");
    expect(msg.description).toContain("不必再匯入");
  });
});
