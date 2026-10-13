import type { ReviewCollabRow } from "@/data/case-types";
import type { CaseListPerson } from "@/lib/collab-translator-list";

/** 由 review_rows 去重審稿人顯示名（案件層級 reviewer 衍生） */
export function deriveReviewerSummary(rows: ReviewCollabRow[] | undefined | null): string {
  if (!Array.isArray(rows) || !rows.length) return "";
  const names = [...new Set(rows.map((r) => String(r.reviewer || "").trim()).filter(Boolean))];
  return names.join("、");
}

function validDeadlineIso(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const ts = new Date(raw).getTime();
  return Number.isNaN(ts) ? null : new Date(ts).toISOString();
}

function pickDeadlineIso(
  rows: ReviewCollabRow[],
  mode: "earliest" | "latest",
): string | null {
  const stamps = rows
    .map((r) => validDeadlineIso(r.reviewDeadline))
    .filter((v): v is string => Boolean(v))
    .map((v) => new Date(v).getTime());
  if (!stamps.length) return null;
  const ts = mode === "earliest" ? Math.min(...stamps) : Math.max(...stamps);
  return new Date(ts).toISOString();
}

/**
 * 總表審稿人員：按帳號去重。有 reviewerUserId 的列以帳號為準，
 * 同名不同帳號分開；沒有帳號的列才用顯示名去重。不虛構人員。
 */
export function listReviewerPeople(rows: ReviewCollabRow[] | undefined | null): CaseListPerson[] {
  if (!Array.isArray(rows) || !rows.length) return [];
  const seenIds = new Set<string>();
  const seenNamesWithoutId = new Set<string>();
  const people: CaseListPerson[] = [];
  for (const r of rows) {
    const name = String(r.reviewer || "").trim();
    const id = String(r.reviewerUserId || "").trim();
    if (id) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      if (name) people.push({ userId: id, label: name });
      continue;
    }
    if (!name || seenNamesWithoutId.has(name)) continue;
    seenNamesWithoutId.add(name);
    people.push({ userId: "", label: name });
  }
  return people;
}

export function listReviewerLabels(rows: ReviewCollabRow[] | undefined | null): string {
  return listReviewerPeople(rows)
    .map((p) => p.label)
    .join("、");
}

export function caseListReviewerPeople(input: {
  reviewRows?: ReviewCollabRow[] | null;
  reviewer?: string | null;
}): CaseListPerson[] {
  const fromRows = listReviewerPeople(input.reviewRows);
  if (fromRows.length) return fromRows;
  const fallback = String(input.reviewer || "").trim();
  return fallback ? [{ userId: "", label: fallback }] : [];
}

/** 總表顯示：有審稿列用人名彙整，否則沿用案件舊欄。不寫回資料。 */
export function caseListReviewerText(input: {
  reviewRows?: ReviewCollabRow[] | null;
  reviewer?: string | null;
}): string {
  return caseListReviewerPeople(input)
    .map((p) => p.label)
    .join("、");
}

/**
 * 總表審稿交期：全部未完成列中最早的有效日期（含逾期）。
 * 仍有未完成但都沒日期 → 空白，不捏造、不改用已完成列。
 * 全部完成 → 沿用現有「已完成列最晚日期」當歷史代表。
 * 沒有審稿列 → 沿用案件舊欄。
 */
export function pickReviewDeadlineForList(input: {
  reviewRows?: ReviewCollabRow[] | null;
  fallbackDeadline?: string | null;
}): string | null {
  const rows = Array.isArray(input.reviewRows) ? input.reviewRows : [];
  if (!rows.length) return validDeadlineIso(input.fallbackDeadline);

  const uncompleted = rows.filter((r) => !r.taskCompleted);
  if (uncompleted.length) return pickDeadlineIso(uncompleted, "earliest");
  return pickDeadlineIso(rows, "latest");
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
