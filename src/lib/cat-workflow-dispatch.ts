import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseCatWorkflowSyncPayload,
  type CatWorkflowSyncReport,
} from "@/lib/cat-workflow-sync-result";

export type { CatWorkflowSyncReport };

/** 案件派出／協作列變更 → CAT cat_stage_assignments 同步（B-4）；回傳失敗報告供 PM 提示 */
export async function syncCatWorkflowAssignmentsForCase(
  supabase: SupabaseClient,
  caseId: string,
): Promise<CatWorkflowSyncReport | null> {
  if (!caseId) return null;
  try {
    const { data, error } = await (supabase as SupabaseClient).rpc(
      "lms_sync_cat_workflow_for_case" as never,
      { p_case_id: caseId } as never,
    );
    const parsed = parseCatWorkflowSyncPayload(data, error);
    if (parsed.ok === false) {
      console.warn("[cat-workflow-dispatch] sync not applied:", parsed.reason, error);
      return null;
    }
    return parsed.report;
  } catch (e) {
    console.warn("[cat-workflow-dispatch] sync skipped:", e);
    return null;
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
