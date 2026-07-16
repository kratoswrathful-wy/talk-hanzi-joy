import type { ReviewCollabRow } from "@/data/case-types";

/** 由 review_rows 去重審稿人顯示名（案件層級 reviewer 衍生） */
export function deriveReviewerSummary(rows: ReviewCollabRow[] | undefined | null): string {
  if (!Array.isArray(rows) || !rows.length) return "";
  const names = [...new Set(rows.map((r) => String(r.reviewer || "").trim()).filter(Boolean))];
  return names.join("、");
}

export function newReviewRowId(suffix?: string | number): string {
  return `rr_${Date.now().toString(36)}${suffix != null ? String(suffix) : ""}${Math.random().toString(36).slice(2, 6)}`;
}

/** 空集合不得視為「全部完成」（對齊 §2.4） */
export function areAllReviewAssignmentsCompleted(
  statuses: Array<string | null | undefined>,
): boolean {
  if (!statuses.length) return false;
  return statuses.every((s) => String(s || "") === "completed");
}

/**
 * review_rows 是否已呈「分段」狀態（與是否勾選多人協作無關）。
 * - 列數 ≥ 2；或
 * - 任一列有非空 lineRange；或
 * - 存在不同的 linkedCatFileId（多檔實質分段）
 */
export function isReviewRowsSegmented(rows: ReviewCollabRow[] | undefined | null): boolean {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  if (rows.length >= 2) return true;
  if (rows.some((r) => String(r.lineRange || "").trim() !== "")) return true;
  const fileIds = new Set(
    rows.map((r) => String(r.linkedCatFileId || "").trim()).filter(Boolean),
  );
  return fileIds.size >= 2;
}

/** 是否顯示「審稿分段指派」區塊（多人協作勾選，或資料已分段——防取消勾選後消失） */
export function shouldShowReviewSegmentBlock(input: {
  multiCollab?: boolean | null;
  reviewRows?: ReviewCollabRow[] | null;
}): boolean {
  return !!input.multiCollab || isReviewRowsSegmented(input.reviewRows);
}

/** 未分段 UI：寫入／更新單一整檔審稿列的審稿人（review_rows 為唯一真相） */
export function writeThroughWholeFileReviewer(
  existing: ReviewCollabRow[] | undefined | null,
  reviewerName: string,
  reviewerUserId: string | null,
  reviewDeadline: string | null,
): ReviewCollabRow[] {
  const name = String(reviewerName || "").trim();
  if (!name) return [];
  const rows = Array.isArray(existing) ? existing : [];
  if (rows.length === 0) {
    return [
      {
        id: newReviewRowId(),
        segment: "",
        reviewer: name,
        reviewerUserId,
        reviewDeadline,
        taskCompleted: false,
        accepted: true,
      },
    ];
  }
  return rows.map((r) => ({
    ...r,
    reviewer: name,
    reviewerUserId,
  }));
}

/** 未分段 UI：同步審稿交期到既有整檔列；尚無列且已有審稿人名時建立一列 */
export function writeThroughWholeFileReviewDeadline(
  existing: ReviewCollabRow[] | undefined | null,
  reviewDeadline: string | null,
  reviewerName?: string | null,
  reviewerUserId?: string | null,
): ReviewCollabRow[] {
  const rows = Array.isArray(existing) ? existing : [];
  if (rows.length === 0) {
    const name = String(reviewerName || "").trim();
    if (!name) return [];
    return [
      {
        id: newReviewRowId(),
        segment: "",
        reviewer: name,
        reviewerUserId: reviewerUserId ?? null,
        reviewDeadline,
        taskCompleted: false,
        accepted: true,
      },
    ];
  }
  return rows.map((r) => ({ ...r, reviewDeadline }));
}
