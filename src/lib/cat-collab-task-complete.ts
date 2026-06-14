import type { SupabaseClient } from "@supabase/supabase-js";

export type ParsedLineRange = {
  lineStart: number | null;
  lineEnd: number | null;
};

/** 對應 RPC cat_parse_line_range（N-M、N、N-、留白＝整檔） */
export function parseCollabLineRange(range: string | null | undefined): ParsedLineRange {
  const v = String(range ?? "").trim();
  if (!v) return { lineStart: null, lineEnd: null };
  const openEnd = v.match(/^(\d+)\s*-\s*$/);
  if (openEnd) return { lineStart: Number(openEnd[1]), lineEnd: null };
  const closed = v.match(/^(\d+)\s*-\s*(\d+)$/);
  if (closed) return { lineStart: Number(closed[1]), lineEnd: Number(closed[2]) };
  const single = v.match(/^(\d+)$/);
  if (single) {
    const n = Number(single[1]);
    return { lineStart: n, lineEnd: n };
  }
  return { lineStart: null, lineEnd: null };
}

/** 譯者勾選任務完成前：查受派範圍內未確認句段數 */
export async function countUnconfirmedSegmentsInCollabRange(
  supabase: SupabaseClient,
  fileIds: string[],
  lineRange: string | null | undefined,
): Promise<{ count: number; error?: string }> {
  const ids = [...new Set(fileIds.map(String).filter(Boolean))];
  if (!ids.length) return { count: 0, error: "no file" };

  const { lineStart, lineEnd } = parseCollabLineRange(lineRange);

  let query = (supabase as any)
    .from("cat_segments")
    .select("id", { count: "exact", head: true })
    .in("file_id", ids)
    .is("wf_trans_confirmed_at", null);

  if (lineStart != null) {
    query = query.gte("global_id", lineStart);
  }
  if (lineEnd != null) {
    query = query.lte("global_id", lineEnd);
  }

  const { count, error } = await query;
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0 };
}
