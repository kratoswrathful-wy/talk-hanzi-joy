import { describe, expect, it } from "vitest";
import {
  applyCatCompleteToCaseRows,
  parseCatWfCompleteKind,
} from "./cat-wf-complete-map";

const collab = {
  id: "row-1",
  segment: "檔 A 1-10",
  translator: "譯者一",
  reviewer: "審稿一",
  reviewerUserId: "rev-1",
  linkedCatFileId: "file-1",
  lineRange: "1-10",
  taskCompleted: false,
  reviewTaskCompleted: false,
};

const review = {
  id: "row-1",
  segment: "檔 A 1-10",
  reviewer: "審稿一",
  reviewerUserId: "rev-1",
  linkedCatFileId: "file-1",
  lineRange: "1-10",
  taskCompleted: false,
};

describe("parseCatWfCompleteKind", () => {
  it("defaults unknown and missing to translate so CAT 舊訊息不會誤寫審稿", () => {
    expect(parseCatWfCompleteKind(undefined)).toBe("translate");
    expect(parseCatWfCompleteKind("")).toBe("translate");
    expect(parseCatWfCompleteKind("REVIEW")).toBe("review");
  });
});

describe("applyCatCompleteToCaseRows", () => {
  it("completing translate does not flip review flags on the same id", () => {
    const out = applyCatCompleteToCaseRows({
      collabRows: [collab],
      reviewRows: [review],
      updates: [{ collabRowId: "row-1", taskCompleted: true, stageKind: "translate" }],
    });
    expect(out.collabRows[0].taskCompleted).toBe(true);
    expect(out.collabRows[0].reviewTaskCompleted).toBe(false);
    expect(out.reviewRows[0].taskCompleted).toBe(false);
    expect(out.allTranslateCompleted).toBe(true);
    expect(out.anyTranslateTouched).toBe(true);
  });

  it("completing review does not flip translate on the same id", () => {
    const out = applyCatCompleteToCaseRows({
      collabRows: [{ ...collab, taskCompleted: true }],
      reviewRows: [review],
      updates: [{ collabRowId: "row-1", taskCompleted: true, stageKind: "review" }],
    });
    expect(out.collabRows[0].taskCompleted).toBe(true);
    expect(out.collabRows[0].reviewTaskCompleted).toBe(true);
    expect(out.reviewRows[0].taskCompleted).toBe(true);
    expect(out.anyTranslateTouched).toBe(false);
  });

  it("cancelling review keeps translate complete", () => {
    const out = applyCatCompleteToCaseRows({
      collabRows: [{ ...collab, taskCompleted: true, reviewTaskCompleted: true }],
      reviewRows: [{ ...review, taskCompleted: true }],
      updates: [{ collabRowId: "row-1", taskCompleted: false, stageKind: "review" }],
    });
    expect(out.collabRows[0].taskCompleted).toBe(true);
    expect(out.collabRows[0].reviewTaskCompleted).toBe(false);
    expect(out.reviewRows[0].taskCompleted).toBe(false);
  });

  it("cancelling translate keeps review complete", () => {
    const out = applyCatCompleteToCaseRows({
      collabRows: [{ ...collab, taskCompleted: true, reviewTaskCompleted: true }],
      reviewRows: [{ ...review, taskCompleted: true }],
      updates: [{ collabRowId: "row-1", taskCompleted: false, stageKind: "translate" }],
    });
    expect(out.collabRows[0].taskCompleted).toBe(false);
    expect(out.collabRows[0].reviewTaskCompleted).toBe(true);
    expect(out.reviewRows[0].taskCompleted).toBe(true);
    expect(out.allTranslateCompleted).toBe(false);
  });

  it("pairs a uniquely scoped review row when ids differ", () => {
    const out = applyCatCompleteToCaseRows({
      collabRows: [collab],
      reviewRows: [{ ...review, id: "rev-row-9" }],
      updates: [{ collabRowId: "row-1", taskCompleted: true, stageKind: "review" }],
    });
    expect(out.collabRows[0].reviewTaskCompleted).toBe(true);
    expect(out.reviewRows[0].id).toBe("rev-row-9");
    expect(out.reviewRows[0].taskCompleted).toBe(true);
    expect(out.collabRows[0].taskCompleted).toBe(false);
  });

  it("CAT review assignment id writes collab.reviewTaskCompleted via unique scope", () => {
    const out = applyCatCompleteToCaseRows({
      collabRows: [collab],
      reviewRows: [{ ...review, id: "rev-row-9" }],
      updates: [{ collabRowId: "rev-row-9", taskCompleted: true, stageKind: "review" }],
    });
    expect(out.collabRows[0].reviewTaskCompleted).toBe(true);
    expect(out.collabRows[0].taskCompleted).toBe(false);
    expect(out.reviewRows[0].taskCompleted).toBe(true);
  });

  it("bulk mixed complete writes each kind independently", () => {
    const row2 = { ...collab, id: "row-2", lineRange: "11-20", taskCompleted: false };
    const out = applyCatCompleteToCaseRows({
      collabRows: [collab, row2],
      reviewRows: [review, { ...review, id: "row-2", lineRange: "11-20" }],
      updates: [
        { collabRowId: "row-1", taskCompleted: true, stageKind: "translate" },
        { collabRowId: "row-1", taskCompleted: true, stageKind: "review" },
      ],
    });
    expect(out.collabRows[0].taskCompleted).toBe(true);
    expect(out.collabRows[0].reviewTaskCompleted).toBe(true);
    expect(out.collabRows[1].taskCompleted).toBe(false);
    expect(out.collabRows[1].reviewTaskCompleted).toBe(false);
    expect(out.reviewRows[0].taskCompleted).toBe(true);
    expect(out.reviewRows[1].taskCompleted).toBe(false);
  });
});
