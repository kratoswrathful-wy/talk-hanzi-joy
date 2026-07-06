import { type TranslatorFee, type ClientInfo, type ClientTaskItem, type FeeEditLogPhases, type FeeTaskItem, type Note, type EditLog, type TaskType, type BillingUnit, defaultClientInfo } from "@/data/fee-mock-data";
import { supabase } from "@/integrations/supabase/client";
import { getEnvironment } from "@/lib/environment";
import { createPollFallback } from "@/lib/realtime-poll";
import { getAuthenticatedUser } from "@/lib/auth-ready";
import type { Json, TablesInsert } from "@/integrations/supabase/types";

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
      unitCount: typeof o.unitCount === "number" ? o.unitCount : 0,
      unitPrice: typeof o.unitPrice === "number" ? o.unitPrice : 0,
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
      unitCount: typeof o.unitCount === "number" ? o.unitCount : 0,
      clientPrice: typeof o.clientPrice === "number" ? o.clientPrice : 0,
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

function notesFromJson(raw: Json): Note[] {
  if (!Array.isArray(raw)) return [];
  const out: Note[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x as Record<string, Json>;
    if (typeof o.id !== "string") continue;
    out.push({
      id: o.id,
      author: typeof o.author === "string" ? o.author : "",
      text: typeof o.text === "string" ? o.text : "",
      createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
    });
  }
  return out;
}

function notesToJson(notes: Note[]): Json {
  return notes.map((n) => ({ id: n.id, author: n.author, text: n.text, createdAt: n.createdAt }));
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
  const updated = dbToApp(data as DbFee);
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
      fees = (data as DbFee[]).map(dbToApp);
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
