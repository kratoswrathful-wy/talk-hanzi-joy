import { type TranslatorFee, type ClientInfo, type FeeEditLogPhases, type FeeTaskItem, type Note, type EditLog, defaultClientInfo } from "@/data/fee-mock-data";
import { supabase } from "@/integrations/supabase/client";
import { getEnvironment } from "@/lib/environment";
import { createPollFallback } from "@/lib/realtime-poll";
import { getAuthenticatedUser } from "@/lib/auth-ready";
import type { Json, TablesInsert } from "@/integrations/supabase/types";

type Listener = () => void;

let fees: TranslatorFee[] = [];
let loaded = false;
let loadSeq = 0; // sequence counter to prevent stale results
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
  const ci = row.client_info as unknown as ClientInfo | undefined;
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
    taskItems: Array.isArray(row.task_items) ? (row.task_items as unknown as FeeTaskItem[]) : [],
    clientInfo: row.client_info ? (row.client_info as unknown as ClientInfo) : { ...defaultClientInfo },
    notes: Array.isArray(row.notes) ? (row.notes as unknown as Note[]) : [],
    editLogs: Array.isArray(row.edit_logs) ? (row.edit_logs as unknown as EditLog[]) : [],
    editLogPhases: parseEditLogPhases(row),
    createdBy: row.created_by || "",
    createdAt: row.created_at,
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
  if (fee.taskItems !== undefined) m.task_items = fee.taskItems as unknown as Json;
  if (fee.clientInfo !== undefined) m.client_info = fee.clientInfo as unknown as Json;
  if (fee.notes !== undefined) m.notes = fee.notes as unknown as Json;
  if (fee.editLogs !== undefined) m.edit_logs = fee.editLogs as unknown as Json;
  if (fee.editLogPhases !== undefined) m.edit_log_phases = fee.editLogPhases as unknown as Json;
  if (fee.finalizedBy !== undefined) m.finalized_by = fee.finalizedBy;
  if (fee.finalizedAt !== undefined) m.finalized_at = fee.finalizedAt;
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
// W10：postgres_changes 的 payload.new 是「原表全欄位」（含營收/客戶/內部備註），
// 遮罩 view 管不到 realtime。故非 DELETE 事件一律「重查遮罩 view」，禁止直接套 payload.new；
// 若重查不到（列級 RLS 過濾掉或已非本人可見），從本地移除。
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
  const updated = dbToApp(data as unknown as DbFee);
  if (fees.some((f) => f.id === updated.id)) {
    fees = fees.map((f) => (f.id === updated.id ? updated : f));
  } else {
    fees = [updated, ...fees];
  }
  notify();
}

supabase
  .channel("fees-realtime")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "fees" },
    (payload) => {
      const env = getEnvironment();
      if (payload.eventType === "DELETE" && payload.old) {
        const oldId = (payload.old as Partial<DbFee>).id;
        if (fees.some((f) => f.id === oldId)) {
          fees = fees.filter((f) => f.id !== oldId);
          notify();
        }
        return;
      }
      const row = payload.new as Partial<DbFee> & { env?: string };
      if (!row.id || row.env !== env) return;
      void requeryFeeFromView(row.id);
    }
  )
  .subscribe();

// Polling fallback for fees
const feePoll = createPollFallback("fees", () => {
  if (loaded) feeStore.loadFees();
}, 15000);

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

  /** Load all fees from DB filtered by current environment. */
  loadFees: async () => {
    const seq = ++loadSeq;
    const user = await getAuthenticatedUser();

    if (seq !== loadSeq) return { error: null };
    if (!user) {
      fees = [];
      loaded = false;
      notify();
      return { error: null };
    }

    // W10：讀取一律走遮罩 view（欄位級遮罩＋列級 RLS）；寫入仍走 fees 原表。
    const { data, error } = await supabase
      .from("fees_visible")
      .select("*")
      .eq("env", getEnvironment())
      .order("created_at", { ascending: false });

    if (seq !== loadSeq) return { error: null };
    if (!error && data) {
      fees = (data as unknown as DbFee[]).map(dbToApp);
      loaded = true;
      notify();
    }
    return { error };
  },

  addFee: (fee: TranslatorFee) => {
    fees = [fee, ...fees];
    notify();
    getUserId().then((uid) => persistInsert(fee, uid));
  },

  updateFee: (id: string, updates: Partial<TranslatorFee>) => {
    fees = fees.map((f) => (f.id === id ? { ...f, ...updates } : f));
    notify();

    const dbUpdates = appToDb(updates);
    if (Object.keys(dbUpdates).length === 0) return;

    supabase
      .from("fees")
      .update(dbUpdates)
      .eq("id", id)
      .then(({ error }) => {
        if (error) console.error("Failed to update fee:", error);
      });
  },

  deleteFee: (id: string) => {
    fees = fees.filter((f) => f.id !== id);
    notify();

    supabase
      .from("fees")
      .delete()
      .eq("id", id)
      .then(({ error }) => {
        if (error) console.error("Failed to delete fee:", error);
      });
  },

  getFeeById: (id: string) => fees.find((f) => f.id === id),

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

supabase.auth.onAuthStateChange((event, session) => {
  _cachedUserId = session?.user?.id ?? null;
  if (event === "TOKEN_REFRESHED") {
    void feeStore.loadFees();
    return;
  }
  loaded = false;
  notify();
  if (event === "SIGNED_OUT" || !session) {
    fees = [];
    loaded = false;
    notify();
  }
});
