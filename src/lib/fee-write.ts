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

/** 連續寫入取目前 store 已落地的 updatedAt，不用入列當下的舊快照。 */
export function pickFeePersistExpectedUpdatedAt(
  latest: { updatedAt?: string } | undefined,
  queuedSnapshot: { updatedAt?: string } | undefined,
): string | undefined {
  if (typeof latest?.updatedAt === "string" && latest.updatedAt) return latest.updatedAt;
  if (typeof queuedSnapshot?.updatedAt === "string" && queuedSnapshot.updatedAt) return queuedSnapshot.updatedAt;
  return undefined;
}

export function nextFeeInFlightCount(current: number | undefined, delta: 1 | -1): number {
  return Math.max(0, (current ?? 0) + delta);
}

export function feeWriteStillProtected(count: number | undefined): boolean {
  return (count ?? 0) > 0;
}

/** 排隊中或上一筆尚未確定成功時，都要保留待送欄位。中斷／失敗不得清掉。 */
export function shouldDropFeePendingAfterJob(remaining: number, jobFailed: boolean): boolean {
  return remaining === 0 && !jobFailed;
}

/** 遠端列覆蓋時保留尚未結束的本機欄位意圖，但不採用本機 updatedAt。 */
export function mergeFeeRemoteWithPending<T extends { updatedAt?: string }>(
  remote: T,
  pending: Partial<T> | undefined,
): T {
  if (!pending) return remote;
  const rest = { ...pending };
  delete (rest as { updatedAt?: string }).updatedAt;
  return { ...remote, ...rest, updatedAt: remote.updatedAt };
}

type FeeConflictSlice = {
  updatedAt?: string;
  clientInfo?: Partial<ClientInfo>;
  taskItems?: unknown;
};

/**
 * 遠端版本已變，且他人改過我們正要送出的欄位 → 衝突，不得用新版本號重送舊整包。
 * 他人只改不同欄位則不擋，呼叫端改用遠端版本＋只送使用者實際改動的鍵。
 */
export function hasExternalFeeFieldConflict(
  remote: FeeConflictSlice | undefined,
  queuedPrev: FeeConflictSlice | undefined,
  updates: FeeConflictSlice,
): boolean {
  if (!remote || !queuedPrev) return false;
  if (!remote.updatedAt || remote.updatedAt === queuedPrev.updatedAt) return false;

  if (updates.clientInfo !== undefined) {
    const changed = clientInfoChangedKeys(queuedPrev.clientInfo, updates.clientInfo);
    for (const key of Object.keys(changed) as FeeClientInfoKey[]) {
      if (JSON.stringify(remote.clientInfo?.[key]) !== JSON.stringify(queuedPrev.clientInfo?.[key])) {
        return true;
      }
    }
  }
  if (updates.taskItems !== undefined) {
    if (
      JSON.stringify(remote.taskItems) !== JSON.stringify(queuedPrev.taskItems) &&
      JSON.stringify(updates.taskItems) !== JSON.stringify(remote.taskItems)
    ) {
      return true;
    }
  }
  return false;
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
