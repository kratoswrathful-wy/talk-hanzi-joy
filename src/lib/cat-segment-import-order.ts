/**
 * Import-order sort for mapped CAT segments (UI final order).
 * Independent of DB pagination key (id ASC).
 */

export type ImportOrderSegment = {
  globalId?: number | null;
  rowIdx?: number;
  sheetName?: string;
  colSrc?: string | null;
  id?: string;
};

export function sortMappedCatSegmentsByImportOrder<T extends ImportOrderSegment>(segments: T[]): T[] {
  return segments.slice().sort((a, b) => {
    const ga =
      a.globalId != null && Number.isFinite(Number(a.globalId)) ? Number(a.globalId) : Number.NaN;
    const gb =
      b.globalId != null && Number.isFinite(Number(b.globalId)) ? Number(b.globalId) : Number.NaN;
    const aHas = !Number.isNaN(ga);
    const bHas = !Number.isNaN(gb);
    if (aHas && bHas && ga !== gb) return ga - gb;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    const ra = (a.rowIdx ?? 0) - (b.rowIdx ?? 0);
    if (ra !== 0) return ra;
    const sa = String(a.sheetName || "");
    const sb = String(b.sheetName || "");
    if (sa !== sb) return sa.localeCompare(sb);
    const ca = String(a.colSrc ?? "");
    const cb = String(b.colSrc ?? "");
    if (ca !== cb) return ca.localeCompare(cb);
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
}
