import type { CaseStatus, CollabRow } from "@/data/case-types";

export type WorkflowActor = {
  userId?: string | null;
  displayName?: string | null;
  isPmOrAbove: boolean;
};

export type SharedRowWorkflow = {
  hasTranslator: boolean;
  hasReviewer: boolean;
  accepted: boolean;
  reviewAssigned: boolean;
  taskCompleted: boolean;
  reviewCompleted: boolean;
  delivered: boolean;
  translateLockedByReview: boolean;
  reviewLockedByDelivered: boolean;
  canClearPeople: boolean;
  canConfirmAccept: boolean;
  canCheckTaskCompleted: boolean;
  canUncheckTaskCompleted: boolean;
  canConfirmReviewAssign: boolean;
  canCheckReviewCompleted: boolean;
  canUncheckReviewCompleted: boolean;
  canCheckDelivered: boolean;
  canUncheckDelivered: boolean;
};

const PAST_INQUIRY: CaseStatus[] = [
  "dispatched",
  "task_completed",
  "delivered",
  "feedback",
  "feedback_completed",
];

function trim(value: string | null | undefined): string {
  return String(value || "").trim();
}

export function hasPerson(name?: string | null, userId?: string | null): boolean {
  return Boolean(trim(name) || trim(userId));
}

/** 有人、已承接或已完成的工作列。空白列不參與「全部成立」判斷。 */
export function workRows(rows: CollabRow[] | undefined | null): CollabRow[] {
  return (Array.isArray(rows) ? rows : []).filter((row) =>
    hasPerson(row.translator, row.translatorUserId)
    || hasPerson(row.reviewer, row.reviewerUserId)
    || row.accepted
    || row.taskCompleted
    || row.reviewTaskCompleted
    || row.delivered,
  );
}

/**
 * 舊資料沒有 reviewAssigned 旗標時：
 * - 已審稿完成或已交件 → 視為已確認指派（下游完成必有上游）
 * - 已派出之後且列上已有審稿人 → 視為已確認，避免舊案全部變成未指派
 * - 不把舊案默認已完成
 */
export function isReviewAssigned(row: CollabRow, caseStatus: CaseStatus): boolean {
  if (row.reviewTaskCompleted || row.delivered) return true;
  if (row.reviewAssigned === true) return true;
  if (row.reviewAssigned === false) return false;
  return hasPerson(row.reviewer, row.reviewerUserId) && PAST_INQUIRY.includes(caseStatus);
}

export function isOwnTranslator(row: CollabRow, actor: WorkflowActor): boolean {
  const id = trim(actor.userId);
  const name = trim(actor.displayName);
  if (id && trim(row.translatorUserId) && id === trim(row.translatorUserId)) return true;
  return Boolean(name && trim(row.translator) === name);
}

export function isOwnReviewer(row: CollabRow, actor: WorkflowActor): boolean {
  const id = trim(actor.userId);
  const name = trim(actor.displayName);
  if (id && trim(row.reviewerUserId) && id === trim(row.reviewerUserId)) return true;
  return Boolean(name && trim(row.reviewer) === name);
}

export function deriveSharedRowWorkflow(
  row: CollabRow,
  caseStatus: CaseStatus,
  actor: WorkflowActor,
): SharedRowWorkflow {
  const hasTranslator = hasPerson(row.translator, row.translatorUserId);
  const hasReviewer = hasPerson(row.reviewer, row.reviewerUserId);
  const accepted = !!row.accepted;
  const reviewAssigned = isReviewAssigned(row, caseStatus);
  const taskCompleted = !!row.taskCompleted;
  const reviewCompleted = !!row.reviewTaskCompleted;
  const delivered = !!row.delivered;
  const translateLockedByReview = reviewCompleted;
  const reviewLockedByDelivered = delivered;
  const inquiry = caseStatus === "draft" || caseStatus === "inquiry";
  const canManagePeople = actor.isPmOrAbove && !reviewCompleted && !delivered;

  return {
    hasTranslator,
    hasReviewer,
    accepted,
    reviewAssigned,
    taskCompleted,
    reviewCompleted,
    delivered,
    translateLockedByReview,
    reviewLockedByDelivered,
    canClearPeople: canManagePeople,
    canConfirmAccept: inquiry && hasTranslator && (actor.isPmOrAbove || isOwnTranslator(row, actor)),
    canCheckTaskCompleted:
      !inquiry && !taskCompleted && hasTranslator && (actor.isPmOrAbove || isOwnTranslator(row, actor)),
    canUncheckTaskCompleted:
      !inquiry && taskCompleted && !translateLockedByReview && (actor.isPmOrAbove || isOwnTranslator(row, actor)),
    canConfirmReviewAssign:
      hasReviewer && !reviewAssigned && (actor.isPmOrAbove || isOwnReviewer(row, actor)),
    canCheckReviewCompleted:
      hasReviewer && reviewAssigned && !reviewCompleted && (actor.isPmOrAbove || isOwnReviewer(row, actor)),
    canUncheckReviewCompleted:
      reviewCompleted && !reviewLockedByDelivered && (actor.isPmOrAbove || isOwnReviewer(row, actor)),
    canCheckDelivered:
      reviewCompleted && !delivered && (actor.isPmOrAbove || isOwnReviewer(row, actor)),
    canUncheckDelivered:
      delivered && (actor.isPmOrAbove || isOwnReviewer(row, actor)),
  };
}

export function applyReviewCompletePatch(checked: boolean): Partial<CollabRow> {
  return checked
    ? { reviewTaskCompleted: true, taskCompleted: true, reviewAssigned: true }
    : { reviewTaskCompleted: false, delivered: false };
}

export function applyReviewAssignPatch(checked: boolean): Partial<CollabRow> {
  if (checked) return { reviewAssigned: true };
  return { reviewAssigned: false, reviewTaskCompleted: false, delivered: false };
}

export function applyDeliveredPatch(checked: boolean): Partial<CollabRow> {
  return checked ? { delivered: true } : { delivered: false };
}

export function applyPeoplePatch(
  row: CollabRow,
  caseStatus: CaseStatus,
  patch: Partial<Pick<CollabRow, "translator" | "translatorUserId" | "reviewer" | "reviewerUserId">>,
): { ok: boolean; next: CollabRow; reason?: string } {
  if (row.reviewTaskCompleted || row.delivered) {
    return { ok: false, next: row, reason: "已審稿完成或已交件，須先取消下游狀態才能換人" };
  }
  return { ok: true, next: { ...row, ...patch } };
}

export type CaseStatusFromRows =
  | { status: CaseStatus; reason: "keep" }
  | { status: "inquiry"; reason: "partial-accept" }
  | { status: "dispatched"; reason: "all-accepted" | "reopen" }
  | { status: "task_completed"; reason: "all-translated" | "undeliver" }
  | { status: "delivered"; reason: "all-delivered" };

/** 詢案未全部承接保持詢案；齊全後依交件／翻譯完成重算。空白列不推進。 */
export function deriveCaseStatusFromRows(
  current: CaseStatus,
  rows: CollabRow[] | undefined | null,
): CaseStatusFromRows {
  if (current === "draft" || current === "feedback" || current === "feedback_completed") {
    return { status: current, reason: "keep" };
  }
  const work = workRows(rows);
  if (!work.length) return { status: current, reason: "keep" };

  const allAccepted = work.every((row) => row.accepted && hasPerson(row.translator, row.translatorUserId));
  const allTranslated = work.every((row) => row.taskCompleted);
  const allDelivered = work.every((row) => row.delivered);

  if (current === "inquiry") {
    if (allAccepted) return { status: "dispatched", reason: "all-accepted" };
    return { status: "inquiry", reason: "partial-accept" };
  }
  if (allDelivered) return { status: "delivered", reason: "all-delivered" };
  if (allTranslated) return { status: "task_completed", reason: current === "delivered" ? "undeliver" : "all-translated" };
  if (current === "delivered" || current === "task_completed") {
    return { status: "dispatched", reason: "reopen" };
  }
  return { status: current, reason: "keep" };
}

/** 案件頁保存時採用 derive 的下一狀態；keep／部分承接不改。 */
export function statusPatchFromDerived(
  current: CaseStatus,
  derived: CaseStatusFromRows,
): CaseStatus | undefined {
  if (derived.reason === "keep" || derived.reason === "partial-accept") return undefined;
  if (derived.status === current) return undefined;
  return derived.status;
}

export type BulkCheckKind =
  | "taskCompleted"
  | "reviewAssigned"
  | "reviewTaskCompleted"
  | "delivered";

export type BulkCheckResult = {
  next: CollabRow[];
  success: number;
  skipped: number;
  failed: number;
};

export function applyBulkCheck(
  rows: CollabRow[],
  caseStatus: CaseStatus,
  actor: WorkflowActor,
  kind: BulkCheckKind,
): BulkCheckResult {
  let success = 0;
  let skipped = 0;
  const next = rows.map((row) => {
    const wf = deriveSharedRowWorkflow(row, caseStatus, actor);
    if (kind === "taskCompleted") {
      if (row.taskCompleted) { skipped += 1; return row; }
      if (!wf.canCheckTaskCompleted) { skipped += 1; return row; }
      success += 1;
      return { ...row, taskCompleted: true };
    }
    if (kind === "reviewAssigned") {
      if (wf.reviewAssigned) { skipped += 1; return row; }
      if (!wf.canConfirmReviewAssign) { skipped += 1; return row; }
      success += 1;
      return { ...row, reviewAssigned: true };
    }
    if (kind === "reviewTaskCompleted") {
      if (row.reviewTaskCompleted) { skipped += 1; return row; }
      if (!wf.canCheckReviewCompleted) { skipped += 1; return row; }
      success += 1;
      return { ...row, ...applyReviewCompletePatch(true) };
    }
    if (row.delivered) { skipped += 1; return row; }
    if (!wf.canCheckDelivered) { skipped += 1; return row; }
    success += 1;
    return { ...row, delivered: true };
  });
  return { next, success, skipped, failed: 0 };
}

export function applyBulkUncheck(
  rows: CollabRow[],
  caseStatus: CaseStatus,
  actor: WorkflowActor,
  kind: Extract<BulkCheckKind, "reviewTaskCompleted" | "delivered">,
): BulkCheckResult {
  let success = 0;
  let skipped = 0;
  const next = rows.map((row) => {
    const wf = deriveSharedRowWorkflow(row, caseStatus, actor);
    if (kind === "reviewTaskCompleted") {
      if (!row.reviewTaskCompleted) { skipped += 1; return row; }
      if (!wf.canUncheckReviewCompleted) { skipped += 1; return row; }
      success += 1;
      return { ...row, ...applyReviewCompletePatch(false) };
    }
    if (!row.delivered) { skipped += 1; return row; }
    if (!wf.canUncheckDelivered) { skipped += 1; return row; }
    success += 1;
    return { ...row, delivered: false };
  });
  return { next, success, skipped, failed: 0 };
}

export type CatRollbackKind =
  | "translate-reopen"
  | "review-reopen"
  | "review-complete"
  | "translate-complete"
  | "earlier-stage";

/** CAT 已保存變更對單一共用列的 LMS 結果。不改人員、承接或交期。 */
export function applyCatRollbackToRow(row: CollabRow, kind: CatRollbackKind): CollabRow {
  if (kind === "translate-reopen" || kind === "earlier-stage") {
    return { ...row, taskCompleted: false, reviewTaskCompleted: false, delivered: false };
  }
  if (kind === "review-reopen") {
    return { ...row, reviewTaskCompleted: false, delivered: false };
  }
  if (kind === "review-complete") {
    return { ...row, taskCompleted: true, reviewTaskCompleted: true, reviewAssigned: true };
  }
  return { ...row, taskCompleted: true };
}

export function describeBulkCheck(result: BulkCheckResult): string {
  return `成功 ${result.success}、略過 ${result.skipped}、失敗 ${result.failed}`;
}
