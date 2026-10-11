import type { CollabRow } from "@/data/case-types";

/**
 * 總表譯者：按帳號去重。有 translatorUserId 的列以帳號為準，
 * 同名不同帳號分開；沒有帳號的列才用顯示名去重。不虛構人員。
 */
export function listTranslatorLabels(rows: CollabRow[] | undefined | null): string {
  if (!Array.isArray(rows) || !rows.length) return "";
  const seenIds = new Set<string>();
  const seenNamesWithoutId = new Set<string>();
  const labels: string[] = [];
  for (const r of rows) {
    const name = String(r.translator || "").trim();
    const id = String(r.translatorUserId || "").trim();
    if (id) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      if (name) labels.push(name);
      continue;
    }
    if (!name || seenNamesWithoutId.has(name)) continue;
    seenNamesWithoutId.add(name);
    labels.push(name);
  }
  return labels.join("、");
}

function fallbackTranslatorText(translator?: string[] | string | null): string {
  if (Array.isArray(translator)) {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const raw of translator) {
      const name = String(raw || "").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      labels.push(name);
    }
    return labels.join("、");
  }
  return String(translator || "").trim();
}

/** 是否存在有效多人分段資料（含主動清空後留下的空列）。 */
export function hasCollabTranslatorArrangement(rows: CollabRow[] | undefined | null): boolean {
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * 總表顯示：有分段列（即使列上都沒人）只看分段，不回退舊欄。
 * 真正沒有分段資料的舊案才沿用案件舊欄。不寫回資料。
 */
export function caseListTranslatorText(input: {
  collabRows?: CollabRow[] | null;
  translator?: string[] | string | null;
}): string {
  if (hasCollabTranslatorArrangement(input.collabRows)) {
    return listTranslatorLabels(input.collabRows);
  }
  return fallbackTranslatorText(input.translator);
}
