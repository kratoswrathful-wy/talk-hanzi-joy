import type { SupabaseClient } from "@supabase/supabase-js";

export type CatWorkflowSyncReport = {
  found: boolean;
  unresolvedTranslators: string[];
  rowsWithoutFile: number;
  written: number;
};

/** 案件派出／協作列變更 → CAT cat_stage_assignments 同步（B-4）；回傳失敗報告供 PM 提示 */
export async function syncCatWorkflowAssignmentsForCase(
  supabase: SupabaseClient,
  caseId: string,
): Promise<CatWorkflowSyncReport | null> {
  if (!caseId) return null;
  try {
    const { data } = await (supabase as SupabaseClient).rpc(
      "sync_cat_workflow_assignments_for_case" as never,
      { p_case_id: caseId } as never,
    );
    const r = (data ?? {}) as Record<string, unknown>;
    return {
      found: r.found !== false,
      unresolvedTranslators: Array.isArray(r.unresolvedTranslators)
        ? (r.unresolvedTranslators as string[])
        : [],
      rowsWithoutFile: typeof r.rowsWithoutFile === "number" ? r.rowsWithoutFile : 0,
      written: typeof r.written === "number" ? r.written : 0,
    };
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
