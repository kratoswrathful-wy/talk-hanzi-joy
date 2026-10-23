import { describe, expect, it } from "vitest";
import type { CollabRow } from "@/data/case-types";
import {
  applyBulkCheck,
  applyCatRollbackToRow,
  applyPeoplePatch,
  applyReviewCompletePatch,
  deriveCaseStatusFromRows,
  deriveSharedRowWorkflow,
  isReviewAssigned,
  statusPatchFromDerived,
  workRows,
} from "./shared-row-workflow";

function row(partial: Partial<CollabRow> & { id: string }): CollabRow {
  return {
    segment: "檔",
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

const pm = { isPmOrAbove: true, userId: "pm", displayName: "PM" };
const t1 = { isPmOrAbove: false, userId: "u1", displayName: "譯者一" };
const r1 = { isPmOrAbove: false, userId: "u2", displayName: "審稿一" };

describe("workRows", () => {
  it("空白列不參與全部成立", () => {
    expect(workRows([row({ id: "empty" })])).toEqual([]);
    expect(workRows([row({ id: "a", translator: "甲" })]).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("isReviewAssigned", () => {
  it("缺旗標時不把舊案默認已完成，已完成或已派出有人則視為已指派", () => {
    expect(isReviewAssigned(row({ id: "1", reviewer: "甲" }), "inquiry")).toBe(false);
    expect(isReviewAssigned(row({ id: "1", reviewer: "甲" }), "dispatched")).toBe(true);
    expect(isReviewAssigned(row({ id: "1", reviewTaskCompleted: true }), "inquiry")).toBe(true);
    expect(isReviewAssigned(row({ id: "1", reviewAssigned: false, reviewer: "甲" }), "inquiry")).toBe(false);
  });
});

describe("deriveSharedRowWorkflow", () => {
  it("沒有譯者不能承接；沒有審稿不能確認指派或交件", () => {
    const empty = deriveSharedRowWorkflow(row({ id: "1" }), "inquiry", pm);
    expect(empty.canConfirmAccept).toBe(false);
    expect(empty.canConfirmReviewAssign).toBe(false);
    expect(empty.canCheckDelivered).toBe(false);
  });

  it("審稿已確認即可勾審稿完成，不必先勾翻譯完成", () => {
    const wf = deriveSharedRowWorkflow(
      row({
        id: "1",
        translator: "譯者一",
        translatorUserId: "u1",
        reviewer: "審稿一",
        reviewerUserId: "u2",
        reviewAssigned: true,
        accepted: true,
      }),
      "dispatched",
      r1,
    );
    expect(wf.canCheckReviewCompleted).toBe(true);
    expect(wf.taskCompleted).toBe(false);
  });

  it("審稿完成後鎖定翻譯勾選；交件後鎖定審稿勾選", () => {
    const wf = deriveSharedRowWorkflow(
      row({
        id: "1",
        translator: "譯者一",
        reviewer: "審稿一",
        accepted: true,
        taskCompleted: true,
        reviewAssigned: true,
        reviewTaskCompleted: true,
      }),
      "task_completed",
      pm,
    );
    expect(wf.canUncheckTaskCompleted).toBe(false);
    expect(wf.canUncheckReviewCompleted).toBe(true);
    const delivered = deriveSharedRowWorkflow(
      { ...row({ id: "1", reviewTaskCompleted: true, delivered: true, reviewer: "審稿一" }), taskCompleted: true, reviewAssigned: true },
      "delivered",
      pm,
    );
    expect(delivered.canUncheckReviewCompleted).toBe(false);
    expect(delivered.canUncheckDelivered).toBe(true);
  });

  it("譯者不能操作他人列", () => {
    const wf = deriveSharedRowWorkflow(
      row({ id: "1", translator: "譯者二", translatorUserId: "u9", accepted: true }),
      "dispatched",
      t1,
    );
    expect(wf.canCheckTaskCompleted).toBe(false);
  });
});

describe("applyReviewCompletePatch / people / case status", () => {
  it("勾審稿完成強制翻譯完成；取消審稿保留翻譯", () => {
    expect(applyReviewCompletePatch(true)).toEqual({
      reviewTaskCompleted: true,
      taskCompleted: true,
      reviewAssigned: true,
    });
    expect(applyReviewCompletePatch(false)).toEqual({ reviewTaskCompleted: false, delivered: false });
  });

  it("未完成列可清人；已審稿完成不能偷偷換人", () => {
    const open = applyPeoplePatch(row({ id: "1", reviewer: "甲" }), "dispatched", { reviewer: "", reviewerUserId: null });
    expect(open.ok).toBe(true);
    expect(open.next.reviewer).toBe("");
    const locked = applyPeoplePatch(
      row({ id: "1", reviewer: "甲", reviewTaskCompleted: true }),
      "task_completed",
      { reviewer: "", reviewerUserId: null },
    );
    expect(locked.ok).toBe(false);
  });

  it("部分承接保持詢案；全承接才已派出；全交件才交件完畢", () => {
    const a = row({ id: "a", translator: "甲", accepted: true });
    const b = row({ id: "b", translator: "乙", accepted: false });
    expect(deriveCaseStatusFromRows("inquiry", [a, b]).status).toBe("inquiry");
    expect(deriveCaseStatusFromRows("inquiry", [a, { ...b, accepted: true }]).status).toBe("dispatched");
    const done = [
      row({ id: "a", translator: "甲", accepted: true, taskCompleted: true, delivered: true }),
      row({ id: "b", translator: "乙", accepted: true, taskCompleted: true, delivered: true }),
    ];
    expect(deriveCaseStatusFromRows("task_completed", done).status).toBe("delivered");
    const oneUndeliver = [done[0], { ...done[1], delivered: false }];
    expect(deriveCaseStatusFromRows("delivered", oneUndeliver)).toEqual({
      status: "task_completed",
      reason: "undeliver",
    });
    expect(deriveCaseStatusFromRows("inquiry", [row({ id: "empty" })]).reason).toBe("keep");
  });

  it("已交件取消一列或全取消時，案件狀態要退回任務完成", () => {
    const both = [
      row({ id: "a", translator: "甲", accepted: true, taskCompleted: true, delivered: true }),
      row({ id: "b", translator: "乙", accepted: true, taskCompleted: true, delivered: true }),
    ];
    const oneOff = [both[0], { ...both[1], delivered: false }];
    const none = [{ ...both[0], delivered: false }, { ...both[1], delivered: false }];
    expect(statusPatchFromDerived("delivered", deriveCaseStatusFromRows("delivered", oneOff))).toBe("task_completed");
    expect(statusPatchFromDerived("delivered", deriveCaseStatusFromRows("delivered", none))).toBe("task_completed");
    expect(statusPatchFromDerived("delivered", deriveCaseStatusFromRows("delivered", both))).toBeUndefined();
  });

  it("已交件後翻譯重開，案件狀態退回已派出", () => {
    const rows = [
      row({ id: "a", translator: "甲", accepted: true, taskCompleted: false, reviewTaskCompleted: false, delivered: false }),
      row({ id: "b", translator: "乙", accepted: true, taskCompleted: true, reviewTaskCompleted: true, delivered: true }),
    ];
    expect(statusPatchFromDerived("delivered", deriveCaseStatusFromRows("delivered", rows))).toBe("dispatched");
  });
});

describe("applyBulkCheck / CAT rollback", () => {
  it("整欄只勾本人有權且條件符合的未勾列，不反轉已勾", () => {
    const rows = [
      row({ id: "own", translator: "譯者一", translatorUserId: "u1", accepted: true }),
      row({ id: "other", translator: "譯者二", translatorUserId: "u9", accepted: true }),
      row({ id: "done", translator: "譯者一", translatorUserId: "u1", accepted: true, taskCompleted: true }),
    ];
    const result = applyBulkCheck(rows, "dispatched", t1, "taskCompleted");
    expect(result.success).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.next.find((r) => r.id === "own")?.taskCompleted).toBe(true);
    expect(result.next.find((r) => r.id === "other")?.taskCompleted).toBe(false);
    expect(result.next.find((r) => r.id === "done")?.taskCompleted).toBe(true);
  });

  it("CAT 回退只動受影響列的完成／交件，不清人員", () => {
    const locked = row({
      id: "1",
      translator: "甲",
      reviewer: "乙",
      accepted: true,
      taskCompleted: true,
      reviewTaskCompleted: true,
      delivered: true,
    });
    const edit = applyCatRollbackToRow(locked, "translate-reopen");
    expect(edit.taskCompleted).toBe(false);
    expect(edit.reviewTaskCompleted).toBe(false);
    expect(edit.delivered).toBe(false);
    expect(edit.translator).toBe("甲");
    expect(applyCatRollbackToRow(locked, "review-reopen").taskCompleted).toBe(true);
    expect(applyCatRollbackToRow(locked, "review-complete").delivered).toBe(true);
  });
});
