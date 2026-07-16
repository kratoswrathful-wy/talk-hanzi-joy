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
