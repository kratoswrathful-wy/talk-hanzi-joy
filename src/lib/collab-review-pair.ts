import type { CollabRow, ReviewCollabRow } from "@/data/case-types";
import { parseCollabLineRange } from "@/lib/cat-collab-task-complete";

type ScopeRow = {
  linkedCatFileId?: string | null;
  linkedCatViewId?: string | null;
  lineRange?: string | null;
};

/**
 * 僅在「檔案或檢視 + 句段範圍」可明確對應時才配對。
 * 沒有 CAT 綁定不配對，避免用列序或分段說明猜測。
 */
export function collabReviewScopeKey(row: ScopeRow): string {
  const fileId = String(row.linkedCatFileId || "").trim();
  const viewId = String(row.linkedCatViewId || "").trim();
  if (!fileId && !viewId) return "";
  const parsed = parseCollabLineRange(row.lineRange);
  const range = `${parsed.lineStart ?? "open"}:${parsed.lineEnd ?? "open"}`;
  return fileId ? `file:${fileId}|${range}` : `view:${viewId}|${range}`;
}

export function partitionReviewRowsByCollab(
  collabRows: CollabRow[] | undefined | null,
  reviewRows: ReviewCollabRow[] | undefined | null,
): {
  uniqueByCollabId: Map<string, ReviewCollabRow>;
  leftoverReviewRows: ReviewCollabRow[];
} {
  const collabs = Array.isArray(collabRows) ? collabRows : [];
  const reviews = Array.isArray(reviewRows) ? reviewRows : [];
  const collabByScope = new Map<string, CollabRow[]>();
  for (const c of collabs) {
    const key = collabReviewScopeKey(c);
    if (!key) continue;
    const list = collabByScope.get(key) || [];
    list.push(c);
    collabByScope.set(key, list);
  }
  const reviewByScope = new Map<string, ReviewCollabRow[]>();
  for (const r of reviews) {
    const key = collabReviewScopeKey(r);
    if (!key) continue;
    const list = reviewByScope.get(key) || [];
    list.push(r);
    reviewByScope.set(key, list);
  }

  const uniqueByCollabId = new Map<string, ReviewCollabRow>();
  const pairedReviewIds = new Set<string>();
  for (const [key, cs] of collabByScope) {
    const rs = reviewByScope.get(key) || [];
    if (cs.length === 1 && rs.length === 1) {
      uniqueByCollabId.set(cs[0].id, rs[0]);
      pairedReviewIds.add(rs[0].id);
    }
  }

  const collabIds = new Set(collabs.map((c) => c.id));
  return {
    uniqueByCollabId,
    leftoverReviewRows: reviews.filter((r) => {
      if (pairedReviewIds.has(r.id)) return false;
      // 同段寫回用協作列 id；已在同一段顯示，不當「無法對應」舊資料
      if (collabIds.has(r.id)) return false;
      return true;
    }),
  };
}

export function leftoverUnpairedReviewRows(
  collabRows: CollabRow[] | undefined | null,
  reviewRows: ReviewCollabRow[] | undefined | null,
): ReviewCollabRow[] {
  return partitionReviewRowsByCollab(collabRows, reviewRows).leftoverReviewRows;
}

/**
 * CAT 審稿區寫的是 review_rows。案件頁同段讀 collab_rows.reviewer。
 * 一對一才把審稿人寫回主列；交叉／一對多不猜。
 */
export function applyPairedReviewRowsToCollab(
  collabRows: CollabRow[] | undefined | null,
  reviewRows: ReviewCollabRow[] | undefined | null,
): CollabRow[] {
  const collabs = Array.isArray(collabRows) ? collabRows : [];
  const { uniqueByCollabId } = partitionReviewRowsByCollab(collabs, reviewRows);
  return collabs.map((collab) => {
    const pair = uniqueByCollabId.get(collab.id);
    if (!pair) return collab;
    return {
      ...collab,
      reviewer: String(pair.reviewer || "").trim(),
      reviewerUserId: pair.reviewerUserId ?? null,
    };
  });
}

/** CAT「儲存並同步」先把成對審稿寫回主列，再投影回 review_rows。 */
export function mergeCatCollabSavePayload(
  collabRows: CollabRow[] | undefined | null,
  reviewRows: ReviewCollabRow[] | undefined | null,
): { collabRows: CollabRow[]; reviewRows: ReviewCollabRow[] } {
  const mergedCollab = applyPairedReviewRowsToCollab(collabRows, reviewRows);
  return {
    collabRows: mergedCollab,
    reviewRows: projectCollabReviewIntoReviewRows(mergedCollab, reviewRows),
  };
}

function hasReviewer(row: { reviewer?: string | null; reviewerUserId?: string | null }): boolean {
  return Boolean(String(row.reviewer || "").trim() || String(row.reviewerUserId || "").trim());
}

function occupiedScopes(rows: ReviewCollabRow[]): Set<string> {
  const keys = new Set<string>();
  for (const r of rows) {
    const key = collabReviewScopeKey(r);
    if (key) keys.add(key);
  }
  return keys;
}

function reviewRowFromCollab(collab: CollabRow, existing?: ReviewCollabRow): ReviewCollabRow {
  return {
    id: existing?.id || collab.id,
    segment: collab.segment,
    reviewer: String(collab.reviewer || "").trim(),
    reviewerUserId: collab.reviewerUserId ?? null,
    reviewDeadline: collab.reviewDeadline ?? null,
    taskCompleted: collab.reviewTaskCompleted ?? existing?.taskCompleted ?? false,
    linkedCatFileId: collab.linkedCatFileId ?? null,
    linkedCatViewId: collab.linkedCatViewId ?? null,
    lineRange: collab.lineRange ?? null,
    scopeLabel: collab.scopeLabel ?? null,
    accepted: existing?.accepted ?? true,
  };
}

/**
 * 把同段審稿寫回 review_rows（CAT 同步仍以此為準）。
 * 一對一才更新或刪除；交叉／一對多／無法配對的舊列原樣保留。
 */
export function projectCollabReviewIntoReviewRows(
  collabRows: CollabRow[] | undefined | null,
  existingReviewRows: ReviewCollabRow[] | undefined | null,
): ReviewCollabRow[] {
  const collabs = Array.isArray(collabRows) ? collabRows : [];
  const existing = Array.isArray(existingReviewRows) ? existingReviewRows : [];
  const { uniqueByCollabId, leftoverReviewRows } = partitionReviewRowsByCollab(collabs, existing);
  const leftoverScopes = occupiedScopes(leftoverReviewRows);
  const next: ReviewCollabRow[] = [...leftoverReviewRows];

  for (const collab of collabs) {
    const pair = uniqueByCollabId.get(collab.id);
    if (hasReviewer(collab)) {
      if (pair) {
        next.push(reviewRowFromCollab(collab, pair));
        continue;
      }
      const key = collabReviewScopeKey(collab);
      if (key && leftoverScopes.has(key)) continue;
      next.push(reviewRowFromCollab(collab));
      continue;
    }
    if (pair) continue;
  }

  return next;
}
