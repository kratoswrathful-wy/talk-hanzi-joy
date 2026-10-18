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
  let nextCollab = collabRows.map((r) =>
    String(r.id) === id ? { ...r, reviewTaskCompleted: completed } : r,
  );
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
        nextCollab = nextCollab.map((r) =>
          String(r.id) === pairId ? { ...r, reviewTaskCompleted: completed } : r,
        );
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
 * CAT 完成／取消：翻譯只動 collab_rows.taskCompleted；
 * 審稿只動 collab_rows.reviewTaskCompleted 與對應 review_rows.taskCompleted。
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
  }

  return {
    collabRows,
    reviewRows,
    allTranslateCompleted:
      collabRows.length > 0 && collabRows.every((r) => !!r.taskCompleted),
    anyTranslateTouched,
  };
}
