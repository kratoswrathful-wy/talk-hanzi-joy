import type { CaseStatus, CollabRow } from "@/data/case-types";
import { collabReviewScopeKey } from "@/lib/collab-review-pair";
import { deriveCaseStatusFromRows, statusPatchFromDerived } from "@/lib/shared-row-workflow";

export type CollabRowJson = {
  id: string;
  taskCompleted?: boolean;
  reviewTaskCompleted?: boolean;
  reviewer?: string | null;
  reviewerUserId?: string | null;
  linkedCatFileId?: string | null;
  linkedCatViewId?: string | null;
  lineRange?: string | null;
  [key: string]: unknown;
};

export type CatWfCompleteKind = "translate" | "review";

export type CatCompleteRowUpdate = {
  collabRowId: string;
  taskCompleted: boolean;
  stageKind?: CatWfCompleteKind | string | null;
};

export function parseCatWfCompleteKind(raw: unknown): CatWfCompleteKind {
  return String(raw ?? "").trim().toLowerCase() === "review" ? "review" : "translate";
}

export type CatLmsMemberWrite =
  | { action: "complete_case_collab_row"; collabRowId: string }
  | { action: "complete_case_translation" }
  | { action: "reopen_own_cat_complete_on_edit"; collabRowId: string }
  | { action: "reopen_own_case_translation" }
  | { action: "pm_update_case_assignments" };

/** 譯者本人完成／取消自己那一列用成員 RPC；其餘（含主管代寫、審稿完成）走主管指派寫入。 */
export function resolveCatLmsMemberWrite(input: {
  taskCompleted: boolean;
  stageKind: CatWfCompleteKind;
  collabRowId?: string | null;
  actorUserId: string;
  translatorUserId?: string | null;
}): CatLmsMemberWrite {
  const collabRowId = String(input.collabRowId || "").trim();
  const actor = String(input.actorUserId || "");
  const translator = String(input.translatorUserId || "");
  if (!collabRowId) {
    return input.taskCompleted
      ? { action: "complete_case_translation" }
      : { action: "reopen_own_case_translation" };
  }
  if (actor && translator && actor === translator) {
    if (input.taskCompleted && input.stageKind === "translate") {
      return { action: "complete_case_collab_row", collabRowId };
    }
    if (!input.taskCompleted) {
      return { action: "reopen_own_cat_complete_on_edit", collabRowId };
    }
  }
  return { action: "pm_update_case_assignments" };
}

function hasReviewer(row: CollabRowJson): boolean {
  return Boolean(String(row.reviewer || "").trim() || String(row.reviewerUserId || "").trim());
}

function applyOneReviewComplete(
  collabRows: CollabRowJson[],
  reviewRows: CollabRowJson[],
  collabRowId: string,
  completed: boolean,
): { collabRows: CollabRowJson[]; reviewRows: CollabRowJson[] } {
  const id = String(collabRowId);
  let nextCollab = collabRows.map((r) => {
    if (String(r.id) !== id) return r;
    return completed
      ? { ...r, reviewTaskCompleted: true, taskCompleted: true, reviewAssigned: true }
      : { ...r, reviewTaskCompleted: false, delivered: false };
  });
  const collab = nextCollab.find((r) => String(r.id) === id);
  let reviewTouched = false;
  let nextReview = reviewRows.map((r) => {
    if (String(r.id) === id) {
      reviewTouched = true;
      return { ...r, taskCompleted: completed };
    }
    return r;
  });
  if (!reviewTouched && collab) {
    const key = collabReviewScopeKey(collab);
    const matches = key
      ? nextReview.filter((r) => collabReviewScopeKey(r) === key)
      : [];
    if (matches.length === 1) {
      const pairId = String(matches[0].id);
      nextReview = nextReview.map((r) =>
        String(r.id) === pairId ? { ...r, taskCompleted: completed } : r,
      );
      reviewTouched = true;
    }
  }
  if (!collab) {
    const reviewHit = nextReview.find((r) => String(r.id) === id);
    if (reviewHit) {
      const key = collabReviewScopeKey(reviewHit);
      const matches = key
        ? nextCollab.filter((r) => collabReviewScopeKey(r) === key)
        : [];
      if (matches.length === 1) {
        const pairId = String(matches[0].id);
        nextCollab = nextCollab.map((r) => {
          if (String(r.id) !== pairId) return r;
          return completed
            ? { ...r, reviewTaskCompleted: true, taskCompleted: true, reviewAssigned: true }
            : { ...r, reviewTaskCompleted: false, delivered: false };
        });
      }
    }
  }
  if (!reviewTouched && collab && hasReviewer(collab)) {
    nextReview = [
      ...nextReview,
      {
        id: String(collab.id),
        segment: String(collab.segment ?? ""),
        reviewer: String(collab.reviewer ?? ""),
        reviewerUserId: collab.reviewerUserId ?? null,
        reviewDeadline: collab.reviewDeadline ?? null,
        taskCompleted: completed,
        linkedCatFileId: collab.linkedCatFileId ?? null,
        linkedCatViewId: collab.linkedCatViewId ?? null,
        lineRange: collab.lineRange ?? null,
        scopeLabel: collab.scopeLabel ?? null,
        accepted: true,
      },
    ];
  }
  return { collabRows: nextCollab, reviewRows: nextReview };
}

/**
 * CAT 完成／取消（1256）：
 * - 翻譯取消連帶清審稿完成與交件。
 * - 審稿完成同時把對應範圍翻譯完成設為 true。
 * - 手動取消審稿清交件，保留翻譯完成。
 */
export function applyCatCompleteToCaseRows(input: {
  collabRows: CollabRowJson[];
  reviewRows: CollabRowJson[];
  updates: CatCompleteRowUpdate[];
}): {
  collabRows: CollabRowJson[];
  reviewRows: CollabRowJson[];
  allTranslateCompleted: boolean;
  anyTranslateTouched: boolean;
} {
  let collabRows = input.collabRows.map((r) => ({ ...r }));
  let reviewRows = input.reviewRows.map((r) => ({ ...r }));
  let anyTranslateTouched = false;

  for (const u of input.updates) {
    const id = String(u.collabRowId || "");
    if (!id) continue;
    const completed = !!u.taskCompleted;
    if (parseCatWfCompleteKind(u.stageKind) === "translate") {
      anyTranslateTouched = true;
      collabRows = collabRows.map((r) => {
        if (String(r.id) !== id) return r;
        if (completed) return { ...r, taskCompleted: true };
        return { ...r, taskCompleted: false, reviewTaskCompleted: false, delivered: false };
      });
      if (!completed) {
        const hit = collabRows.find((r) => String(r.id) === id);
        const key = hit ? collabReviewScopeKey(hit) : "";
        reviewRows = reviewRows.map((r) => {
          if (String(r.id) === id) return { ...r, taskCompleted: false };
          if (key && collabReviewScopeKey(r) === key) return { ...r, taskCompleted: false };
          return r;
        });
      }
      continue;
    }
    const applied = applyOneReviewComplete(collabRows, reviewRows, id, completed);
    collabRows = applied.collabRows;
    reviewRows = applied.reviewRows;
    if (completed) anyTranslateTouched = true;
  }

  return {
    collabRows,
    reviewRows,
    allTranslateCompleted:
      collabRows.length > 0 && collabRows.every((r) => !!r.taskCompleted),
    anyTranslateTouched,
  };
}

/** LMS 勾選審稿完成時一併帶翻譯完成；取消審稿不取消翻譯。 */
export function collabRowPatchFromReviewCompleteCheck(checked: boolean): {
  reviewTaskCompleted: boolean;
  taskCompleted?: true;
} {
  return checked
    ? { reviewTaskCompleted: true, taskCompleted: true }
    : { reviewTaskCompleted: false };
}

const ELIGIBLE_TASK_COMPLETED_STATUSES = ["draft", "inquiry", "dispatched"] as const;

function canUpgradeCaseToTaskCompleted(status?: string) {
  return (ELIGIBLE_TASK_COMPLETED_STATUSES as readonly string[]).includes(status ?? "");
}

/** CAT 翻譯完成／重開時，案件狀態補丁。已交件且翻譯未齊要退回已派出。 */
export function statusPatchFromTranslate(
  status: string | undefined,
  applied: { allTranslateCompleted: boolean; anyTranslateTouched: boolean },
  taskCompletedHint?: boolean,
): Record<string, unknown> {
  if (!applied.anyTranslateTouched) return {};
  if (taskCompletedHint && canUpgradeCaseToTaskCompleted(status) && applied.allTranslateCompleted) {
    return { status: "task_completed" };
  }
  if (!applied.allTranslateCompleted && (status === "task_completed" || status === "delivered")) {
    return { status: "dispatched" };
  }
  if (applied.allTranslateCompleted && canUpgradeCaseToTaskCompleted(status)) {
    return { status: "task_completed" };
  }
  return {};
}

const CASE_STATUSES: CaseStatus[] = [
  "draft",
  "inquiry",
  "dispatched",
  "task_completed",
  "delivered",
  "feedback",
  "feedback_completed",
];

function asCaseStatus(raw: string | undefined): CaseStatus | undefined {
  return CASE_STATUSES.includes(raw as CaseStatus) ? (raw as CaseStatus) : undefined;
}

function asOptionalText(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

function collabRowsForStatusDerive(rows: CollabRowJson[]): CollabRow[] {
  return rows.map((r) => ({
    id: String(r.id ?? ""),
    segment: String(r.segment ?? ""),
    translator: String(r.translator ?? ""),
    unitCount: typeof r.unitCount === "number" ? r.unitCount : 0,
    accepted: !!r.accepted,
    translationDeadline: typeof r.translationDeadline === "string" ? r.translationDeadline : null,
    reviewer: String(r.reviewer ?? ""),
    reviewDeadline: typeof r.reviewDeadline === "string" ? r.reviewDeadline : null,
    translatorUserId: asOptionalText(r.translatorUserId),
    reviewerUserId: asOptionalText(r.reviewerUserId),
    taskCompleted: !!r.taskCompleted,
    reviewTaskCompleted: !!r.reviewTaskCompleted,
    delivered: !!r.delivered,
  }));
}

/**
 * CAT 調整狀態寫回案件頁：列勾選先算整案狀態。
 * 只重開審稿時翻譯未動，舊補丁會略過，已交件標籤就停住。
 */
export function statusPatchFromCatComplete(
  status: string | undefined,
  applied: {
    collabRows: CollabRowJson[];
    allTranslateCompleted: boolean;
    anyTranslateTouched: boolean;
  },
  taskCompletedHint?: boolean,
): Record<string, unknown> {
  const current = asCaseStatus(status);
  if (current) {
    const fromRows = statusPatchFromDerived(
      current,
      deriveCaseStatusFromRows(current, collabRowsForStatusDerive(applied.collabRows)),
    );
    if (fromRows) return { status: fromRows };
  }
  return statusPatchFromTranslate(status, applied, taskCompletedHint);
}
