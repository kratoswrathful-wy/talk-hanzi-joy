import { type TranslatorFee, type ClientInfo, type FeeEditLogPhases, defaultClientInfo } from "@/data/fee-mock-data";
import { supabase } from "@/integrations/supabase/client";
import { getEnvironment } from "@/lib/environment";
import { createPollFallback } from "@/lib/realtime-poll";
import { getAuthenticatedUser } from "@/lib/auth-ready";

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
  task_items: any;
  client_info: any;
  notes: any;
  edit_logs: any;
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
  const ci = row.client_info as ClientInfo | undefined;
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
    taskItems: Array.isArray(row.task_items) ? row.task_items : [],
    clientInfo: row.client_info ? (row.client_info as ClientInfo) : { ...defaultClientInfo },
    notes: Array.isArray(row.notes) ? row.notes : [],
    editLogs: Array.isArray(row.edit_logs) ? row.edit_logs : [],
    editLogPhases: parseEditLogPhases(row),
    createdBy: row.created_by || "",
    createdAt: row.created_at,
    finalizedBy: row.finalized_by || undefined,
    finalizedAt: row.finalized_at || undefined,
  };
}

function appToDb(fee: Partial<TranslatorFee>): Record<string, any> {
  const m: Record<string, any> = {};
  if (fee.title !== undefined) m.title = fee.title;
  if (fee.assignee !== undefined) m.assignee = fee.assignee;
  if (fee.status !== undefined) m.status = fee.status;
  if (fee.internalNote !== undefined) m.internal_note = fee.internalNote;
  if (fee.internalNoteUrl !== undefined) m.internal_note_url = fee.internalNoteUrl;
  if (fee.taskItems !== undefined) m.task_items = fee.taskItems;
  if (fee.clientInfo !== undefined) m.client_info = fee.clientInfo;
  if (fee.notes !== undefined) m.notes = fee.notes;
  if (fee.editLogs !== undefined) m.edit_logs = fee.editLogs;
  if (fee.editLogPhases !== undefined) m.edit_log_phases = fee.editLogPhases;
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
    } as any)
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

// Realtime subscription – sync changes from other users
supabase
  .channel("fees-realtime")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "fees" },
    (payload) => {
      const env = getEnvironment();
      if (payload.eventType === "UPDATE" && payload.new) {
        const row = payload.new as any;
        if (row.env !== env) return;
        const updated = dbToApp(row as DbFee);
        fees = fees.map((f) => (f.id === updated.id ? updated : f));
        notify();
      } else if (payload.eventType === "INSERT" && payload.new) {
        const row = payload.new as any;
        if (row.env !== env) return;
        if (!fees.some((f) => f.id === row.id)) {
          fees = [dbToApp(row as DbFee), ...fees];
          notify();
        }
      } else if (payload.eventType === "DELETE" && payload.old) {
        const oldId = (payload.old as any).id;
        if (fees.some((f) => f.id === oldId)) {
          fees = fees.filter((f) => f.id !== oldId);
          notify();
        }
      }
    }
  )
  .subscribe();

// Polling fallback for fees
const feePoll = createPollFallback("fees", () => {
  if (loaded) feeStore.loadFees();
}, 3000);

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

    const { data, error } = await supabase
      .from("fees")
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
