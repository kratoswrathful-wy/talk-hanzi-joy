import type { CollabRow } from "@/data/case-types";

export type CaseListPerson = {
  userId: string;
  label: string;
};

/**
 * 總表譯者：按帳號去重。有 translatorUserId 的列以帳號為準，
 * 同名不同帳號分開；沒有帳號的列才用顯示名去重。不虛構人員。
 */
export function listTranslatorPeople(rows: CollabRow[] | undefined | null): CaseListPerson[] {
  if (!Array.isArray(rows) || !rows.length) return [];
  const seenIds = new Set<string>();
  const seenNamesWithoutId = new Set<string>();
  const people: CaseListPerson[] = [];
  for (const r of rows) {
    const name = String(r.translator || "").trim();
    const id = String(r.translatorUserId || "").trim();
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

export function listTranslatorLabels(rows: CollabRow[] | undefined | null): string {
  return listTranslatorPeople(rows)
    .map((p) => p.label)
    .join("、");
}

function fallbackTranslatorPeople(translator?: string[] | string | null): CaseListPerson[] {
  if (Array.isArray(translator)) {
    const seen = new Set<string>();
    const people: CaseListPerson[] = [];
    for (const raw of translator) {
      const name = String(raw || "").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      people.push({ userId: "", label: name });
    }
    return people;
  }
  const name = String(translator || "").trim();
  return name ? [{ userId: "", label: name }] : [];
}

function fallbackTranslatorText(translator?: string[] | string | null): string {
  return fallbackTranslatorPeople(translator)
    .map((p) => p.label)
    .join("、");
}

/** 是否存在有效多人分段資料（含主動清空後留下的空列）。 */
export function hasCollabTranslatorArrangement(rows: CollabRow[] | undefined | null): boolean {
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * 總表顯示：有分段列（即使列上都沒人）只看分段，不回退舊欄。
 * 真正沒有分段資料的舊案才沿用案件舊欄。不寫回資料。
 */
export function caseListTranslatorPeople(input: {
  collabRows?: CollabRow[] | null;
  translator?: string[] | string | null;
}): CaseListPerson[] {
  if (hasCollabTranslatorArrangement(input.collabRows)) {
    return listTranslatorPeople(input.collabRows);
  }
  return fallbackTranslatorPeople(input.translator);
}

export function caseListTranslatorText(input: {
  collabRows?: CollabRow[] | null;
  translator?: string[] | string | null;
}): string {
  return caseListTranslatorPeople(input)
    .map((p) => p.label)
    .join("、");
}
