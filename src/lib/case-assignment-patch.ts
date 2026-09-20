import type { CollabRow, ReviewCollabRow } from "@/data/case-types";

/** 案件 camelCase 欄位：須走 pm_update_case_assignments。 */
export const ASSIGNMENT_CASE_FIELD_KEYS = [
  "translator",
  "translationDeadline",
  "reviewer",
  "reviewDeadline",
  "collabRows",
  "reviewRows",
  "multiCollab",
  "collabCount",
] as const;

export type AssignmentCaseFieldKey = (typeof ASSIGNMENT_CASE_FIELD_KEYS)[number];

/** DB snake_case 對應（不含 meta user_id 鍵）。 */
export const ASSIGNMENT_DB_FIELD_KEYS = [
  "translator",
  "translation_deadline",
  "reviewer",
  "review_deadline",
  "collab_rows",
  "review_rows",
  "multi_collab",
  "collab_count",
  "status",
] as const;

const ASSIGNMENT_DB_SET = new Set<string>(ASSIGNMENT_DB_FIELD_KEYS);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTrustedUserId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export type CaseAssignmentMeta = {
  translatorUserId?: string | null;
  reviewerUserId?: string | null;
};

export function splitDbCasePatch(
  dbPatch: Record<string, unknown>,
  meta: CaseAssignmentMeta = {},
): {
  assignment: Record<string, unknown>;
  general: Record<string, unknown>;
} {
  const assignment: Record<string, unknown> = {};
  const general: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(dbPatch)) {
    if (key === "updated_at") continue;
    if (ASSIGNMENT_DB_SET.has(key)) {
      assignment[key] = value;
    } else {
      general[key] = value;
    }
  }

  if (isTrustedUserId(meta.translatorUserId)) {
    assignment.translator_user_id = meta.translatorUserId;
  }
  if (isTrustedUserId(meta.reviewerUserId)) {
    assignment.reviewer_user_id = meta.reviewerUserId;
  }

  return { assignment, general };
}

export function hasAssignmentPatchKeys(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).some((k) => ASSIGNMENT_DB_SET.has(k) || k.endsWith("_user_id"));
}

export function casePartialHasAssignmentFields(
  partial: Record<string, unknown>,
): boolean {
  return ASSIGNMENT_CASE_FIELD_KEYS.some((k) => partial[k] !== undefined)
    || partial.translatorUserId !== undefined
    || partial.status !== undefined;
}

export function buildAdminCreateAssignmentMeta(
  partial: Record<string, unknown>,
): CaseAssignmentMeta {
  return {
    translatorUserId:
      typeof partial.translatorUserId === "string" ? partial.translatorUserId : null,
    reviewerUserId:
      typeof partial.reviewerUserId === "string" ? partial.reviewerUserId : null,
  };
}

/** 從 collab／review 列推斷整案 reviewer user id（整檔審稿）。 */
export function wholeFileReviewerUserId(rows: ReviewCollabRow[] | undefined): string | null {
  if (!rows?.length) return null;
  const uid = rows[0]?.reviewerUserId;
  return isTrustedUserId(uid) ? uid : null;
}

export function collabRowsHaveUserIds(rows: CollabRow[] | undefined): boolean {
  if (!rows?.length) return true;
  return rows.every(
    (r) => !String(r.translator || "").trim() || isTrustedUserId(r.translatorUserId),
  );
}

function hasNamedValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => String(item ?? "").trim().length > 0);
  return false;
}

function reviewRowsHaveUntrustedNames(rows: unknown): boolean {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  return rows.some((row) => {
    if (!row || typeof row !== "object") return false;
    const rec = row as ReviewCollabRow;
    const named = String(rec.reviewer || "").trim().length > 0;
    return named && !isTrustedUserId(rec.reviewerUserId);
  });
}

/**
 * 建案 payload 不得帶「只有姓名、沒有帳號識別」的譯者／審稿人員。
 * 頁面範本的人員欄目前只存顯示名，後端 `admin_create_case` 會以
 * `missing_reviewer_user_id`／`missing_translator_user_id` 拒絕整筆建案。
 * 其餘範本欄位仍保留；被拿掉的人員請使用者在詳情從選單點選。
 */
export function omitUntrustedCreateAssignments(
  partial: Record<string, unknown>,
): { next: Record<string, unknown>; omittedLabels: string[] } {
  const next: Record<string, unknown> = { ...partial };
  const omittedLabels: string[] = [];

  const reviewerUidRaw =
    typeof next.reviewerUserId === "string" ? next.reviewerUserId.trim() : "";
  const reviewerHasUidAttempt = reviewerUidRaw.length > 0;
  const reviewerTrusted =
    isTrustedUserId(reviewerUidRaw)
    || !!wholeFileReviewerUserId(next.reviewRows as ReviewCollabRow[] | undefined);
  // 只有「姓名、完全沒帶帳號」才拿掉（範本預填）。已填帳號但格式無效則留下，讓後端拒絕，不得默默略過仍報成功。
  if (
    (hasNamedValue(next.reviewer) && !reviewerHasUidAttempt && !reviewerTrusted)
    || reviewRowsHaveUntrustedNames(next.reviewRows)
  ) {
    delete next.reviewer;
    delete next.reviewerUserId;
    delete next.reviewRows;
    omittedLabels.push("審稿人員");
  }

  const translatorUidRaw =
    typeof next.translatorUserId === "string" ? next.translatorUserId.trim() : "";
  const translatorHasUidAttempt = translatorUidRaw.length > 0;
  const translatorTrusted = isTrustedUserId(translatorUidRaw);
  const collabUntrusted =
    Array.isArray(next.collabRows) && next.collabRows.length > 0
    && !collabRowsHaveUserIds(next.collabRows as CollabRow[]);
  if (
    (hasNamedValue(next.translator) && !translatorHasUidAttempt && !translatorTrusted)
    || collabUntrusted
  ) {
    delete next.translator;
    delete next.translatorUserId;
    delete next.collabRows;
    omittedLabels.push("譯者");
  }

  return { next, omittedLabels };
}
