import { type TranslatorFee, type ClientInfo, defaultClientInfo } from "@/data/fee-mock-data";
import { supabase } from "@/integrations/supabase/client";

type Listener = () => void;

let fees: TranslatorFee[] = [];
let loaded = false;
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
  created_by: string | null;
  created_at: string;
  finalized_by: string | null;
  finalized_at: string | null;
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
  if (fee.finalizedBy !== undefined) m.finalized_by = fee.finalizedBy;
  if (fee.finalizedAt !== undefined) m.finalized_at = fee.finalizedAt;
  return m;
}

// ── Store ──

export const feeStore = {
  getFees: () => fees,
  isLoaded: () => loaded,

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Load all fees from DB. Safe to call multiple times. */
  loadFees: async () => {
    const { data, error } = await supabase
      .from("fees")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) {
      fees = (data as unknown as DbFee[]).map(dbToApp);
      loaded = true;
      notify();
    }
    return { error };
  },

  addFee: async (fee: TranslatorFee) => {
    // Optimistic
    fees = [fee, ...fees];
    notify();

    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;

    const { error } = await supabase.from("fees").insert({
      id: fee.id,
      ...appToDb(fee),
      created_by: userId || null,
    } as any);

    if (error) {
      // Rollback
      fees = fees.filter((f) => f.id !== fee.id);
      notify();
      console.error("Failed to add fee:", error);
    }
  },

  updateFee: async (id: string, updates: Partial<TranslatorFee>) => {
    // Optimistic
    const prev = fees.find((f) => f.id === id);
    fees = fees.map((f) => (f.id === id ? { ...f, ...updates } : f));
    notify();

    const dbUpdates = appToDb(updates);
    if (Object.keys(dbUpdates).length === 0) return;

    const { error } = await supabase.from("fees").update(dbUpdates).eq("id", id);

    if (error) {
      // Rollback
      if (prev) {
        fees = fees.map((f) => (f.id === id ? prev : f));
        notify();
      }
      console.error("Failed to update fee:", error);
    }
  },

  deleteFee: async (id: string) => {
    const prev = fees.find((f) => f.id === id);
    fees = fees.filter((f) => f.id !== id);
    notify();

    const { error } = await supabase.from("fees").delete().eq("id", id);

    if (error) {
      if (prev) {
        fees = [prev, ...fees];
        notify();
      }
      console.error("Failed to delete fee:", error);
    }
  },

  getFeeById: (id: string) => fees.find((f) => f.id === id),

  createDraft: async (): Promise<TranslatorFee> => {
    const now = new Date();
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;

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
      createdBy: userId || "",
      createdAt: now.toISOString(),
    };

    // Optimistic
    fees = [newFee, ...fees];
    notify();

    const { error } = await supabase.from("fees").insert({
      id: newFee.id,
      ...appToDb(newFee),
      created_by: userId || null,
    } as any);

    if (error) {
      console.error("Failed to create draft:", error);
    }

    return newFee;
  },
};
