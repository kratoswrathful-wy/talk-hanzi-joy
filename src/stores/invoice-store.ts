import type { Invoice, InvoiceStatus, PaymentRecord } from "@/data/invoice-types";
import type { SimplePersistedLog } from "@/lib/edit-log-coalesce";
import { supabase } from "@/integrations/supabase/client";
import { getEnvironment } from "@/lib/environment";
import { createPollFallback } from "@/lib/realtime-poll";
import { getAuthenticatedUser } from "@/lib/auth-ready";

type Listener = () => void;

let invoices: Invoice[] = [];
let loaded = false;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

// ── DB ↔ App mapping ──

interface DbInvoice {
  id: string;
  title: string;
  translator: string;
  status: string;
  transfer_date: string | null;
  note: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  payments: any;
  edit_log_started_at?: string | null;
  edit_logs?: SimplePersistedLog[] | null;
}

function dbToApp(row: DbInvoice, feeIds: string[]): Invoice {
  return {
    id: row.id,
    title: row.title || "",
    translator: row.translator,
    status: row.status as InvoiceStatus,
    transferDate: row.transfer_date || undefined,
    note: row.note,
    createdBy: row.created_by || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    feeIds,
    payments: Array.isArray(row.payments) ? row.payments : [],
    editLogStartedAt: row.edit_log_started_at || undefined,
    edit_logs: Array.isArray(row.edit_logs) ? row.edit_logs : undefined,
  };
}

function generateDefaultTitle(translator: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${translator || "未指定"}_Invoice_${yyyy}${mm}`;
}

// Cache user id
let _cachedUserId: string | null = null;
async function getUserId() {
  if (_cachedUserId) return _cachedUserId;
  const { data } = await supabase.auth.getSession();
  _cachedUserId = data?.session?.user?.id ?? null;
  return _cachedUserId;
}
// Auth listener registered after invoiceStore export (see bottom of file)

// Realtime subscription – full reload on any invoice or link change
supabase
  .channel("invoices-realtime")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "invoices" },
    () => { if (loaded) invoiceStore.loadInvoices(); }
  )
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "invoice_fees" },
    () => { if (loaded) invoiceStore.loadInvoices(); }
  )
  .subscribe();

// Polling fallback for invoices
const invoicePoll = createPollFallback("invoices", () => {
  if (loaded) invoiceStore.loadInvoices();
}, 3000);

export const invoiceStore = {
  getInvoices: () => invoices,
  isLoaded: () => loaded,

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    if (listeners.size === 1) invoicePoll.start();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) invoicePoll.stop();
    };
  },

  loadInvoices: async () => {
    const user = await getAuthenticatedUser();
    if (!user) {
      invoices = [];
      loaded = false;
      notify();
      return { error: null };
    }

    const env = getEnvironment();

    const { data: invData, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("env", env)
      .order("created_at", { ascending: false });

    if (error || !invData) return { error };

    const { data: linkData } = await supabase
      .from("invoice_fees")
      .select("invoice_id, fee_id")
      .eq("env", env);

    const feeMap = new Map<string, string[]>();
    if (linkData) {
      for (const link of linkData) {
        const arr = feeMap.get(link.invoice_id) || [];
        arr.push(link.fee_id);
        feeMap.set(link.invoice_id, arr);
      }
    }

    invoices = (invData as unknown as DbInvoice[]).map((row) =>
      dbToApp(row, feeMap.get(row.id) || [])
    );
    loaded = true;
    notify();
    return { error: null };
  },

  createInvoice: async (
    translator: string,
    feeIds: string[],
    opts?: { editLogFromCreation?: boolean }
  ): Promise<Invoice | null> => {
    const uid = await getUserId();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const title = generateDefaultTitle(translator);
    const env = getEnvironment();

    const started = opts?.editLogFromCreation ? now : undefined;
    const newInvoice: Invoice = {
      id,
      title,
      translator,
      status: "pending",
      note: "",
      createdBy: uid || "",
      createdAt: now,
      updatedAt: now,
      feeIds,
      payments: [],
      ...(started ? { editLogStartedAt: started } : {}),
    };

    invoices = [newInvoice, ...invoices];
    notify();

    const { error } = await supabase.from("invoices").insert({
      id,
      title,
      translator,
      status: "pending",
      note: "",
      created_by: uid,
      env,
      ...(started ? { edit_log_started_at: started } : {}),
    } as any);

    if (error) {
      console.error("Failed to create invoice:", error);
      invoices = invoices.filter((i) => i.id !== id);
      notify();
      return null;
    }

    if (feeIds.length > 0) {
      const links = feeIds.map((feeId) => ({ invoice_id: id, fee_id: feeId, env }));
      const { error: linkErr } = await supabase.from("invoice_fees").insert(links as any);
      if (linkErr) console.error("Failed to link fees:", linkErr);
    }

    return newInvoice;
  },

  updateInvoice: (id: string, updates: Partial<Pick<Invoice, "status" | "transferDate" | "note" | "title" | "payments" | "editLogStartedAt">> & Record<string, any>) => {
    invoices = invoices.map((inv) => (inv.id === id ? { ...inv, ...updates } : inv));
    notify();

    const dbUpdates: Record<string, any> = {};
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.transferDate !== undefined) dbUpdates.transfer_date = updates.transferDate || null;
    if (updates.note !== undefined) dbUpdates.note = updates.note;
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.payments !== undefined) dbUpdates.payments = updates.payments;
    if (updates.comments !== undefined) dbUpdates.comments = updates.comments;
    if (updates.edit_logs !== undefined) dbUpdates.edit_logs = updates.edit_logs;
    if (updates.editLogStartedAt !== undefined) dbUpdates.edit_log_started_at = updates.editLogStartedAt || null;

    if (Object.keys(dbUpdates).length > 0) {
      supabase
        .from("invoices")
        .update(dbUpdates)
        .eq("id", id)
        .then(({ error }) => {
          if (error) console.error("Failed to update invoice:", error);
        });
    }
  },

  deleteInvoice: (id: string) => {
    invoices = invoices.filter((inv) => inv.id !== id);
    notify();

    supabase
      .from("invoices")
      .delete()
      .eq("id", id)
      .then(({ error }) => {
        if (error) console.error("Failed to delete invoice:", error);
      });
  },

  addFeesToInvoice: async (invoiceId: string, feeIds: string[]) => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return;

    const newFeeIds = feeIds.filter((fid) => !inv.feeIds.includes(fid));
    if (newFeeIds.length === 0) return;

    invoices = invoices.map((i) =>
      i.id === invoiceId ? { ...i, feeIds: [...i.feeIds, ...newFeeIds] } : i
    );
    notify();

    const links = newFeeIds.map((feeId) => ({ invoice_id: invoiceId, fee_id: feeId, env: getEnvironment() }));
    const { error } = await supabase.from("invoice_fees").insert(links as any);
    if (error) console.error("Failed to add fees to invoice:", error);
  },

  removeFeeFromInvoice: async (invoiceId: string, feeId: string) => {
    invoices = invoices.map((i) =>
      i.id === invoiceId ? { ...i, feeIds: i.feeIds.filter((fid) => fid !== feeId) } : i
    );
    notify();

    const { error } = await supabase
      .from("invoice_fees")
      .delete()
      .eq("invoice_id", invoiceId)
      .eq("fee_id", feeId);
    if (error) console.error("Failed to remove fee from invoice:", error);
  },

  getInvoiceById: (id: string) => invoices.find((i) => i.id === id),

  getLinkedFeeIds: (): Set<string> => {
    const set = new Set<string>();
    for (const inv of invoices) {
      for (const fid of inv.feeIds) set.add(fid);
    }
    return set;
  },

  getInvoicesByTranslator: (translator: string) =>
    invoices.filter((i) => i.translator === translator),
};

supabase.auth.onAuthStateChange((event, session) => {
  _cachedUserId = session?.user?.id ?? null;
  if (event === "TOKEN_REFRESHED") {
    void invoiceStore.loadInvoices();
    return;
  }
  loaded = false;
  notify();
  if (event === "SIGNED_OUT" || !session) {
    invoices = [];
    loaded = false;
    notify();
  }
});
