import type { ClientInvoice, ClientInvoiceStatus, ClientPaymentRecord } from "@/data/client-invoice-types";
import { supabase } from "@/integrations/supabase/client";
import { getEnvironment } from "@/lib/environment";
import { createPollFallback } from "@/lib/realtime-poll";

type Listener = () => void;

let invoices: ClientInvoice[] = [];
let loaded = false;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

interface DbClientInvoice {
  id: string;
  title: string;
  client: string;
  status: string;
  transfer_date: string | null;
  note: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  payments: any;
  is_record_only: boolean;
  record_amount: number;
  expected_collection_date: string | null;
  actual_collection_date: string | null;
}

function dbToApp(row: DbClientInvoice, feeIds: string[]): ClientInvoice {
  return {
    id: row.id,
    title: row.title || "",
    client: row.client,
    status: row.status as ClientInvoiceStatus,
    transferDate: row.transfer_date || undefined,
    note: row.note,
    createdBy: row.created_by || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    feeIds,
    payments: Array.isArray(row.payments) ? row.payments : [],
    isRecordOnly: row.is_record_only || false,
    recordAmount: row.record_amount || 0,
    recordCurrency: (row as any).record_currency || undefined,
    billingChannel: (row as any).billing_channel || undefined,
    expectedCollectionDate: row.expected_collection_date || undefined,
    actualCollectionDate: row.actual_collection_date || undefined,
  };
}

function generateDefaultTitle(client: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `Invoice_${client || "未指定"}_${yyyy}${mm}`;
}

let _cachedUserId: string | null = null;
async function getUserId() {
  if (_cachedUserId) return _cachedUserId;
  const { data } = await supabase.auth.getSession();
  _cachedUserId = data?.session?.user?.id ?? null;
  return _cachedUserId;
}
supabase.auth.onAuthStateChange((_event, session) => {
  _cachedUserId = session?.user?.id ?? null;
  loaded = false;
  notify();
});

// Realtime subscription – full reload on any client invoice or link change
supabase
  .channel("client-invoices-realtime")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "client_invoices" },
    () => { if (loaded) clientInvoiceStore.loadInvoices(); }
  )
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "client_invoice_fees" },
    () => { if (loaded) clientInvoiceStore.loadInvoices(); }
  )
  .subscribe();

// Polling fallback for client invoices
const clientInvoicePoll = createPollFallback("client_invoices", () => {
  if (loaded) clientInvoiceStore.loadInvoices();
}, 3000);

export const clientInvoiceStore = {
  getInvoices: () => invoices,
  isLoaded: () => loaded,

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    if (listeners.size === 1) clientInvoicePoll.start();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) clientInvoicePoll.stop();
    };
  },

  loadInvoices: async () => {
    const env = getEnvironment();

    const { data: invData, error } = await supabase
      .from("client_invoices" as any)
      .select("*")
      .eq("env", env)
      .order("created_at", { ascending: false });

    if (error || !invData) return { error };

    const { data: linkData } = await supabase
      .from("client_invoice_fees" as any)
      .select("client_invoice_id, fee_id")
      .eq("env", env);

    const feeMap = new Map<string, string[]>();
    if (linkData) {
      for (const link of linkData as any[]) {
        const arr = feeMap.get(link.client_invoice_id) || [];
        arr.push(link.fee_id);
        feeMap.set(link.client_invoice_id, arr);
      }
    }

    invoices = (invData as unknown as DbClientInvoice[]).map((row) =>
      dbToApp(row, feeMap.get(row.id) || [])
    );
    loaded = true;
    notify();
    return { error: null };
  },

  createInvoice: async (client: string, feeIds: string[]): Promise<ClientInvoice | null> => {
    const uid = await getUserId();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const title = generateDefaultTitle(client);
    const env = getEnvironment();

    const newInvoice: ClientInvoice = {
      id,
      title,
      client,
      status: "pending",
      note: "",
      createdBy: uid || "",
      createdAt: now,
      updatedAt: now,
      feeIds,
      payments: [],
    };

    invoices = [newInvoice, ...invoices];
    notify();

    const { error } = await supabase.from("client_invoices" as any).insert({
      id,
      title,
      client,
      status: "pending",
      note: "",
      created_by: uid,
      env,
    } as any);

    if (error) {
      console.error("Failed to create client invoice:", error);
      invoices = invoices.filter((i) => i.id !== id);
      notify();
      return null;
    }

    if (feeIds.length > 0) {
      const links = feeIds.map((feeId) => ({ client_invoice_id: id, fee_id: feeId, env }));
      const { error: linkErr } = await supabase.from("client_invoice_fees" as any).insert(links as any);
      if (linkErr) console.error("Failed to link fees:", linkErr);
    }

    return newInvoice;
  },

  updateInvoice: (id: string, updates: Partial<Pick<ClientInvoice, "status" | "transferDate" | "note" | "title" | "payments" | "isRecordOnly" | "recordAmount" | "recordCurrency" | "expectedCollectionDate" | "actualCollectionDate">> & Record<string, any>) => {
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
    if (updates.isRecordOnly !== undefined) dbUpdates.is_record_only = updates.isRecordOnly;
    if (updates.recordAmount !== undefined) dbUpdates.record_amount = updates.recordAmount;
    if (updates.recordCurrency !== undefined) dbUpdates.record_currency = updates.recordCurrency;
    if (updates.expectedCollectionDate !== undefined) dbUpdates.expected_collection_date = updates.expectedCollectionDate || null;
    if (updates.actualCollectionDate !== undefined) dbUpdates.actual_collection_date = updates.actualCollectionDate || null;

    if (Object.keys(dbUpdates).length > 0) {
      supabase
        .from("client_invoices" as any)
        .update(dbUpdates)
        .eq("id", id)
        .then(({ error }: any) => {
          if (error) console.error("Failed to update client invoice:", error);
        });
    }
  },

  deleteInvoice: (id: string) => {
    invoices = invoices.filter((inv) => inv.id !== id);
    notify();

    supabase
      .from("client_invoices" as any)
      .delete()
      .eq("id", id)
      .then(({ error }: any) => {
        if (error) console.error("Failed to delete client invoice:", error);
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

    const links = newFeeIds.map((feeId) => ({ client_invoice_id: invoiceId, fee_id: feeId, env: getEnvironment() }));
    const { error } = await supabase.from("client_invoice_fees" as any).insert(links as any);
    if (error) console.error("Failed to add fees to client invoice:", error);
  },

  removeFeeFromInvoice: async (invoiceId: string, feeId: string) => {
    invoices = invoices.map((i) =>
      i.id === invoiceId ? { ...i, feeIds: i.feeIds.filter((fid) => fid !== feeId) } : i
    );
    notify();

    const { error } = await supabase
      .from("client_invoice_fees" as any)
      .delete()
      .eq("client_invoice_id", invoiceId)
      .eq("fee_id", feeId);
    if (error) console.error("Failed to remove fee from client invoice:", error);
  },

  getInvoiceById: (id: string) => invoices.find((i) => i.id === id),

  getLinkedFeeIds: (): Set<string> => {
    const set = new Set<string>();
    for (const inv of invoices) {
      for (const fid of inv.feeIds) set.add(fid);
    }
    return set;
  },

  getInvoicesByClient: (client: string) =>
    invoices.filter((i) => i.client === client),
};
