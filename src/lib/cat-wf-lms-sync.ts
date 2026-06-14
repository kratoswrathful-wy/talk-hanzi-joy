import type { SupabaseClient } from "@supabase/supabase-js";
import { getEnvironment } from "@/lib/environment";

type CollabRowJson = {
  id: string;
  taskCompleted?: boolean;
  [key: string]: unknown;
};

/** CAT 段落「任務完成」→ LMS 協作列 taskCompleted（B-4） */
export async function markCollabRowTaskCompletedFromCat(
  supabase: SupabaseClient,
  caseId: string,
  collabRowId: string,
  completedAt: string,
): Promise<{ ok: boolean; allTaskCompleted?: boolean; error?: string }> {
  const env = getEnvironment();
  const { data: caseRow, error: fetchErr } = await supabase
    .from("cases")
    .select("collab_rows, status, multi_collab")
    .eq("id", caseId)
    .eq("env", env)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!caseRow) return { ok: false, error: "case not found" };

  const rows = Array.isArray((caseRow as { collab_rows?: unknown }).collab_rows)
    ? ((caseRow as { collab_rows: CollabRowJson[] }).collab_rows)
    : [];
  const hasRow = rows.some((r) => String(r.id) === String(collabRowId));
  if (!hasRow) return { ok: false, error: "collab row not found" };

  const updatedRows = rows.map((r) =>
    String(r.id) === String(collabRowId) ? { ...r, taskCompleted: true } : r,
  );
  const allTaskCompleted =
    updatedRows.length > 0 && updatedRows.every((r) => !!r.taskCompleted);

  const updates: Record<string, unknown> = {
    collab_rows: updatedRows,
    updated_at: completedAt,
  };
  if ((caseRow as { status?: string }).status === "dispatched" && allTaskCompleted) {
    updates.status = "task_completed";
  }

  const { error: updErr } = await supabase
    .from("cases")
    .update(updates as Record<string, never>)
    .eq("id", caseId)
    .eq("env", env);
  if (updErr) return { ok: false, error: updErr.message };
  return { ok: true, allTaskCompleted };
}
