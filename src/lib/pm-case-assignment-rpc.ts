import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { ApplyCaseUpdateResult } from "@/lib/apply-case-update";

export async function pmUpdateCaseAssignments(
  supabase: SupabaseClient,
  caseId: string,
  patch: Record<string, unknown>,
  expectedRevision: number,
): Promise<{ data: ApplyCaseUpdateResult | null; error: PostgrestError | Error | null }> {
  if (!caseId) {
    return { data: null, error: new Error("missing caseId") };
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return { data: null, error: new Error("invalid expectedRevision") };
  }
  if (!patch || Object.keys(patch).length === 0) {
    return { data: null, error: new Error("empty_patch") };
  }

  const { data, error } = await supabase.rpc("pm_update_case_assignments", {
    p_case_id: caseId,
    p_patch: patch,
    p_expected_revision: expectedRevision,
  });

  if (error) {
    return { data: null, error };
  }

  const result = (data ?? null) as ApplyCaseUpdateResult | null;
  if (!result?.ok) {
    return {
      data: result,
      error: new Error(result?.error || "pm_update_case_assignments failed"),
    };
  }
  return { data: result, error: null };
}
