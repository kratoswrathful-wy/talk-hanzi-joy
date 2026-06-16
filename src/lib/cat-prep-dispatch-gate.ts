import type { SupabaseClient } from "@supabase/supabase-js";

export type NotPrepReadyFile = { file_id: string; file_name: string };

/** LMS 派出前：本案連結 CAT 檔皆須 prep 已完成 */
export async function fetchCaseLinkedFilesNotPrepReady(
  supabase: SupabaseClient,
  caseId: string,
): Promise<NotPrepReadyFile[]> {
  if (!caseId) return [];
  const { data, error } = await supabase.rpc(
    "cat_case_linked_files_not_prep_ready" as never,
    { p_case_id: caseId } as never,
  );
  if (error) {
    console.warn("[cat-prep-dispatch-gate]", error.message);
    return [];
  }
  return (data as NotPrepReadyFile[] | null) ?? [];
}

export async function assertCaseLinkedFilesPrepReady(
  supabase: SupabaseClient,
  caseId: string,
): Promise<{ ok: boolean; fileNames: string[] }> {
  const rows = await fetchCaseLinkedFilesNotPrepReady(supabase, caseId);
  return {
    ok: rows.length === 0,
    fileNames: rows.map((r) => String(r.file_name || r.file_id)),
  };
}
