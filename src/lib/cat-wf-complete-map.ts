import { collabReviewScopeKey } from "@/lib/collab-review-pair";

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
      ? { ...r, reviewTaskCompleted: true, taskCompleted: true }
      : { ...r, reviewTaskCompleted: false };
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
            ? { ...r, reviewTaskCompleted: true, taskCompleted: true }
            : { ...r, reviewTaskCompleted: false };
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
 * CAT 完成／取消（22:39）：
 * - 翻譯完成／取消只動 collab_rows.taskCompleted（手動取消翻譯不改審稿）。
 * - 審稿完成同時把對應範圍 collab_rows.taskCompleted 設為 true。
 * - 手動取消審稿只清 review 旗標，保留翻譯完成。
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
      collabRows = collabRows.map((r) =>
        String(r.id) === id ? { ...r, taskCompleted: completed } : r,
      );
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
