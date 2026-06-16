import type { SupabaseClient } from "@supabase/supabase-js";
import { getEnvironment } from "@/lib/environment";

type CollabRowJson = {
  id: string;
  taskCompleted?: boolean;
  [key: string]: unknown;
};

const ELIGIBLE_TASK_COMPLETED_STATUSES = ["draft", "inquiry", "dispatched"] as const;

function canUpgradeCaseToTaskCompleted(status?: string) {
  return (ELIGIBLE_TASK_COMPLETED_STATUSES as readonly string[]).includes(status ?? "");
}

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
  if (taskCompleted && canUpgradeCaseToTaskCompleted(status) && allTaskCompleted) {
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
  if (canUpgradeCaseToTaskCompleted(status) && allTaskCompleted) {
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

/** 單人多檔：全連結檔整檔翻譯指派皆 completed → 升案件 task_completed（無 collab_row_id） */
export async function maybeUpgradeCaseTaskCompletedFromCatFiles(
  supabase: SupabaseClient,
  caseId: string,
  updatedAt: string,
): Promise<{ ok: boolean; upgraded: boolean; error?: string }> {
  const env = getEnvironment();
  const { data: caseRow, error: fetchErr } = await supabase
    .from("cases")
    .select("status, multi_collab")
    .eq("id", caseId)
    .eq("env", env)
    .maybeSingle();
  if (fetchErr) return { ok: false, upgraded: false, error: fetchErr.message };
  if (!caseRow) return { ok: false, upgraded: false, error: "case not found" };

  const status = (caseRow as { status?: string }).status;
  if (!canUpgradeCaseToTaskCompleted(status)) {
    return { ok: true, upgraded: false };
  }

  const { data: files, error: filesErr } = await supabase
    .from("cat_files" as never)
    .select("id")
    .eq("related_lms_case_id", caseId);
  if (filesErr) return { ok: false, upgraded: false, error: filesErr.message };

  const fileIds = ((files as { id: string }[] | null) ?? []).map((f) => f.id);
  if (!fileIds.length) return { ok: true, upgraded: false };

  const { data: stages, error: stErr } = await supabase
    .from("cat_file_workflow_stages" as never)
    .select("id, file_id")
    .in("file_id", fileIds)
    .eq("stage_kind", "translate");
  if (stErr) return { ok: false, upgraded: false, error: stErr.message };

  const stageRows = (stages as { id: string; file_id: string }[] | null) ?? [];
  const stageIds = stageRows.map((s) => s.id);
  if (!stageIds.length) return { ok: true, upgraded: false };

  const { data: assigns, error: aErr } = await supabase
    .from("cat_stage_assignments" as never)
    .select("file_id, workflow_status, collab_row_id")
    .in("file_workflow_stage_id", stageIds)
    .is("collab_row_id", null);
  if (aErr) return { ok: false, upgraded: false, error: aErr.message };

  const assignRows =
    (assigns as { file_id: string; workflow_status: string; collab_row_id: string | null }[] | null) ?? [];

  const filesWithAssign = new Set(assignRows.map((a) => String(a.file_id)));
  if (filesWithAssign.size === 0) return { ok: true, upgraded: false };

  const allDone = assignRows.every((a) => a.workflow_status === "completed");
  const coversAllFiles = fileIds.every((fid) => filesWithAssign.has(String(fid)));
  if (!allDone || !coversAllFiles) return { ok: true, upgraded: false };

  const { error: updErr } = await supabase
    .from("cases")
    .update({ status: "task_completed", updated_at: updatedAt } as Record<string, unknown> as Record<string, never>)
    .eq("id", caseId)
    .eq("env", env);
  if (updErr) return { ok: false, upgraded: false, error: updErr.message };
  return { ok: true, upgraded: true };
}
