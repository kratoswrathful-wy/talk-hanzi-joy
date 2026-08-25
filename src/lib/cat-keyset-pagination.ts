/**
 * Keyset (cursor) pagination helpers for UUID id ASC pages.
 * Prefer over OFFSET for large TM / segment tables.
 */

export const CAT_PAGE_SIZE = 1000;

export type KeysetPageResult<T extends { id: string }> = {
  rows: T[];
  /** Next cursor for keyset; null when no more pages. */
  nextCursor: string | null;
};

/**
 * Advance keyset cursor from a page of rows ordered by id ASC.
 */
export function nextKeysetCursor<T extends { id: string }>(
  rows: T[],
  pageSize: number = CAT_PAGE_SIZE
): string | null {
  if (!rows.length || rows.length < pageSize) return null;
  const last = rows[rows.length - 1];
  return last?.id ? String(last.id) : null;
}

/**
 * Compare two full loads (offset vs keyset) for regression tests.
 */
export function compareIdSets(
  a: Array<{ id?: string }>,
  b: Array<{ id?: string }>
): { sameCount: boolean; sameSet: boolean; onlyInA: string[]; onlyInB: string[] } {
  const setA = new Set(a.map((r) => String(r.id ?? "")));
  const setB = new Set(b.map((r) => String(r.id ?? "")));
  const onlyInA: string[] = [];
  const onlyInB: string[] = [];
  for (const id of setA) if (!setB.has(id)) onlyInA.push(id);
  for (const id of setB) if (!setA.has(id)) onlyInB.push(id);
  return {
    sameCount: a.length === b.length,
    sameSet: onlyInA.length === 0 && onlyInB.length === 0,
    onlyInA,
    onlyInB,
  };
}
