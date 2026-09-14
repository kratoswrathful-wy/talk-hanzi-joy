import { type TranslatorFee, type ClientInfo, type ClientTaskItem, type FeeEditLogPhases, type FeeTaskItem, type EditLog, type TaskType, type BillingUnit, defaultClientInfo } from "@/data/fee-mock-data";
import { supabase } from "@/integrations/supabase/client";
import { getEnvironment } from "@/lib/environment";
import { createFeesVisiblePollFallback } from "@/lib/realtime-poll";
import { AuthRecoverableError, getAuthenticatedUser } from "@/lib/auth-ready";
import type { Json, TablesInsert } from "@/integrations/supabase/types";
import { createKeyedQueue } from "@/lib/case-write-queue";
import {
  applyFeeDelete,
  applyFeeUpdate,
  clientInfoChangedKeys,
  feeWriteStillProtected,
  shouldDropFeePendingAfterJob,
  hasExternalFeeFieldConflict,
  mergeFeeRemoteWithPending,
  persistFeeWriteConfirmed,
  isFeeStaleVersionError,
  readJsonNumber,
  nextFeeInFlightCount,
  pickFeePersistExpectedUpdatedAt,
  FEE_PENDING_STORAGE_KEY,
  parseFeePendingRecords,
  serializeFeePendingRecords,
  upsertFeePendingRecord,
  removeFeePendingRecord,
  type FeePendingRecord,
} from "@/lib/fee-write";
import { notesFromJson, notesToJson } from "@/lib/fee-notes";
import { toast } from "sonner";

const TASK_TYPES: TaskType[] = ["翻譯", "校對", "MTPE", "LQA"];
const BILLING_UNITS: BillingUnit[] = ["字", "小時"];

function readTaskType(v: Json | undefined): TaskType {
  return typeof v === "string" && (TASK_TYPES as string[]).includes(v) ? (v as TaskType) : "翻譯";
}
function readBillingUnit(v: Json | undefined): BillingUnit {
  return typeof v === "string" && (BILLING_UNITS as string[]).includes(v) ? (v as BillingUnit) : "字";
}

function taskItemsFromJson(raw: Json): FeeTaskItem[] {
  if (!Array.isArray(raw)) return [];
  const out: FeeTaskItem[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x as Record<string, Json>;
    if (typeof o.id !== "string") continue;
    out.push({
      id: o.id,
      taskType: readTaskType(o.taskType),
      billingUnit: readBillingUnit(o.billingUnit),
      unitCount: readJsonNumber(o.unitCount),
      unitPrice: readJsonNumber(o.unitPrice),
    });
  }
  return out;
}

function taskItemsToJson(items: FeeTaskItem[]): Json {
  return items.map((i) => ({
    id: i.id,
    taskType: i.taskType,
    billingUnit: i.billingUnit,
    unitCount: i.unitCount,
    unitPrice: i.unitPrice,
  }));
}

function clientTaskItemsFromJson(raw: Json | undefined): ClientTaskItem[] {
  if (!Array.isArray(raw)) return defaultClientInfo.clientTaskItems;
  const out: ClientTaskItem[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x as Record<string, Json>;
    if (typeof o.id !== "string") continue;
    out.push({
      id: o.id,
      taskType: readTaskType(o.taskType),
      billingUnit: readBillingUnit(o.billingUnit),
      unitCount: readJsonNumber(o.unitCount),
      clientPrice: readJsonNumber(o.clientPrice),
    });
  }
  return out;
}

function clientInfoFromJson(raw: Json | undefined): ClientInfo {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...defaultClientInfo };
  const o = raw as Record<string, Json>;
  const link = o.clientCaseLink && typeof o.clientCaseLink === "object" && !Array.isArray(o.clientCaseLink)
    ? (o.clientCaseLink as Record<string, Json>)
    : {};
  return {
    clientTaskItems: clientTaskItemsFromJson(o.clientTaskItems),
    sameCase: typeof o.sameCase === "boolean" ? o.sameCase : defaultClientInfo.sameCase,
    isFirstFee: typeof o.isFirstFee === "boolean" ? o.isFirstFee : defaultClientInfo.isFirstFee,
    notFirstFee: typeof o.notFirstFee === "boolean" ? o.notFirstFee : defaultClientInfo.notFirstFee,
    client: typeof o.client === "string" ? o.client : defaultClientInfo.client,
    contact: typeof o.contact === "string" ? o.contact : defaultClientInfo.contact,
    clientCaseId: typeof o.clientCaseId === "string" ? o.clientCaseId : defaultClientInfo.clientCaseId,
    eciKeywords: typeof o.eciKeywords === "string" ? o.eciKeywords : defaultClientInfo.eciKeywords,
    clientPoNumber: typeof o.clientPoNumber === "string" ? o.clientPoNumber : defaultClientInfo.clientPoNumber,
    clientCaseLink: {
      url: typeof link.url === "string" ? link.url : defaultClientInfo.clientCaseLink.url,
      label: typeof link.label === "string" ? link.label : defaultClientInfo.clientCaseLink.label,
    },
    dispatchRoute: typeof o.dispatchRoute === "string" ? o.dispatchRoute : defaultClientInfo.dispatchRoute,
    reconciled: typeof o.reconciled === "boolean" ? o.reconciled : defaultClientInfo.reconciled,
    rateConfirmed: typeof o.rateConfirmed === "boolean" ? o.rateConfirmed : defaultClientInfo.rateConfirmed,
    invoiced: typeof o.invoiced === "boolean" ? o.invoiced : defaultClientInfo.invoiced,
  };
}

function clientInfoToJson(ci: ClientInfo): Json {
  return {
    clientTaskItems: ci.clientTaskItems.map((i) => ({
      id: i.id,
      taskType: i.taskType,
      billingUnit: i.billingUnit,
      unitCount: i.unitCount,
      clientPrice: i.clientPrice,
    })),
    sameCase: ci.sameCase,
    isFirstFee: ci.isFirstFee,
    notFirstFee: ci.notFirstFee,
    client: ci.client,
    contact: ci.contact,
    clientCaseId: ci.clientCaseId,
    eciKeywords: ci.eciKeywords,
    clientPoNumber: ci.clientPoNumber,
    clientCaseLink: { url: ci.clientCaseLink.url, label: ci.clientCaseLink.label },
    dispatchRoute: ci.dispatchRoute,
    reconciled: ci.reconciled,
    rateConfirmed: ci.rateConfirmed,
    invoiced: ci.invoiced,
  };
}

function editLogsFromJson(raw: Json): EditLog[] {
  if (!Array.isArray(raw)) return [];
  const out: EditLog[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x as Record<string, Json>;
    if (typeof o.id !== "string") continue;
    out.push({
      id: o.id,
      author: typeof o.author === "string" ? o.author : "",
      field: typeof o.field === "string" ? o.field : "",
      oldValue: typeof o.oldValue === "string" ? o.oldValue : "",
      newValue: typeof o.newValue === "string" ? o.newValue : "",
      timestamp: typeof o.timestamp === "string" ? o.timestamp : "",
      ...(typeof o.fieldKey === "string" ? { fieldKey: o.fieldKey } : {}),
    });
  }
  return out;
}

function editLogsToJson(logs: EditLog[]): Json {
  return logs.map((l) => ({
    id: l.id,
    author: l.author,
    field: l.field,
    oldValue: l.oldValue,
    newValue: l.newValue,
    timestamp: l.timestamp,
    ...(l.fieldKey !== undefined ? { fieldKey: l.fieldKey } : {}),
  }));
}

function editLogPhasesToJson(phases: FeeEditLogPhases): Json {
  return {
    ...(phases.basic !== undefined ? { basic: phases.basic } : {}),
    ...(phases.revenue !== undefined ? { revenue: phases.revenue } : {}),
    ...(phases.task !== undefined ? { task: phases.task } : {}),
  };
}

type Listener = () => void;

let fees: TranslatorFee[] = [];
let loaded = false;
let loadSeq = 0; // sequence counter to prevent stale results
let loadPromise: Promise<{ error: unknown }> | null = null;
let reloadRequested = false;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

// ── DB ↔ App mapping ──

interface DbFee {
  id: string;
  title: string;
  assignee: string;
  status: string;
  internal_note: string;
  internal_note_url: string;
  task_items: Json;
  client_info: Json;
  notes: Json;
  edit_logs: Json;
  edit_log_phases: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  finalized_by: string | null;
  finalized_at: string | null;
}

function parseEditLogPhases(row: DbFee): FeeEditLogPhases | undefined {
  const raw =
    row.edit_log_phases && typeof row.edit_log_phases === "object" && !Array.isArray(row.edit_log_phases)
      ? { ...(row.edit_log_phases as FeeEditLogPhases) }
      : {};
  const ci = row.client_info ? clientInfoFromJson(row.client_info) : undefined;
  if (!raw.basic && row.status === "finalized" && row.title?.trim() && row.assignee) {
    raw.basic = row.finalized_at || row.created_at;
  }
  if (!raw.revenue && ci?.reconciled) {
    raw.revenue = row.updated_at;
  }
  if (!raw.task && ci?.rateConfirmed) {
    raw.task = row.updated_at;
  }
  return Object.keys(raw).length ? raw : undefined;
}

function dbToApp(row: DbFee): TranslatorFee {
  return {
    id: row.id,
    title: row.title,
    assignee: row.assignee,
    status: row.status as TranslatorFee["status"],
    internalNote: row.internal_note,
    internalNoteUrl: row.internal_note_url || undefined,
    taskItems: taskItemsFromJson(row.task_items),
    clientInfo: row.client_info ? clientInfoFromJson(row.client_info) : { ...defaultClientInfo },
    notes: notesFromJson(row.notes),
    editLogs: editLogsFromJson(row.edit_logs),
    editLogPhases: parseEditLogPhases(row),
    createdBy: row.created_by || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finalizedBy: row.finalized_by || undefined,
    finalizedAt: row.finalized_at || undefined,
  };
}

function appToDb(fee: Partial<TranslatorFee>): Record<string, Json> {
  const m: Record<string, Json> = {};
  if (fee.title !== undefined) m.title = fee.title;
  if (fee.assignee !== undefined) m.assignee = fee.assignee;
  if (fee.status !== undefined) m.status = fee.status;
  if (fee.internalNote !== undefined) m.internal_note = fee.internalNote;
  if (fee.internalNoteUrl !== undefined) m.internal_note_url = fee.internalNoteUrl;
  if (fee.taskItems !== undefined) m.task_items = taskItemsToJson(fee.taskItems);
  if (fee.clientInfo !== undefined) m.client_info = clientInfoToJson(fee.clientInfo);
  if (fee.notes !== undefined) m.notes = notesToJson(fee.notes);
  if (fee.editLogs !== undefined) m.edit_logs = editLogsToJson(fee.editLogs);
  if (fee.editLogPhases !== undefined) m.edit_log_phases = editLogPhasesToJson(fee.editLogPhases);
  return m;
}

/** Fire-and-forget DB write with error logging */
function persistInsert(fee: TranslatorFee, userId: string | null) {
  supabase
    .from("fees")
    .insert({
      id: fee.id,
      ...appToDb(fee),
      created_by: userId || null,
      env: getEnvironment(),
    } as TablesInsert<"fees">)
    .then(({ error }) => {
      if (error) console.error("Failed to insert fee:", error);
    });
}

// ── Store ──

// Cache current user id
let _cachedUserId: string | null = null;
async function getUserId() {
  if (_cachedUserId) return _cachedUserId;
  const { data } = await supabase.auth.getSession();
  _cachedUserId = data?.session?.user?.id ?? null;
  return _cachedUserId;
}
// Listen for auth changes — avoid wiping UI on TOKEN_REFRESHED (same user, new access token)

// Realtime subscription – sync changes from other users.
// W10 C-06：禁止訂閱 fees 原表（WS payload 含未遮罩營收）。改訂閱 fee_change_signals
//（僅 fee_id／env／op），再重查 fees_visible；DELETE 信號則從本地移除。
async function requeryFeeFromView(id: string) {
  const { data, error } = await supabase
    .from("fees_visible")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("Failed to re-query fee from fees_visible:", error);
    return;
  }
  if (!data) {
    // 不可見（非本人／草稿／他 env）→ 確保本地不殘留
    if (fees.some((f) => f.id === id)) {
      fees = fees.filter((f) => f.id !== id);
      notify();
    }
    return;
  }
  const updated = applyRemoteFeeRow(dbToApp(data as DbFee));
  if (fees.some((f) => f.id === updated.id)) {
    fees = fees.map((f) => (f.id === updated.id ? updated : f));
  } else {
    fees = [updated, ...fees];
  }
  notify();
}

type FeeChangeSignalRow = {
  fee_id: string;
  env?: string;
  op?: string;
};

const feeWriteQueue = createKeyedQueue();
const feeInFlight = new Map<string, Partial<TranslatorFee>>();
const feeInFlightCount = new Map<string, number>();
const feeLastRemote = new Map<string, TranslatorFee>();
const feePendingQueuedPrev = new Map<string, TranslatorFee>();
let feePendingReplayStarted = false;

function readStoredFeePending(): FeePendingRecord[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    return parseFeePendingRecords(sessionStorage.getItem(FEE_PENDING_STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeStoredFeePending(records: FeePendingRecord[]) {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (records.length === 0) sessionStorage.removeItem(FEE_PENDING_STORAGE_KEY);
    else sessionStorage.setItem(FEE_PENDING_STORAGE_KEY, serializeFeePendingRecords(records));
  } catch {
    /* 配額或隱私模式：待送仍留在記憶體 */
  }
}

function rememberFeePending(id: string, updates: Partial<TranslatorFee>, prev?: TranslatorFee) {
  if (prev && !feePendingQueuedPrev.has(id)) feePendingQueuedPrev.set(id, prev);
  const env = getEnvironment();
  writeStoredFeePending(
    upsertFeePendingRecord(readStoredFeePending(), {
      env,
      id,
      updates: { ...(feeInFlight.get(id) ?? {}) } as Record<string, unknown>,
      prev: feePendingQueuedPrev.get(id) ?? prev ?? null,
    }),
  );
}

function forgetFeePending(id: string) {
  feePendingQueuedPrev.delete(id);
  writeStoredFeePending(removeFeePendingRecord(readStoredFeePending(), getEnvironment(), id));
}

function hydrateFeePendingFromStorage() {
  const env = getEnvironment();
  for (const rec of readStoredFeePending()) {
    if (rec.env !== env) continue;
    if (feeInFlight.has(rec.id)) continue;
    feeInFlight.set(rec.id, rec.updates as Partial<TranslatorFee>);
    if (rec.prev && typeof rec.prev === "object") {
      feePendingQueuedPrev.set(rec.id, rec.prev as TranslatorFee);
    }
  }
}

hydrateFeePendingFromStorage();

function rememberRemoteFee(row: TranslatorFee) {
  feeLastRemote.set(row.id, row);
}

function applyRemoteFeeRow(row: TranslatorFee): TranslatorFee {
  rememberRemoteFee(row);
  if (!feeInFlight.has(row.id) && !feeWriteStillProtected(feeInFlightCount.get(row.id))) return row;
  return mergeFeeRemoteWithPending(row, feeInFlight.get(row.id));
}

supabase
  .channel("fee-change-signals")
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "fee_change_signals" },
    (payload) => {
      const env = getEnvironment();
      const row = payload.new as FeeChangeSignalRow;
      if (!row?.fee_id || row.env !== env) return;
      if (row.op === "DELETE") {
        if (fees.some((f) => f.id === row.fee_id)) {
          fees = fees.filter((f) => f.id !== row.fee_id);
          notify();
        }
        return;
      }
      if (!feeInFlight.has(row.fee_id) && !feeWriteStillProtected(feeInFlightCount.get(row.fee_id))) {
        void requeryFeeFromView(row.fee_id);
      }
    }
  )
  .subscribe();

// Polling fallback：譯者對 fees 基表無 SELECT，改偵測 fees_visible.updated_at
const feePoll = createFeesVisiblePollFallback(() => {
  if (loaded) feeStore.loadFees();
}, 15000);

async function resolveFeeUpdatedAt(id: string, current?: TranslatorFee | undefined): Promise<string | null> {
  if (current?.updatedAt) return current.updatedAt;
  const { data, error } = await supabase
    .from("fees_visible")
    .select("updated_at")
    .eq("id", id)
    .eq("env", getEnvironment())
    .maybeSingle();
  if (error || !data || typeof (data as { updated_at?: unknown }).updated_at !== "string") {
    return null;
  }
  return (data as { updated_at: string }).updated_at;
}

function buildFeeRpcPatch(
  prev: TranslatorFee | undefined,
  updates: Partial<TranslatorFee>,
): Record<string, unknown> {
  const db = appToDb(updates);
  const patch: Record<string, unknown> = { ...db };
  if (updates.clientInfo !== undefined) {
    const keys = clientInfoChangedKeys(prev?.clientInfo, updates.clientInfo);
    if (Object.keys(keys).length === 0) {
      delete patch.client_info;
    } else {
      patch.client_info = keys;
    }
  }
  delete patch.edit_log_phases;
  return patch;
}

async function persistFeeUpdateOnce(id: string, updates: Partial<TranslatorFee>, prev: TranslatorFee | undefined) {
  // 入列當下的 prev.updatedAt 會過期；連續改多欄時必須用前一筆已落地的 store 版本。
  // 雙人同時改不同欄時，先重查遠端，避免用過期版本號把後面的寫入擋掉。
  await requeryFeeFromView(id);
  const latest = fees.find((f) => f.id === id);
  const remote = feeLastRemote.get(id);
  if (hasExternalFeeFieldConflict(remote, prev, updates)) {
    return { kind: "conflict" as const };
  }
  const picked = pickFeePersistExpectedUpdatedAt(remote ?? latest, prev);
  const expected = picked ?? (await resolveFeeUpdatedAt(id, remote ?? latest ?? prev));
  if (!expected) {
    return { kind: "no-version" as const };
  }
  const patch = buildFeeRpcPatch(prev, updates);
  if (Object.keys(patch).length === 0) return { kind: "empty" as const };
  const result = await applyFeeUpdate(supabase, id, patch, expected);
  return { kind: "rpc" as const, result };
}

async function persistFeeUpdate(id: string, updates: Partial<TranslatorFee>, prev: TranslatorFee | undefined) {
  let attempt = await persistFeeUpdateOnce(id, updates, prev);
  if (attempt.kind === "rpc" && !persistFeeWriteConfirmed(attempt.result) && isFeeStaleVersionError(attempt.result)) {
    // 重查後、送出前他人改了不同欄：再用新版本重試，不得把第一次失敗當終局。
    attempt = await persistFeeUpdateOnce(id, updates, prev);
  }
  if (attempt.kind === "conflict") {
    const err = new Error("費用已被他人更新同一欄位，本次未覆寫。已保留畫面輸入。");
    toast.error(err.message);
    return err;
  }
  if (attempt.kind === "no-version") {
    const err = new Error("無法確認費用版本，尚未寫入。已保留畫面輸入。");
    toast.error(err.message);
    return err;
  }
  if (attempt.kind === "empty") return null;
  const result = attempt.result;
  if (!persistFeeWriteConfirmed(result)) {
    const err = result.error instanceof Error ? result.error : new Error("apply_fee_update_failed");
    toast.error("費用儲存失敗，已保留畫面輸入。請勿離開後當成已儲存。");
    return err;
  }
  const nextUpdatedAt = result.data?.updated_at;
  const nextStatus = result.data?.status as TranslatorFee["status"] | undefined;
  fees = fees.map((f) => {
    if (f.id !== id) return f;
    const base = feeLastRemote.get(id) ?? prev ?? f;
    const confirmed = {
      ...base,
      ...updates,
      ...(nextStatus ? { status: nextStatus } : {}),
      ...(nextUpdatedAt ? { updatedAt: nextUpdatedAt } : {}),
    };
    rememberRemoteFee(confirmed);
    return mergeFeeRemoteWithPending(confirmed, feeInFlight.get(id));
  });
  notify();
  return null;
}

function replayHydratedFeeWrites() {
  if (feePendingReplayStarted) return;
  feePendingReplayStarted = true;
  for (const [id, updates] of feeInFlight.entries()) {
    if (feeWriteStillProtected(feeInFlightCount.get(id))) continue;
    const prev = feePendingQueuedPrev.get(id);
    feeInFlightCount.set(id, nextFeeInFlightCount(feeInFlightCount.get(id), 1));
    void feeWriteQueue.enqueue(id, async () => {
      let failed = false;
      try {
        const err = await persistFeeUpdate(id, updates, prev);
        failed = !!err;
        return err;
      } catch (error) {
        failed = true;
        return error instanceof Error ? error : new Error("apply_fee_update_failed");
      } finally {
        const remaining = nextFeeInFlightCount(feeInFlightCount.get(id), -1);
        if (remaining > 0) {
          feeInFlightCount.set(id, remaining);
        } else {
          feeInFlightCount.delete(id);
          if (shouldDropFeePendingAfterJob(remaining, failed)) {
            feeInFlight.delete(id);
            forgetFeePending(id);
          }
        }
      }
    });
  }
}

export const feeStore = {
  getFees: () => fees,
  isLoaded: () => loaded,

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    if (listeners.size === 1) feePoll.start();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) feePoll.stop();
    };
  },

  /** Initial consumers share the current request without scheduling a trailing refresh. */
  ensureLoaded: async () => {
    if (loaded) return { error: null };
    if (loadPromise) return loadPromise;
    return feeStore.loadFees();
  },

  /** Load all fees from DB filtered by current environment. Single-flight with trailing refresh. */
  loadFees: async () => {
    if (loadPromise) {
      reloadRequested = true;
      return loadPromise;
    }

    loadPromise = (async () => {
      let lastResult: { error: unknown } = { error: null };
      try {
        do {
          reloadRequested = false;
          const seq = ++loadSeq;
          let user;
          try {
            user = await getAuthenticatedUser();
          } catch (e) {
            if (e instanceof AuthRecoverableError) {
              // 可恢復 Auth 錯誤：不要假裝已載入空清單，結束本輪讓呼叫端重試
              loaded = false;
              lastResult = { error: e };
              break;
            }
            throw e;
          }

          if (seq !== loadSeq) {
            lastResult = { error: null };
            continue;
          }
          if (!user) {
            fees = [];
            loaded = false;
            notify();
            lastResult = { error: null };
            continue;
          }

          // W10：讀取一律走遮罩 view（欄位級遮罩＋列級 RLS）；寫入仍走 fees 原表。
          const { data, error } = await supabase
            .from("fees_visible")
            .select("*")
            .eq("env", getEnvironment())
            .order("created_at", { ascending: false });

          if (seq !== loadSeq) {
            lastResult = { error: null };
            continue;
          }
          if (!error && data) {
            fees = (data as DbFee[]).map((row) => applyRemoteFeeRow(dbToApp(row)));
            loaded = true;
            notify();
            replayHydratedFeeWrites();
          }
          lastResult = { error };
        } while (reloadRequested);
      } finally {
        loadPromise = null;
      }
      return lastResult;
    })();

    return loadPromise;
  },

  addFee: (fee: TranslatorFee) => {
    fees = [fee, ...fees];
    notify();
    getUserId().then((uid) => persistInsert(fee, uid));
  },

  updateFee: (id: string, updates: Partial<TranslatorFee>) => {
    const prev = fees.find((f) => f.id === id);
    const wroteStatus = updates.status !== undefined;
    const display = wroteStatus ? { ...updates, status: prev?.status } : updates;
    fees = fees.map((f) => (f.id === id ? { ...f, ...display } : f));
    feeInFlight.set(id, { ...feeInFlight.get(id), ...updates });
    feeInFlightCount.set(id, nextFeeInFlightCount(feeInFlightCount.get(id), 1));
    rememberFeePending(id, updates, prev);
    notify();
    return feeWriteQueue.enqueue(id, async () => {
      let failed = false;
      try {
        const err = await persistFeeUpdate(id, updates, prev);
        failed = !!err;
        return err;
      } catch (error) {
        failed = true;
        return error instanceof Error ? error : new Error("apply_fee_update_failed");
      } finally {
        const remaining = nextFeeInFlightCount(feeInFlightCount.get(id), -1);
        if (remaining > 0) {
          feeInFlightCount.set(id, remaining);
        } else {
          feeInFlightCount.delete(id);
          if (shouldDropFeePendingAfterJob(remaining, failed)) {
            feeInFlight.delete(id);
            forgetFeePending(id);
          }
        }
      }
    });
  },

  deleteFee: (id: string) => {
    const snapshot = fees.find((f) => f.id === id);
    fees = fees.filter((f) => f.id !== id);
    feeInFlight.set(id, { id } as Partial<TranslatorFee>);
    feeInFlightCount.set(id, nextFeeInFlightCount(feeInFlightCount.get(id), 1));
    notify();
    return feeWriteQueue.enqueue(id, async () => {
      try {
        const expected = await resolveFeeUpdatedAt(id, snapshot);
        if (!expected) {
          if (snapshot && !fees.some((f) => f.id === id)) {
            fees = [snapshot, ...fees];
            notify();
          }
          return new Error("無法確認費用是否已刪除。已保留畫面資料。");
        }
        const result = await applyFeeDelete(supabase, id, expected);
        if (result.error) {
          if (snapshot && !fees.some((f) => f.id === id)) {
            fees = [snapshot, ...fees];
            notify();
          }
          return result.error instanceof Error ? result.error : new Error("apply_fee_delete_failed");
        }
        return null;
      } finally {
        const remaining = nextFeeInFlightCount(feeInFlightCount.get(id), -1);
        if (remaining > 0) {
          feeInFlightCount.set(id, remaining);
        } else {
          feeInFlightCount.delete(id);
          feeInFlight.delete(id);
        }
      }
    });
  },

  getFeeById: (id: string) => {
    const row = fees.find((f) => f.id === id);
    if (!row) return undefined;
    return mergeFeeRemoteWithPending(row, feeInFlight.get(id));
  },

  hasUnconfirmedWrite: (id: string) =>
    feeInFlight.has(id) || feeWriteStillProtected(feeInFlightCount.get(id)),

  /** 單筆補抓（fees_visible）：供 agent.getFresh 在整表尚未含該列時使用。 */
  fetchFeeById: async (id: string): Promise<TranslatorFee | null> => {
    const { data, error } = await supabase
      .from("fees_visible")
      .select("*")
      .eq("id", id)
      .eq("env", getEnvironment())
      .maybeSingle();
    if (error || !data) return null;
    const mapped = applyRemoteFeeRow(dbToApp(data as DbFee));
    if (fees.some((f) => f.id === id)) {
      fees = fees.map((f) => (f.id === id ? mapped : f));
    } else {
      fees = [mapped, ...fees];
    }
    notify();
    return mapped;
  },

  createDraft: (): TranslatorFee => {
    const now = new Date();
    const newFee: TranslatorFee = {
      id: crypto.randomUUID(),
      title: "",
      assignee: "",
      status: "draft",
      internalNote: "",
      taskItems: [
        {
          id: `item-${Date.now()}`,
          taskType: "翻譯",
          billingUnit: "字",
          unitCount: 0,
          unitPrice: 0,
        },
      ],
      notes: [],
      editLogs: [],
      createdBy: _cachedUserId || "",
      createdAt: now.toISOString(),
    };

    fees = [newFee, ...fees];
    notify();

    getUserId().then((uid) => persistInsert(newFee, uid));

    return newFee;
  },
};

let _feeAuthUserId: string | null = null;

supabase.auth.onAuthStateChange((event, session) => {
  _cachedUserId = session?.user?.id ?? null;
  const nextUserId = session?.user?.id ?? null;

  // Token refresh must not full-reload (avoids focus storms). Align with case-store.
  if (event === "TOKEN_REFRESHED") {
    return;
  }

  if (!session || event === "SIGNED_OUT") {
    fees = [];
    loaded = false;
    loadPromise = null;
    reloadRequested = false;
    _feeAuthUserId = null;
    notify();
    return;
  }

  if (
    (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
    loaded &&
    _feeAuthUserId &&
    nextUserId &&
    _feeAuthUserId === nextUserId
  ) {
    return;
  }

  if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
    loaded = false;
    _feeAuthUserId = nextUserId;
    notify();
    void feeStore.ensureLoaded();
  }
});
