import { describe, expect, it } from "vitest";
import {
  applyCatCompleteToCaseRows,
  collabRowPatchFromReviewCompleteCheck,
  parseCatWfCompleteKind,
  resolveCatLmsMemberWrite,
  shouldSkipOwnTranslatorReopen,
  statusPatchFromCatComplete,
  statusPatchFromTranslate,
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

  it("completing review also completes corresponding translate on the same id", () => {
    const out = applyCatCompleteToCaseRows({
      collabRows: [collab],
      reviewRows: [review],
      updates: [{ collabRowId: "row-1", taskCompleted: true, stageKind: "review" }],
    });
    expect(out.collabRows[0].taskCompleted).toBe(true);
    expect(out.collabRows[0].reviewTaskCompleted).toBe(true);
    expect(out.reviewRows[0].taskCompleted).toBe(true);
    expect(out.anyTranslateTouched).toBe(true);
    expect(out.allTranslateCompleted).toBe(true);
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

  it("cancelling review also clears delivered but keeps translate complete", () => {
    const out = applyCatCompleteToCaseRows({
      collabRows: [{ ...collab, taskCompleted: true, reviewTaskCompleted: true, delivered: true }],
      reviewRows: [{ ...review, taskCompleted: true }],
      updates: [{ collabRowId: "row-1", taskCompleted: false, stageKind: "review" }],
    });
    expect(out.collabRows[0].taskCompleted).toBe(true);
    expect(out.collabRows[0].reviewTaskCompleted).toBe(false);
    expect(out.collabRows[0].delivered).toBe(false);
    expect(out.reviewRows[0].taskCompleted).toBe(false);
  });

  it("cancelling translate also clears review complete and delivered", () => {
    const out = applyCatCompleteToCaseRows({
      collabRows: [{ ...collab, taskCompleted: true, reviewTaskCompleted: true, delivered: true }],
      reviewRows: [{ ...review, taskCompleted: true }],
      updates: [{ collabRowId: "row-1", taskCompleted: false, stageKind: "translate" }],
    });
    expect(out.collabRows[0].taskCompleted).toBe(false);
    expect(out.collabRows[0].reviewTaskCompleted).toBe(false);
    expect(out.collabRows[0].delivered).toBe(false);
    expect(out.reviewRows[0].taskCompleted).toBe(false);
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
    expect(out.collabRows[0].taskCompleted).toBe(true);
    expect(out.anyTranslateTouched).toBe(true);
  });

  it("CAT review assignment id writes collab.reviewTaskCompleted via unique scope", () => {
    const out = applyCatCompleteToCaseRows({
      collabRows: [collab],
      reviewRows: [{ ...review, id: "rev-row-9" }],
      updates: [{ collabRowId: "rev-row-9", taskCompleted: true, stageKind: "review" }],
    });
    expect(out.collabRows[0].reviewTaskCompleted).toBe(true);
    expect(out.collabRows[0].taskCompleted).toBe(true);
    expect(out.reviewRows[0].taskCompleted).toBe(true);
  });

  it("一段翻譯完成、另一段未完成時，整案翻譯不算全部完成", () => {
    const row2 = { ...collab, id: "row-2", lineRange: "11-20", taskCompleted: false };
    const out = applyCatCompleteToCaseRows({
      collabRows: [collab, row2],
      reviewRows: [review, { ...review, id: "row-2", lineRange: "11-20" }],
      updates: [{ collabRowId: "row-1", taskCompleted: true, stageKind: "translate" }],
    });
    expect(out.collabRows[0].taskCompleted).toBe(true);
    expect(out.collabRows[1].taskCompleted).toBe(false);
    expect(out.allTranslateCompleted).toBe(false);
  });

  it("兩段翻譯都完成後，整案翻譯才算全部完成", () => {
    const row2 = { ...collab, id: "row-2", lineRange: "11-20", taskCompleted: false };
    const out = applyCatCompleteToCaseRows({
      collabRows: [{ ...collab, taskCompleted: true }, row2],
      reviewRows: [review, { ...review, id: "row-2", lineRange: "11-20" }],
      updates: [{ collabRowId: "row-2", taskCompleted: true, stageKind: "translate" }],
    });
    expect(out.collabRows[0].taskCompleted).toBe(true);
    expect(out.collabRows[1].taskCompleted).toBe(true);
    expect(out.allTranslateCompleted).toBe(true);
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

  it("translator edit bulk uncomplete clears both flags on that row only", () => {
    const row2 = {
      ...collab,
      id: "row-2",
      lineRange: "11-20",
      taskCompleted: true,
      reviewTaskCompleted: true,
    };
    const out = applyCatCompleteToCaseRows({
      collabRows: [
        { ...collab, taskCompleted: true, reviewTaskCompleted: true },
        row2,
      ],
      reviewRows: [
        { ...review, taskCompleted: true },
        { ...review, id: "row-2", lineRange: "11-20", taskCompleted: true },
      ],
      updates: [
        { collabRowId: "row-1", taskCompleted: false, stageKind: "translate" },
        { collabRowId: "row-1", taskCompleted: false, stageKind: "review" },
      ],
    });
    expect(out.collabRows[0].taskCompleted).toBe(false);
    expect(out.collabRows[0].reviewTaskCompleted).toBe(false);
    expect(out.reviewRows[0].taskCompleted).toBe(false);
    expect(out.collabRows[1].taskCompleted).toBe(true);
    expect(out.collabRows[1].reviewTaskCompleted).toBe(true);
    expect(out.reviewRows[1].taskCompleted).toBe(true);
    expect(out.anyTranslateTouched).toBe(true);
    expect(out.allTranslateCompleted).toBe(false);
  });

  it("列已退回且案件仍派出時略過重開 RPC", () => {
    expect(shouldSkipOwnTranslatorReopen({
      caseStatus: "dispatched",
      collabRows: [collab],
      reviewRows: [review],
      collabRowId: "row-1",
    })).toBe(true);
    expect(shouldSkipOwnTranslatorReopen({
      caseStatus: "dispatched",
      collabRows: [{ ...collab, taskCompleted: true }],
      reviewRows: [review],
      collabRowId: "row-1",
    })).toBe(false);
    expect(shouldSkipOwnTranslatorReopen({
      caseStatus: "delivered",
      collabRows: [collab],
      reviewRows: [review],
      collabRowId: "row-1",
    })).toBe(false);
  });

  it("譯者本人完成／取消走成員 RPC，主管代寫仍走指派寫入", () => {
    expect(resolveCatLmsMemberWrite({
      taskCompleted: true,
      stageKind: "translate",
      collabRowId: "row-1",
      actorUserId: "t1",
      translatorUserId: "t1",
    })).toEqual({ action: "complete_case_collab_row", collabRowId: "row-1" });
    expect(resolveCatLmsMemberWrite({
      taskCompleted: false,
      stageKind: "translate",
      collabRowId: "row-1",
      actorUserId: "t1",
      translatorUserId: "t1",
    })).toEqual({ action: "reopen_own_cat_complete_on_edit", collabRowId: "row-1" });
    expect(resolveCatLmsMemberWrite({
      taskCompleted: true,
      stageKind: "translate",
      actorUserId: "t1",
    })).toEqual({ action: "complete_case_translation" });
    expect(resolveCatLmsMemberWrite({
      taskCompleted: false,
      stageKind: "translate",
      actorUserId: "t1",
    })).toEqual({ action: "reopen_own_case_translation" });
    expect(resolveCatLmsMemberWrite({
      taskCompleted: true,
      stageKind: "review",
      collabRowId: "row-1",
      actorUserId: "pm",
      translatorUserId: "t1",
    })).toEqual({ action: "pm_update_case_assignments" });
  });

  it("已交件後翻譯重開，案件狀態補丁要退回已派出", () => {
    expect(statusPatchFromTranslate("delivered", {
      allTranslateCompleted: false,
      anyTranslateTouched: true,
    })).toEqual({ status: "dispatched" });
    expect(statusPatchFromTranslate("task_completed", {
      allTranslateCompleted: false,
      anyTranslateTouched: true,
    })).toEqual({ status: "dispatched" });
    expect(statusPatchFromTranslate("delivered", {
      allTranslateCompleted: true,
      anyTranslateTouched: true,
    })).toEqual({});
  });

  it("已交件後只重開審稿，案件狀態補丁要退回任務完成", () => {
    const applied = applyCatCompleteToCaseRows({
      collabRows: [
        { ...collab, id: "row-1", accepted: true, taskCompleted: true, reviewTaskCompleted: true, delivered: true },
        { ...collab, id: "row-2", accepted: true, taskCompleted: true, reviewTaskCompleted: true, delivered: true },
      ],
      reviewRows: [{ ...review, id: "row-1", taskCompleted: true }],
      updates: [{ collabRowId: "row-1", taskCompleted: false, stageKind: "review" }],
    });
    expect(applied.collabRows[0]).toMatchObject({
      taskCompleted: true,
      reviewTaskCompleted: false,
      delivered: false,
    });
    expect(applied.collabRows[1]).toMatchObject({
      taskCompleted: true,
      reviewTaskCompleted: true,
      delivered: true,
    });
    expect(applied.anyTranslateTouched).toBe(false);
    expect(statusPatchFromTranslate("delivered", applied)).toEqual({});
    expect(statusPatchFromCatComplete("delivered", applied)).toEqual({ status: "task_completed" });
  });

  it("LMS review checkbox patch completes translate when checking, keeps translate when unchecking", () => {
    expect(collabRowPatchFromReviewCompleteCheck(true)).toEqual({
      reviewTaskCompleted: true,
      taskCompleted: true,
    });
    expect(collabRowPatchFromReviewCompleteCheck(false)).toEqual({
      reviewTaskCompleted: false,
    });
  });
});
