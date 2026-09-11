import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { ClientInfo } from "@/data/fee-mock-data";

export const FEE_CLIENT_INFO_KEYS = [
  "clientTaskItems",
  "sameCase",
  "isFirstFee",
  "notFirstFee",
  "client",
  "contact",
  "clientCaseId",
  "eciKeywords",
  "clientPoNumber",
  "clientCaseLink",
  "dispatchRoute",
  "reconciled",
  "rateConfirmed",
  "invoiced",
] as const;

export type FeeClientInfoKey = (typeof FEE_CLIENT_INFO_KEYS)[number];

export type ApplyFeeWriteResult = {
  ok: boolean;
  id?: string;
  updated_at?: string;
  status?: string;
  deleted?: boolean;
  error?: string;
};

const SERVER_OWNED = new Set([
  "id",
  "env",
  "created_by",
  "created_at",
  "updated_at",
  "finalized_by",
  "finalized_at",
]);

/** 只送有改動的 client_info 鍵；不得把整包舊物件或 mapper 空值當 patch。 */
export function clientInfoChangedKeys(
  prev: Partial<ClientInfo> | undefined,
  next: Partial<ClientInfo> | undefined,
): Partial<ClientInfo> {
  if (!next) return {};
  const out: Partial<ClientInfo> = {};
  for (const key of FEE_CLIENT_INFO_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
    if (JSON.stringify(prev?.[key]) !== JSON.stringify(next[key])) {
      (out as Record<string, unknown>)[key] = next[key];
    }
  }
  return out;
}

export function stripFeeServerOwnedKeys(patch: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (SERVER_OWNED.has(key) || value === undefined) continue;
    next[key] = value;
  }
  return next;
}

export async function applyFeeUpdate(
  supabase: SupabaseClient,
  feeId: string,
  patch: Record<string, unknown>,
  expectedUpdatedAt: string,
): Promise<{ data: ApplyFeeWriteResult | null; error: PostgrestError | Error | null }> {
  if (!feeId) return { data: null, error: new Error("missing feeId") };
  if (!expectedUpdatedAt) return { data: null, error: new Error("invalid_updated_at") };
  const p_patch = stripFeeServerOwnedKeys(patch);
  if (Object.keys(p_patch).length === 0) {
    return { data: null, error: new Error("empty_patch") };
  }
  const { data, error } = await supabase.rpc("apply_fee_update", {
    p_fee_id: feeId,
    p_patch,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) return { data: null, error };
  const parsed = data as ApplyFeeWriteResult | null;
  if (parsed && parsed.ok === false) {
    return { data: parsed, error: new Error(parsed.error || "apply_fee_update_failed") };
  }
  return { data: parsed, error: null };
}

export async function applyFeeDelete(
  supabase: SupabaseClient,
  feeId: string,
  expectedUpdatedAt: string,
): Promise<{ data: ApplyFeeWriteResult | null; error: PostgrestError | Error | null }> {
  if (!feeId) return { data: null, error: new Error("missing feeId") };
  if (!expectedUpdatedAt) return { data: null, error: new Error("invalid_updated_at") };
  const { data, error } = await supabase.rpc("apply_fee_delete", {
    p_fee_id: feeId,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) return { data: null, error };
  const parsed = data as ApplyFeeWriteResult | null;
  if (parsed && parsed.ok === false) {
    return { data: parsed, error: new Error(parsed.error || "apply_fee_delete_failed") };
  }
  return { data: parsed, error: null };
}
