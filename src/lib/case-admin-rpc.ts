import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/integrations/supabase/types";

export const CASE_ADMIN_RPC = {
  create: "admin_create_case",
  delete: "admin_delete_case",
} as const;

type AdminCaseRpcResult = {
  ok?: boolean;
  error?: string;
  id?: string;
  revision?: number;
};

export async function adminCreateCase(
  client: SupabaseClient,
  caseId: string,
  payload: Record<string, Json | undefined>,
): Promise<{ data: AdminCaseRpcResult | null; error: PostgrestError | Error | null }> {
  if (!caseId) return { data: null, error: new Error("missing caseId") };
  const { data, error } = await client.rpc(CASE_ADMIN_RPC.create, {
    p_case_id: caseId,
    p_payload: payload as Json,
  });
  if (error) return { data: null, error };
  const result = data as AdminCaseRpcResult | null;
  if (!result?.ok) {
    return { data: result, error: new Error(result?.error || "admin_create_case failed") };
  }
  return { data: result, error: null };
}

export async function adminDeleteCase(
  client: SupabaseClient,
  caseId: string,
  expectedRevision: number,
): Promise<{ data: AdminCaseRpcResult | null; error: PostgrestError | Error | null }> {
  if (!caseId) return { data: null, error: new Error("missing caseId") };
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return { data: null, error: new Error("invalid expectedRevision") };
  }
  const { data, error } = await client.rpc(CASE_ADMIN_RPC.delete, {
    p_case_id: caseId,
    p_expected_revision: expectedRevision,
  });
  if (error) return { data: null, error };
  const result = data as AdminCaseRpcResult | null;
  if (!result?.ok) {
    return { data: result, error: new Error(result?.error || "admin_delete_case failed") };
  }
  return { data: result, error: null };
}
