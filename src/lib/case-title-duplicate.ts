/**
 * Parse case titles for duplicate flow: ... + YYMMDD + optional [A-Z] + optional _suffix
 * Uses a greedy leading group so the 6-digit date is the last date run in the string.
 */
export interface ParsedCaseTitle {
  prefix: string;
  dateYYMMDD: string;
  letterAfterDate: string | null;
  underscoreSuffix: string | null;
}

export function parseCaseTitleForDuplicate(title: string): ParsedCaseTitle | null {
  const m = title.match(/^(.*)(\d{6})([A-Z])?(_.*)?$/);
  if (!m) return null;
  return {
    prefix: m[1],
    dateYYMMDD: m[2],
    letterAfterDate: m[3] || null,
    underscoreSuffix: m[4] || null,
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface CaseTitleRef {
  id: string;
  title: string;
}

/** Extra fields for ordering when renumbering same-day same-series cases */
export interface CaseForDuplicatePlan extends CaseTitleRef {
  createdAt?: string;
  translationDeadline?: string | null;
  reviewDeadline?: string | null;
}

export type DuplicateSortKey = "created_at" | "translation_deadline" | "review_deadline";
export type DuplicateSortDir = "asc" | "desc";

export const DEFAULT_DUPLICATE_SORT: { key: DuplicateSortKey; dir: DuplicateSortDir } = {
  key: "created_at",
  dir: "asc",
};

/** Synthetic id for the row representing the new duplicate in sort/plan (not a DB id) */
export const DUPLICATE_NEW_SLOT_ID = "__duplicate_new__";

export interface PlanDuplicateTitleResult {
  newTitle: string;
  /** For toast / dialog */
  renames: { oldTitle: string; newTitle: string }[];
  /** DB updates for existing cases (before insert of the new duplicate) */
  titleUpdates: { caseId: string; newTitle: string }[];
}

/**
 * Same-day renumbering:
 * - `totalSlots === 1`: only one row → no letter after date (`prefix + YYMMDD + suffix`).
 * - `totalSlots >= 2`: every row gets a letter starting at **A** (slot 0 = A, 1 = B, …).
 */
export function titleForDuplicateSlot(
  prefix: string,
  dateYYMMDD: string,
  slotIndex: number,
  underscoreSuffix: string | null,
  totalSlots: number
): string {
  const us = underscoreSuffix || "";
  if (totalSlots <= 1) {
    return `${prefix}${dateYYMMDD}${us}`;
  }
  const letter = String.fromCharCode("A".charCodeAt(0) + slotIndex);
  return `${prefix}${dateYYMMDD}${letter}${us}`;
}

function parseTs(value: string | null | undefined): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

/** Null / empty deadlines sort last in ascending order */
function compareDeadline(
  a: string | null | undefined,
  b: string | null | undefined,
  dir: DuplicateSortDir
): number {
  const na = !a || a === "";
  const nb = !b || b === "";
  if (na && nb) return 0;
  if (na) return 1;
  if (nb) return -1;
  const cmp = parseTs(a) - parseTs(b);
  return dir === "asc" ? cmp : -cmp;
}

/**
 * When the primary sort key ties, avoid `localeCompare` on ids: `__duplicate_new__` sorts before UUIDs
 * and would steal slot A from the source case. Asc = real rows before synthetic; desc = synthetic first.
 */
function compareSyntheticTieBreak(
  a: CaseForDuplicatePlan,
  b: CaseForDuplicatePlan,
  key: DuplicateSortKey,
  dir: DuplicateSortDir
): number | null {
  const aIs = a.id === DUPLICATE_NEW_SLOT_ID;
  const bIs = b.id === DUPLICATE_NEW_SLOT_ID;
  if (!aIs && !bIs) return null;
  if (aIs && bIs) return null;

  const ascSyntheticAfterReal = (): number => {
    if (aIs && !bIs) return 1;
    if (!aIs && bIs) return -1;
    return 0;
  };
  const descSyntheticBeforeReal = (): number => {
    if (aIs && !bIs) return -1;
    if (!aIs && bIs) return 1;
    return 0;
  };

  if (key === "created_at") {
    return dir === "asc" ? ascSyntheticAfterReal() : descSyntheticBeforeReal();
  }
  if (key === "translation_deadline" || key === "review_deadline") {
    return dir === "asc" ? ascSyntheticAfterReal() : descSyntheticBeforeReal();
  }
  return null;
}

function compareParticipants(
  a: CaseForDuplicatePlan,
  b: CaseForDuplicatePlan,
  key: DuplicateSortKey,
  dir: DuplicateSortDir
): number {
  let cmp = 0;
  if (key === "created_at") {
    cmp = parseTs(a.createdAt) - parseTs(b.createdAt);
    if (dir === "desc") cmp = -cmp;
  } else if (key === "translation_deadline") {
    cmp = compareDeadline(a.translationDeadline, b.translationDeadline, dir);
  } else if (key === "review_deadline") {
    cmp = compareDeadline(a.reviewDeadline, b.reviewDeadline, dir);
  }
  if (cmp !== 0) return cmp;
  const syn = compareSyntheticTieBreak(a, b, key, dir);
  if (syn !== null && syn !== 0) return syn;
  return a.id.localeCompare(b.id);
}

/**
 * Whether the duplicate flow should show a sort dialog (≥2 same-day same-series slots after adding the new duplicate).
 */
export function needsDuplicateSortDialog(
  sourceTitle: string,
  todayYYMMDD: string,
  cases: CaseTitleRef[]
): boolean {
  const parsed = parseCaseTitleForDuplicate(sourceTitle.trimEnd());
  if (!parsed) return false;
  const { prefix, underscoreSuffix } = parsed;
  const us = underscoreSuffix || "";
  const escapedPrefix = escapeRegExp(prefix);
  const escapedSuffix = escapeRegExp(us);
  const pattern = new RegExp(`^${escapedPrefix}${todayYYMMDD}([A-Z])?${escapedSuffix}$`);
  const existingSameDay = cases.filter((c) => pattern.test(c.title));
  return existingSameDay.length + 1 >= 2;
}

/** Normalize for duplicate detection: trim + collapse internal whitespace (any title format). */
export function normalizeCaseTitleForComparison(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

/**
 * Returns true if another case (≠ currentId) already uses this title (trimmed, whitespace-normalized).
 */
export function findDuplicateTitleCase(
  currentId: string,
  title: string,
  cases: CaseTitleRef[]
): CaseTitleRef | undefined {
  const t = normalizeCaseTitleForComparison(title);
  if (!t) return undefined;
  return cases.find(
    (c) => c.id !== currentId && normalizeCaseTitleForComparison(c.title) === t
  );
}

/**
 * Plan duplicate naming: same-day same-series cases are renumbered together (ignore prior letters).
 * The new duplicate is always included as DUPLICATE_NEW_SLOT_ID with `createdAt` = now.
 */
export function planDuplicateCaseTitle(
  sourceTitle: string,
  sourceId: string,
  todayYYMMDD: string,
  cases: CaseForDuplicatePlan[],
  sort: { key: DuplicateSortKey; dir: DuplicateSortDir },
  /** ISO timestamp for the synthetic duplicate row (used for created_at sort) */
  createdAtForNewDuplicate: string
): PlanDuplicateTitleResult {
  const renames: { oldTitle: string; newTitle: string }[] = [];
  const titleUpdates: { caseId: string; newTitle: string }[] = [];

  const parsed = parseCaseTitleForDuplicate(sourceTitle.trimEnd());
  if (!parsed) {
    const newTitle = `${sourceTitle.trim()} ${todayYYMMDD}`.trim();
    return { newTitle, renames, titleUpdates };
  }

  const { prefix, underscoreSuffix } = parsed;
  const us = underscoreSuffix || "";
  const escapedPrefix = escapeRegExp(prefix);
  const escapedSuffix = escapeRegExp(us);
  const pattern = new RegExp(`^${escapedPrefix}${todayYYMMDD}([A-Z])?${escapedSuffix}$`);

  const existingSameDay = cases.filter((c) => pattern.test(c.title));

  const synthetic: CaseForDuplicatePlan = {
    id: DUPLICATE_NEW_SLOT_ID,
    title: "",
    createdAt: createdAtForNewDuplicate,
    translationDeadline: null,
    reviewDeadline: null,
  };

  const participants = [...existingSameDay, synthetic];

  if (participants.length === 1) {
    const newTitle = titleForDuplicateSlot(prefix, todayYYMMDD, 0, underscoreSuffix, 1);
    return { newTitle, renames, titleUpdates };
  }

  const totalSlots = participants.length;
  const sorted = [...participants].sort((a, b) => compareParticipants(a, b, sort.key, sort.dir));

  const idToNewTitle = new Map<string, string>();
  sorted.forEach((p, slotIndex) => {
    idToNewTitle.set(
      p.id,
      titleForDuplicateSlot(prefix, todayYYMMDD, slotIndex, underscoreSuffix, totalSlots)
    );
  });

  const newTitle = idToNewTitle.get(DUPLICATE_NEW_SLOT_ID) ?? "";

  for (const c of existingSameDay) {
    const next = idToNewTitle.get(c.id);
    if (!next || next === c.title) continue;
    renames.push({ oldTitle: c.title, newTitle: next });
    titleUpdates.push({ caseId: c.id, newTitle: next });
  }

  return { newTitle, renames, titleUpdates };
}
