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
export function mergeFeeRemoteWithPending<T extends { updatedAt?: string; clientInfo?: Partial<ClientInfo> }>(
  remote: T,
  pending: Partial<T> | undefined,
): T {
  if (!pending) return remote;
  const rest = { ...pending };
  delete (rest as { updatedAt?: string }).updatedAt;
  const pendingInfo = rest.clientInfo;
  delete (rest as { clientInfo?: Partial<ClientInfo> }).clientInfo;
  return {
    ...remote,
    ...rest,
    ...(pendingInfo
      ? { clientInfo: { ...(remote.clientInfo ?? {}), ...pendingInfo } as T["clientInfo"] }
      : {}),
    updatedAt: remote.updatedAt,
  };
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

/** jsonb 數字可能以字串回來；畫面輸入框不能因此變成 0。 */
export function readJsonNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/** 重查後只准送實際改過的 client_info 鍵，不得用新版本號配舊整包。 */
export function feeClientInfoPatchAfterRequery(
  remote: FeeConflictSlice | undefined,
  queuedPrev: FeeConflictSlice | undefined,
  updates: FeeConflictSlice,
): { conflict: boolean; clientInfoPatch: Partial<ClientInfo> } {
  if (hasExternalFeeFieldConflict(remote, queuedPrev, updates)) {
    return { conflict: true, clientInfoPatch: {} };
  }
  return {
    conflict: false,
    clientInfoPatch: clientInfoChangedKeys(queuedPrev?.clientInfo, updates.clientInfo),
  };
}

/** 沒有伺服器 ok 不得當已寫入；中斷／空回應要保留待送。 */
export function persistFeeWriteConfirmed(result: {
  error: unknown;
  data?: ApplyFeeWriteResult | null;
}): boolean {
  return !result.error && result.data?.ok === true;
}

export const FEE_PENDING_STORAGE_KEY = "lms-fee-pending-writes";

export type FeePendingRecord = {
  env: string;
  id: string;
  updates: Record<string, unknown>;
  prev?: FeeConflictSlice | null;
};

export function parseFeePendingRecords(raw: string | null): FeePendingRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is FeePendingRecord => {
      if (!row || typeof row !== "object") return false;
      const rec = row as Partial<FeePendingRecord>;
      return typeof rec.env === "string" && typeof rec.id === "string" && !!rec.updates && typeof rec.updates === "object";
    });
  } catch {
    return [];
  }
}

export function serializeFeePendingRecords(records: FeePendingRecord[]): string {
  return JSON.stringify(records);
}

export function upsertFeePendingRecord(records: FeePendingRecord[], next: FeePendingRecord): FeePendingRecord[] {
  return [...records.filter((row) => !(row.env === next.env && row.id === next.id)), next];
}

export function removeFeePendingRecord(records: FeePendingRecord[], env: string, id: string): FeePendingRecord[] {
  return records.filter((row) => !(row.env === env && row.id === id));
}

/** RPC 因版本對不上而拒寫；中斷／權限失敗不算。 */
export function isFeeStaleVersionError(result: {
  error: unknown;
  data?: ApplyFeeWriteResult | null;
}): boolean {
  if (result.data?.error === "stale_updated_at") return true;
  return result.error instanceof Error && result.error.message === "stale_updated_at";
}

/**
 * 寫入前重查之後、真正送出前又被他人改不同欄：可再用新版本重試，只送自己改的鍵。
 * 同一欄已被他人改、或不是版本衝突，不得重試。
 */
export function shouldRetryFeePersistAfterStale(
  result: { error: unknown; data?: ApplyFeeWriteResult | null },
  remote: FeeConflictSlice | undefined,
  queuedPrev: FeeConflictSlice | undefined,
  updates: FeeConflictSlice,
): boolean {
  if (persistFeeWriteConfirmed(result)) return false;
  if (!isFeeStaleVersionError(result)) return false;
  return !hasExternalFeeFieldConflict(remote, queuedPrev, updates);
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
