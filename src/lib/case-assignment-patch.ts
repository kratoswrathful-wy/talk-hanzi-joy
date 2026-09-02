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

export function resolveAssigneeUserIdByLabel(
  label: string,
  options: ReadonlyArray<{ id: string; label: string }>,
): string | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const opt = options.find((o) => o.label === trimmed);
  if (!opt || !isTrustedUserId(opt.id)) return null;
  return opt.id;
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
