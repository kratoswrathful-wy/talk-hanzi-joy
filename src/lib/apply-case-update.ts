import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

export type ApplyCaseUpdateResult = {
  ok: boolean;
  id?: string;
  updated_at?: string;
  revision?: number;
  error?: string;
};

/**
 * 案件寫入（P0-B）：經 SECURITY DEFINER RPC `apply_case_update`。
 * 僅 PM／執行長；必須帶 expectedRevision（optimistic concurrency）。
 * 勿再對 `cases` 基表直呼 `.update()`。
 */
export async function applyCaseUpdate(
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

  const { data, error } = await supabase.rpc("apply_case_update", {
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
      error: new Error(result?.error || "apply_case_update failed"),
    };
  }
  return { data: result, error: null };
}

/** 將 RPC／PostgREST 錯誤壓成 case-store 既有的 error 形狀（有 message 即可）。 */
export function applyCaseUpdateErrorMessage(
  error: PostgrestError | Error | null | undefined,
): string {
  if (!error) return "";
  if ("message" in error && typeof error.message === "string") return error.message;
  return String(error);
}
