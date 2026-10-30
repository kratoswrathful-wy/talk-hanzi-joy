import type { SupabaseClient } from "@supabase/supabase-js";

/** LMS 勾翻譯完成時，只查對應 CAT 指派的必要欄位。 */
export const LMS_COMPLETE_CAT_ASSIGN_COLUMNS =
  "id, collab_row_id, workflow_status, file_workflow_stage_id, assignee_user_id";

export const LMS_COMPLETE_CAT_STAGE_COLUMNS = "id, stage_kind";

export type LmsCompleteCatAssignRow = {
  id?: string;
  collab_row_id?: string | null;
  workflow_status?: string | null;
  file_workflow_stage_id?: string | null;
  assignee_user_id?: string | null;
};

export type LmsCompleteCatStageRow = {
  id?: string;
  stage_kind?: string | null;
};

export function translateAssignmentIdsFromLmsCompleteLookup(input: {
  assignments: LmsCompleteCatAssignRow[];
  stages: LmsCompleteCatStageRow[];
}): string[] {
  const translateStageIds = new Set(
    (input.stages || [])
      .filter((s) => String(s.stage_kind || "").trim().toLowerCase() === "translate")
      .map((s) => String(s.id || "").trim())
      .filter(Boolean),
  );
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const a of input.assignments || []) {
    const id = String(a.id || "").trim();
    if (!id || seen.has(id)) continue;
    if (String(a.workflow_status || "") === "completed") continue;
    const stageId = String(a.file_workflow_stage_id || "").trim();
    if (!stageId || !translateStageIds.has(stageId)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** LMS 勾翻譯完成後，把該列未完成的 CAT 翻譯指派標成 completed。 */
export async function markCatTranslateCompletedForLmsRow(
  supabase: SupabaseClient,
  collabRowId: string,
): Promise<string[]> {
  const rowId = String(collabRowId || "").trim();
  if (!rowId) return [];
  const { data: assigns, error: assignErr } = await supabase
    .from("cat_stage_assignments")
    .select(LMS_COMPLETE_CAT_ASSIGN_COLUMNS)
    .eq("collab_row_id", rowId);
  if (assignErr) throw assignErr;
  const assignments = (assigns ?? []) as LmsCompleteCatAssignRow[];
  const stageIds = [...new Set(
    assignments.map((a) => String(a.file_workflow_stage_id || "").trim()).filter(Boolean),
  )];
  if (!stageIds.length) return [];
  const { data: stages, error: stageErr } = await supabase
    .from("cat_file_workflow_stages")
    .select(LMS_COMPLETE_CAT_STAGE_COLUMNS)
    .in("id", stageIds);
  if (stageErr) throw stageErr;
  const ids = translateAssignmentIdsFromLmsCompleteLookup({
    assignments,
    stages: (stages ?? []) as LmsCompleteCatStageRow[],
  });
  const done: string[] = [];
  for (const id of ids) {
    const { error } = await supabase.rpc(
      "cat_update_stage_assignment_workflow_status" as never,
      {
        p_assignment_id: id,
        p_workflow_status: "completed",
      } as never,
    );
    if (error) throw error;
    done.push(id);
  }
  return done;
}
