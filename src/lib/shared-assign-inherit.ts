import type { CollabRow, ReviewCollabRow } from "@/data/case-types";
import { parseCollabLineRange } from "@/lib/cat-collab-task-complete";
import { projectCollabReviewIntoReviewRows } from "@/lib/collab-review-pair";
import { newReviewRowId } from "@/lib/review-rows";

export type LinkedCatFile = { id: string; name: string };

function trim(value: string | null | undefined): string {
  return String(value || "").trim();
}

function rangeKey(lineRange: string | null | undefined): string {
  const parsed = parseCollabLineRange(lineRange);
  return `${parsed.lineStart ?? "open"}:${parsed.lineEnd ?? "open"}`;
}

export function isUnscopedReviewRow(row: ReviewCollabRow): boolean {
  return !trim(row.linkedCatFileId) && !trim(row.linkedCatViewId) && !trim(row.lineRange);
}

export function isWholeCaseCollabRow(row: CollabRow): boolean {
  return !trim(row.linkedCatFileId) && !trim(row.linkedCatViewId) && !trim(row.lineRange) && !trim(row.segment);
}

/** 整案／整檔審稿列：依已連結檔案補上檔案編號，供後端同步使用。可重跑不重複。 */
export function attachLinkedFilesToWholeFileReview(
  rows: ReviewCollabRow[] | undefined | null,
  files: LinkedCatFile[],
): ReviewCollabRow[] {
  const existing = Array.isArray(rows) ? rows : [];
  if (!files.length) return existing;
  const scoped = existing.filter((row) => !isUnscopedReviewRow(row));
  const unscoped = existing.filter(isUnscopedReviewRow);
  if (!unscoped.length) return existing;

  const next = [...scoped];
  const occupied = new Set(
    scoped
      .filter((row) => trim(row.linkedCatFileId) && !trim(row.lineRange))
      .map((row) => `${trim(row.linkedCatFileId)}|${trim(row.reviewerUserId)}|${trim(row.reviewer)}`),
  );

  for (const template of unscoped) {
    for (const file of files) {
      const stamp = `${file.id}|${trim(template.reviewerUserId)}|${trim(template.reviewer)}`;
      if (occupied.has(stamp)) continue;
      occupied.add(stamp);
      next.push({
        ...template,
        id: files.length === 1 ? template.id : newReviewRowId(file.id.slice(0, 8)),
        linkedCatFileId: file.id,
        segment: trim(template.segment) || file.name,
      });
    }
  }
  return next;
}

export type InheritMatch =
  | { kind: "whole-case" }
  | { kind: "unique"; collabRows: CollabRow[] }
  | { kind: "ambiguous"; candidates: CollabRow[] }
  | { kind: "none" };

function fileNameKey(name: string): string {
  return trim(name).toLowerCase();
}

/**
 * 匯入／稍後連結時，只在能唯一對應的共用列上承接人員。
 * 不依列序、不依模糊檔名、不把整案所有人交叉掛到每個檔。
 */
export function matchSharedRowsForLinkedFile(input: {
  fileId: string;
  fileName: string;
  collabRows: CollabRow[] | undefined | null;
}): InheritMatch {
  const fileId = trim(input.fileId);
  const fileName = fileNameKey(input.fileName);
  const rows = Array.isArray(input.collabRows) ? input.collabRows : [];
  if (!fileId || !rows.length) return { kind: "none" };

  const alreadyBound = rows.filter((row) => trim(row.linkedCatFileId) === fileId);
  if (alreadyBound.length >= 1) return { kind: "unique", collabRows: alreadyBound };

  const allUnscoped = rows.every(isWholeCaseCollabRow);
  if (allUnscoped) return { kind: "whole-case" };

  const nameMatches = rows.filter((row) => {
    if (trim(row.linkedCatFileId) && trim(row.linkedCatFileId) !== fileId) return false;
    return fileNameKey(row.segment) === fileName && fileName.length > 0;
  });
  if (nameMatches.length >= 1) return { kind: "unique", collabRows: nameMatches };

  const unbound = rows.filter((row) => !trim(row.linkedCatFileId));
  if (unbound.length > 1) return { kind: "ambiguous", candidates: unbound };
  if (unbound.length === 1) return { kind: "unique", collabRows: unbound };
  return { kind: "none" };
}

export function bindUniqueCollabRowsToFile(
  rows: CollabRow[] | undefined | null,
  matched: CollabRow[],
  fileId: string,
): CollabRow[] {
  const ids = new Set(matched.map((row) => row.id));
  return (Array.isArray(rows) ? rows : []).map((row) =>
    ids.has(row.id) ? { ...row, linkedCatFileId: fileId } : row,
  );
}

export type LegacyReviewClass =
  | { kind: "mergeable"; collabId: string; review: ReviewCollabRow }
  | { kind: "whole-case"; review: ReviewCollabRow }
  | { kind: "conflict"; review: ReviewCollabRow; reason: "mismatch" | "cross-range" | "one-to-many" };

/**
 * 舊獨立審稿列轉換分類。不猜列序、不擅自取最早／最晚交期。
 */
export function classifyLegacyReviewRows(input: {
  collabRows: CollabRow[] | undefined | null;
  reviewRows: ReviewCollabRow[] | undefined | null;
}): LegacyReviewClass[] {
  const collabs = Array.isArray(input.collabRows) ? input.collabRows : [];
  const reviews = Array.isArray(input.reviewRows) ? input.reviewRows : [];
  const out: LegacyReviewClass[] = [];

  for (const review of reviews) {
    if (isUnscopedReviewRow(review) && !trim(review.segment)) {
      out.push({ kind: "whole-case", review });
      continue;
    }

    const fileId = trim(review.linkedCatFileId);
    const range = rangeKey(review.lineRange);
    const segment = trim(review.segment);

    const exact = collabs.filter((collab) => {
      if (fileId && trim(collab.linkedCatFileId) !== fileId) return false;
      if (fileId && range !== rangeKey(collab.lineRange)) return false;
      if (!fileId) {
        if (segment && trim(collab.segment) !== segment) return false;
        if (range !== rangeKey(collab.lineRange)) return false;
      }
      return fileId ? true : Boolean(segment || range !== "open:open");
    });

    if (exact.length === 1) {
      const collab = exact[0];
      const existingName = trim(collab.reviewer);
      const existingId = trim(collab.reviewerUserId);
      const incomingName = trim(review.reviewer);
      const incomingId = trim(review.reviewerUserId);
      const deadlineDiff =
        (collab.reviewDeadline ?? null) !== (review.reviewDeadline ?? null)
        && Boolean(collab.reviewDeadline || review.reviewDeadline);
      const personDiff =
        (existingName && incomingName && existingName !== incomingName)
        || (existingId && incomingId && existingId !== incomingId);
      if ((existingName || existingId) && (personDiff || deadlineDiff)) {
        out.push({ kind: "conflict", review, reason: "mismatch" });
      } else {
        out.push({ kind: "mergeable", collabId: collab.id, review });
      }
      continue;
    }
    if (exact.length > 1) {
      out.push({ kind: "conflict", review, reason: "one-to-many" });
      continue;
    }
    if (fileId || segment || range !== "open:open") {
      out.push({ kind: "conflict", review, reason: "cross-range" });
      continue;
    }
    out.push({ kind: "whole-case", review });
  }
  return out;
}

export function applyMergeableLegacyReviews(
  collabRows: CollabRow[] | undefined | null,
  classes: LegacyReviewClass[],
): CollabRow[] {
  const byId = new Map(
    classes
      .filter((item): item is Extract<LegacyReviewClass, { kind: "mergeable" }> => item.kind === "mergeable")
      .map((item) => [item.collabId, item.review]),
  );
  return (Array.isArray(collabRows) ? collabRows : []).map((row) => {
    const review = byId.get(row.id);
    if (!review) return row;
    return {
      ...row,
      reviewer: trim(review.reviewer) || row.reviewer,
      reviewerUserId: review.reviewerUserId ?? row.reviewerUserId ?? null,
      reviewDeadline: review.reviewDeadline ?? row.reviewDeadline,
      reviewTaskCompleted: review.taskCompleted || row.reviewTaskCompleted,
    };
  });
}

export function applyWholeCaseReviewToSharedRows(
  collabRows: CollabRow[] | undefined | null,
  review: ReviewCollabRow,
): CollabRow[] {
  const name = trim(review.reviewer);
  const userId = review.reviewerUserId ?? null;
  return (Array.isArray(collabRows) ? collabRows : []).map((row) => {
    if (trim(row.reviewer) || trim(row.reviewerUserId)) return row;
    return {
      ...row,
      reviewer: name,
      reviewerUserId: userId,
      reviewDeadline: row.reviewDeadline ?? review.reviewDeadline,
    };
  });
}

export function applySafeLegacyReviewConversion(
  collabRows: CollabRow[] | undefined | null,
  reviewRows: ReviewCollabRow[] | undefined | null,
): {
  collabRows: CollabRow[];
  reviewRows: ReviewCollabRow[];
  conflicts: Array<Extract<LegacyReviewClass, { kind: "conflict" }>>;
} {
  const classes = classifyLegacyReviewRows({ collabRows, reviewRows });
  let nextCollab = applyMergeableLegacyReviews(collabRows, classes);
  for (const item of classes) {
    if (item.kind === "whole-case") {
      nextCollab = applyWholeCaseReviewToSharedRows(nextCollab, item.review);
    }
  }
  const conflicts = classes.filter(
    (item): item is Extract<LegacyReviewClass, { kind: "conflict" }> => item.kind === "conflict",
  );
  return {
    collabRows: nextCollab,
    reviewRows: projectCollabReviewIntoReviewRows(nextCollab, reviewRows),
    conflicts,
  };
}

export function describeLegacyReviewConflict(reason: "mismatch" | "cross-range" | "one-to-many"): string {
  if (reason === "mismatch") return "同一列已有不同審稿人員或交期";
  if (reason === "one-to-many") return "一筆舊審稿對到多列，無法無損對應";
  return "舊審稿範圍對不上任何共用列";
}

export function describeInheritFailure(input: {
  importOk: boolean;
  inheritOk: boolean;
  reason?: string;
}): { title: string; description: string } {
  if (input.importOk && !input.inheritOk) {
    return {
      title: "檔案已匯入，但人員尚未帶入",
      description: input.reason || "可重試帶入人員，不必再匯入一次檔案。",
    };
  }
  if (!input.importOk) {
    return {
      title: "匯入未完成",
      description: input.reason || "檔案尚未建立完成，尚未帶入人員。",
    };
  }
  return { title: "已匯入並帶入人員", description: "" };
}
