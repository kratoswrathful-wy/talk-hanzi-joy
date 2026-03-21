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

export interface PlanDuplicateTitleResult {
  newTitle: string;
  /** For toast / dialog (same as before) */
  renames: { oldTitle: string; newTitle: string }[];
  /** DB updates before insert */
  titleUpdates: { caseId: string; newTitle: string }[];
}

/**
 * Single source of truth for duplicate naming: same string is used for create() and UI.
 * Excludes `sourceId` from collision detection so duplicating a same-day case does not rename the source.
 */
export function planDuplicateCaseTitle(
  sourceTitle: string,
  sourceId: string,
  todayYYMMDD: string,
  cases: CaseTitleRef[]
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
  const baseTitle = `${prefix}${todayYYMMDD}${us}`;

  const pattern = new RegExp(`^${escapedPrefix}${todayYYMMDD}([A-Z])?${escapedSuffix}$`);

  const others = cases.filter((c) => c.id !== sourceId);
  const matching = others.filter((c) => pattern.test(c.title));

  if (matching.length === 0) {
    return { newTitle: baseTitle, renames, titleUpdates };
  }

  const exactMatch = matching.find((c) => c.title === baseTitle);
  if (exactMatch) {
    const newTitleForOld = `${prefix}${todayYYMMDD}A${us}`;
    renames.push({ oldTitle: exactMatch.title, newTitle: newTitleForOld });
    titleUpdates.push({ caseId: exactMatch.id, newTitle: newTitleForOld });
  }

  let maxCode = exactMatch ? "A".charCodeAt(0) : "A".charCodeAt(0) - 1;
  for (const c of matching) {
    const letterMatch = c.title.match(new RegExp(`^${escapedPrefix}${todayYYMMDD}([A-Z])${escapedSuffix}$`));
    if (letterMatch) {
      const code = letterMatch[1].charCodeAt(0);
      if (code > maxCode) maxCode = code;
    }
  }

  const nextLetter = String.fromCharCode(maxCode + 1);
  const newTitle = `${prefix}${todayYYMMDD}${nextLetter}${us}`;
  return { newTitle, renames, titleUpdates };
}
