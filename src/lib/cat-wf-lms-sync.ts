import type { SupabaseClient } from "@supabase/supabase-js";
import { getEnvironment } from "@/lib/environment";

type CollabRowJson = {
  id: string;
  taskCompleted?: boolean;
  [key: string]: unknown;
};

function mapCollabRows(rows: CollabRowJson[], collabRowId: string, taskCompleted: boolean) {
  return rows.map((r) =>
    String(r.id) === String(collabRowId) ? { ...r, taskCompleted } : r,
  );
}

/** CAT 段落「任務完成」→ LMS 協作列 taskCompleted（B-4） */
export async function markCollabRowTaskCompletedFromCat(
  supabase: SupabaseClient,
  caseId: string,
  collabRowId: string,
  completedAt: string,
): Promise<{ ok: boolean; allTaskCompleted?: boolean; error?: string }> {
  return setCollabRowTaskCompletedFromCat(supabase, caseId, collabRowId, true, completedAt);
}

/** CAT ↔ LMS 雙向：設定協作列 taskCompleted（true 或 false） */
export async function setCollabRowTaskCompletedFromCat(
  supabase: SupabaseClient,
  caseId: string,
  collabRowId: string,
  taskCompleted: boolean,
  updatedAt: string,
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

  const updatedRows = mapCollabRows(rows, collabRowId, taskCompleted);
  const allTaskCompleted =
    updatedRows.length > 0 && updatedRows.every((r) => !!r.taskCompleted);

  const updates: Record<string, unknown> = {
    collab_rows: updatedRows,
    updated_at: updatedAt,
  };
  const status = (caseRow as { status?: string }).status;
  if (taskCompleted && status === "dispatched" && allTaskCompleted) {
    updates.status = "task_completed";
  } else if (!taskCompleted && status === "task_completed") {
    updates.status = "dispatched";
  }

  const { error: updErr } = await supabase
    .from("cases")
    .update(updates as Record<string, never>)
    .eq("id", caseId)
    .eq("env", env);
  if (updErr) return { ok: false, error: updErr.message };
  return { ok: true, allTaskCompleted };
}

/** PM 整檔／拆段調整：批次回寫多列 taskCompleted */
export async function setCollabRowsTaskCompletedBulkFromCat(
  supabase: SupabaseClient,
  caseId: string,
  updates: { collabRowId: string; taskCompleted: boolean }[],
  updatedAt: string,
): Promise<{ ok: boolean; allTaskCompleted?: boolean; error?: string }> {
  const env = getEnvironment();
  const { data: caseRow, error: fetchErr } = await supabase
    .from("cases")
    .select("collab_rows, status")
    .eq("id", caseId)
    .eq("env", env)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!caseRow) return { ok: false, error: "case not found" };

  const rows = Array.isArray((caseRow as { collab_rows?: unknown }).collab_rows)
    ? ((caseRow as { collab_rows: CollabRowJson[] }).collab_rows)
    : [];
  const byId = new Map(updates.map((u) => [String(u.collabRowId), u.taskCompleted]));
  const updatedRows = rows.map((r) => {
    const hit = byId.get(String(r.id));
    return hit === undefined ? r : { ...r, taskCompleted: hit };
  });
  const allTaskCompleted =
    updatedRows.length > 0 && updatedRows.every((r) => !!r.taskCompleted);

  const patch: Record<string, unknown> = {
    collab_rows: updatedRows,
    updated_at: updatedAt,
  };
  const status = (caseRow as { status?: string }).status;
  if (status === "dispatched" && allTaskCompleted) {
    patch.status = "task_completed";
  } else if (status === "task_completed" && !allTaskCompleted) {
    patch.status = "dispatched";
  }

  const { error: updErr } = await supabase
    .from("cases")
    .update(patch as Record<string, never>)
    .eq("id", caseId)
    .eq("env", env);
  if (updErr) return { ok: false, error: updErr.message };
  return { ok: true, allTaskCompleted };
}
