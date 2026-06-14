import type { SupabaseClient } from "@supabase/supabase-js";

/** 案件派出／協作列變更 → CAT cat_stage_assignments 同步（B-4） */
export async function syncCatWorkflowAssignmentsForCase(
  supabase: SupabaseClient,
  caseId: string,
): Promise<void> {
  if (!caseId) return;
  try {
    await (supabase as SupabaseClient).rpc("sync_cat_workflow_assignments_for_case" as never, {
      p_case_id: caseId,
    } as never);
  } catch (e) {
    console.warn("[cat-workflow-dispatch] sync skipped:", e);
  }
}

/** 通知已開啟的 CAT iframe 重新載入 Workflow 指派（LMS→CAT 雙向） */
export function broadcastCatWorkflowAssignmentsSynced(caseId: string): void {
  if (!caseId || typeof BroadcastChannel === "undefined") return;
  try {
    const ch = new BroadcastChannel("tms-cat-wf-sync");
    ch.postMessage({ type: "WORKFLOW_ASSIGNMENTS_SYNCED", caseId });
    ch.close();
  } catch {
    /* ignore */
  }
}
