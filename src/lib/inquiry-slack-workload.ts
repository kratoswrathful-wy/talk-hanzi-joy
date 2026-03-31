/**
 * Minimal case row from Supabase for 30-day translator/reviewer workload counts.
 * Shapes match DB JSON (snake_case columns, collab row keys as stored by the app).
 */
export interface CaseRowForWorkload {
  translator?: unknown;
  reviewer?: unknown;
  collab_rows?: unknown;
}

function bump(map: Map<string, number>, raw: unknown) {
  if (typeof raw !== "string") return;
  const s = raw.trim();
  if (!s) return;
  map.set(s, (map.get(s) || 0) + 1);
}

/** Aggregate counts per trimmed display name across all cases in the window. */
export function buildWorkloadCountByDisplayName(cases: CaseRowForWorkload[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of cases) {
    const t = row.translator;
    const translators = Array.isArray(t) ? t : t != null && t !== "" ? [t] : [];
    for (const x of translators) bump(map, x);
    bump(map, row.reviewer);
    const collabs = Array.isArray(row.collab_rows) ? row.collab_rows : [];
    for (const cr of collabs) {
      if (!cr || typeof cr !== "object") continue;
      const o = cr as Record<string, unknown>;
      bump(map, o.translator);
      bump(map, o.reviewer);
    }
  }
  return map;
}

export interface CaseRowForWorkloadTranslatorReviewerOnly {
  translator?: unknown;
  reviewer?: unknown;
}

/**
 * translator+reviewer-only workload (NO collab_rows).
 * Keeps the same "trim + count each occurrence" behavior.
 */
export function buildWorkloadCountByDisplayNameTranslatorReviewerOnly(
  cases: CaseRowForWorkloadTranslatorReviewerOnly[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of cases) {
    const t = row.translator;
    const translators = Array.isArray(t) ? t : t != null && t !== "" ? [t] : [];
    for (const x of translators) bump(map, x);
    bump(map, row.reviewer);
  }
  return map;
}
