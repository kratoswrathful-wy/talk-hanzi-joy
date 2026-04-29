import { SupabaseClient } from "@supabase/supabase-js";
import { getEnvironment } from "@/lib/environment";

/** Normalize LMS case title to stable prefix used for internal note naming */
export function buildInternalNoteTitleBase(caseTitle: string): string {
  const raw = String(caseTitle || "").trim();
  if (!raw) return "未命名案件";
  const baseId = raw
    .replace(/[_\-]?\d{6,8}$/g, "")
    .replace(/[_\-]?\d{4}[\-\/]?\d{2}[\-\/]?\d{2}$/, "")
    .trim();
  return baseId || raw;
}

/**
 * Allocate next internal note title:
 * `{base}_Note_{NNNNN}` using DB titles (`internal_notes.title`) filtered by env + ilike prefix.
 */
export async function allocateNextInternalNoteTitle(
  supabase: SupabaseClient,
  caseTitle: string
): Promise<{ title: string; prefix: string; baseId: string }> {
  const env = getEnvironment();
  const baseId = buildInternalNoteTitleBase(caseTitle);
  const prefix = `${baseId}_Note_`;
  const { data: titleRows } = await supabase
    .from("internal_notes")
    .select("title")
    .eq("env", env)
    .ilike("title", `${prefix}%`)
    .limit(2000);

  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const maxSeq = (titleRows ?? []).reduce((acc, row: any) => {
    const m = String(row?.title || "").match(new RegExp(`^${escapedPrefix}(\\d+)$`));
    if (!m) return acc;
    return Math.max(acc, Number(m[1]) || 0);
  }, 0);

  const title = `${prefix}${String(maxSeq + 1).padStart(5, "0")}`;
  return { title, prefix, baseId };
}
