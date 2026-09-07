import type { CaseRecord } from "@/data/case-types";
import { deriveReviewerSummary } from "@/lib/review-rows";

/**
 * 套用 pending 樂觀寫入後，若 reviewer 被後端清空但 review_rows 仍在，
 * 必須再衍生顯示名（單人整檔審稿的唯一真相是 review_rows）。
 */
export function applyPendingCaseOverlay(
  current: CaseRecord,
  pending: Partial<CaseRecord> | undefined,
): CaseRecord {
  if (!pending) return current;
  const merged: CaseRecord = { ...current, ...pending };
  const fromRows = deriveReviewerSummary(merged.reviewRows);
  if (fromRows && !String(merged.reviewer || "").trim()) {
    return { ...merged, reviewer: fromRows };
  }
  return merged;
}
