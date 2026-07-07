import type { ClientInvoice, ClientInvoiceAdjustmentLine, ClientInvoiceStatus, ClientPaymentRecord } from "@/data/client-invoice-types";
import { supabase } from "@/integrations/supabase/client";
import { getEnvironment } from "@/lib/environment";
import { createPollFallback } from "@/lib/realtime-poll";
import { getAuthenticatedUser } from "@/lib/auth-ready";
import type { Database, Json } from "@/integrations/supabase/types";

type Listener = () => void;

let invoices: ClientInvoice[] = [];
let loaded = false;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

type DbClientInvoice = Database["public"]["Tables"]["client_invoices"]["Row"];
type DbClientInvoiceUpdate = Database["public"]["Tables"]["client_invoices"]["Update"];
type DbClientInvoiceFeeLink = Database["public"]["Tables"]["client_invoice_fees"]["Row"];

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function dbToApp(row: DbClientInvoice, feeIds: string[]): ClientInvoice {
  return {
    id: row.id,
    title: row.title || "",
    invoiceNumber: row.invoice_number || "",
    client: row.client,
    status: row.status as ClientInvoiceStatus,
    transferDate: row.transfer_date || undefined,
    note: row.note,
    createdBy: row.created_by || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    feeIds,
    payments: paymentsFromJson(row.payments),
    isRecordOnly: row.is_record_only || false,
    recordAmount: row.record_amount || 0,
    recordCurrency: row.record_currency || undefined,
    billingChannel: row.billing_channel || undefined,
    expectedCollectionDate: row.expected_collection_date || undefined,
    adjustmentLines: parseAdjustmentLines(row.adjustment_lines),
    editLogStartedAt: row.edit_log_started_at || undefined,
  };
}

function paymentsFromJson(raw: Json | null | undefined): ClientPaymentRecord[] {
  if (!raw || !Array.isArray(raw)) return [];
  const out: ClientPaymentRecord[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const id = typeof x.id === "string" ? x.id : crypto.randomUUID();
    const type: ClientPaymentRecord["type"] = x.type === "partial" ? "partial" : "full";
    const amount = typeof x.amount === "number" ? x.amount : undefined;
    const noFee = typeof x.noFee === "boolean" ? x.noFee : undefined;
    const timestamp = typeof x.timestamp === "string" ? x.timestamp : "";
    out.push({
      id,
      type,
      ...(amount !== undefined ? { amount } : {}),
      ...(noFee !== undefined ? { noFee } : {}),
      timestamp,
    });
  }
  return out;
}

function parseAdjustmentLines(raw: Json | null | undefined): ClientInvoiceAdjustmentLine[] | undefined {
  if (!raw || !Array.isArray(raw)) return undefined;
  const out: ClientInvoiceAdjustmentLine[] = [];
  for (const x of raw) {
    if (
      x &&
      typeof x === "object" &&
      !Array.isArray(x) &&
      typeof x.id === "string" &&
      (x.operation === "add" || x.operation === "subtract") &&
      typeof x.amount === "number" &&
      typeof x.currency === "string"
    ) {
      out.push({ id: x.id, operation: x.operation, amount: x.amount, currency: x.currency });
    }
  }
  return out.length ? out : undefined;
}

function paymentsToJson(payments: ClientPaymentRecord[]): Json {
  return payments.map((p) => ({
    id: p.id,
    type: p.type,
    ...(p.amount !== undefined ? { amount: p.amount } : {}),
    ...(p.noFee !== undefined ? { noFee: p.noFee } : {}),
    timestamp: p.timestamp,
  }));
}

function adjustmentLinesToJson(lines: ClientInvoiceAdjustmentLine[]): Json {
  return lines.map((l) => ({ id: l.id, operation: l.operation, amount: l.amount, currency: l.currency }));
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
// Auth listener registered after clientInvoiceStore export (see bottom of file)

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
}, 15000);

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
    const user = await getAuthenticatedUser();
    if (!user) {
      invoices = [];
      loaded = false;
      notify();
      return { error: null };
    }

    const env = getEnvironment();

    const { data: invData, error } = await supabase
      .from("client_invoices")
      .select("*")
      .eq("env", env)
      .order("created_at", { ascending: false });

    if (error || !invData) return { error };

    const { data: linkData } = await supabase
      .from("client_invoice_fees")
      .select("client_invoice_id, fee_id")
      .eq("env", env);

    const feeMap = new Map<string, string[]>();
    if (linkData) {
      for (const link of linkData as Pick<DbClientInvoiceFeeLink, "client_invoice_id" | "fee_id">[]) {
        const arr = feeMap.get(link.client_invoice_id) || [];
        arr.push(link.fee_id);
        feeMap.set(link.client_invoice_id, arr);
      }
    }

    invoices = invData.map((row) =>
      dbToApp(row, feeMap.get(row.id) || [])
    );
    loaded = true;
    notify();
    return { error: null };
  },

  createInvoice: async (
    client: string,
    feeIds: string[],
    opts?: { editLogFromCreation?: boolean }
  ): Promise<ClientInvoice | null> => {
    const uid = await getUserId();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const title = generateDefaultTitle(client);
    const env = getEnvironment();

    const started = opts?.editLogFromCreation ? now : undefined;
    const newInvoice: ClientInvoice = {
      id,
      title,
      invoiceNumber: "",
      client,
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

    const { error } = await supabase.from("client_invoices").insert({
      id,
      title,
      client,
      status: "pending",
      note: "",
      created_by: uid,
      env,
      ...(started ? { edit_log_started_at: started } : {}),
    });

    if (error) {
      console.error("Failed to create client invoice:", errorMessage(error));
      invoices = invoices.filter((i) => i.id !== id);
      notify();
      return null;
    }

    if (feeIds.length > 0) {
      const links = feeIds.map((feeId) => ({ client_invoice_id: id, fee_id: feeId, env }));
      const { error: linkErr } = await supabase.from("client_invoice_fees").insert(links);
      if (linkErr) console.error("Failed to link fees:", errorMessage(linkErr));
    }

    return newInvoice;
  },

  /**
   * 【W10 clientInvoice bridge 退回修正】此方法先前為 fire-and-forget
   * （`.then()` 未被上層 await），bridge 端緊接著呼叫 `loadInvoices()`
   * 做網路 SELECT 驗證回讀時，UPDATE 尚未送達伺服器就已比對，導致
   * 「回讀不一致」永遠誤判為失敗（即使資料庫其實已寫入成功）。
   * 現在改為 async 並 await 實際的 UPDATE（帶 `.select()` 拿回權威列與
   * `updated_at`），呼叫端可安心 await 後直接信任回傳的 error 欄位，
   * 不須再另外做一次網路 reload 才能驗證。
   */
  updateInvoice: async (
    id: string,
    updates: Partial<
      Pick<
        ClientInvoice,
        | "status"
        | "transferDate"
        | "note"
        | "title"
        | "invoiceNumber"
        | "payments"
        | "isRecordOnly"
        | "recordAmount"
        | "recordCurrency"
        | "billingChannel"
        | "expectedCollectionDate"
        | "adjustmentLines"
        | "editLogStartedAt"
      >
    > & {
      /** 持久化用欄位，不屬於 app 層 ClientInvoice 型別 */
      comments?: Json;
      edit_logs?: Json;
    }
  ): Promise<{ error: unknown }> => {
    invoices = invoices.map((inv) => (inv.id === id ? { ...inv, ...updates } : inv));
    notify();

    const dbUpdates: DbClientInvoiceUpdate = {};
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.transferDate !== undefined) dbUpdates.transfer_date = updates.transferDate || null;
    if (updates.note !== undefined) dbUpdates.note = updates.note;
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.invoiceNumber !== undefined) dbUpdates.invoice_number = updates.invoiceNumber;
    if (updates.payments !== undefined) dbUpdates.payments = paymentsToJson(updates.payments);
    if (updates.comments !== undefined) dbUpdates.comments = updates.comments;
    if (updates.edit_logs !== undefined) dbUpdates.edit_logs = updates.edit_logs;
    if (updates.isRecordOnly !== undefined) dbUpdates.is_record_only = updates.isRecordOnly;
    if (updates.recordAmount !== undefined) dbUpdates.record_amount = updates.recordAmount;
    if (updates.recordCurrency !== undefined) dbUpdates.record_currency = updates.recordCurrency;
    if (updates.billingChannel !== undefined) dbUpdates.billing_channel = updates.billingChannel;
    if (updates.expectedCollectionDate !== undefined) dbUpdates.expected_collection_date = updates.expectedCollectionDate || null;
    if (updates.adjustmentLines !== undefined) dbUpdates.adjustment_lines = adjustmentLinesToJson(updates.adjustmentLines ?? []);
    if (updates.editLogStartedAt !== undefined) dbUpdates.edit_log_started_at = updates.editLogStartedAt || null;

    if (Object.keys(dbUpdates).length === 0) return { error: null };

    const { data, error } = await supabase
      .from("client_invoices")
      .update(dbUpdates)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      console.error("Failed to update client invoice:", errorMessage(error));
      return { error };
    }
    if (!data) {
      // RLS 靜默擋下（0 筆受影響）：無 error 但也無資料列，須視為失敗，
      // 否則呼叫端會誤信「無 error＝成功」。
      const blockedErr = new Error("更新未套用（可能被權限規則擋下或找不到該筆請款）");
      console.error("Failed to update client invoice:", blockedErr.message);
      return { error: blockedErr };
    }

    const existing = invoices.find((inv) => inv.id === id);
    const feeIds = existing?.feeIds ?? [];
    invoices = invoices.map((inv) => (inv.id === id ? dbToApp(data, feeIds) : inv));
    notify();

    return { error: null };
  },

  deleteInvoice: async (id: string): Promise<{ error: unknown }> => {
    invoices = invoices.filter((inv) => inv.id !== id);
    notify();

    const { data, error } = await supabase.from("client_invoices").delete().eq("id", id).select();
    if (error) {
      console.error("Failed to delete client invoice:", errorMessage(error));
      return { error };
    }
    if (!data || data.length === 0) {
      const blockedErr = new Error("刪除未套用（可能被權限規則擋下或該筆已不存在）");
      console.error("Failed to delete client invoice:", blockedErr.message);
      return { error: blockedErr };
    }
    return { error: null };
  },

  addFeesToInvoice: async (invoiceId: string, feeIds: string[]): Promise<{ error: unknown }> => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { error: new Error("找不到該筆客戶請款") };

    const newFeeIds = feeIds.filter((fid) => !inv.feeIds.includes(fid));
    if (newFeeIds.length === 0) return { error: null };

    invoices = invoices.map((i) =>
      i.id === invoiceId ? { ...i, feeIds: [...i.feeIds, ...newFeeIds] } : i
    );
    notify();

    const links = newFeeIds.map((feeId) => ({ client_invoice_id: invoiceId, fee_id: feeId, env: getEnvironment() }));
    const { error } = await supabase.from("client_invoice_fees").insert(links);
    if (error) {
      console.error("Failed to add fees to client invoice:", errorMessage(error));
      // 寫入失敗須撤銷樂觀本地狀態，避免本地與資料庫不同步
      invoices = invoices.map((i) =>
        i.id === invoiceId ? { ...i, feeIds: i.feeIds.filter((fid) => !newFeeIds.includes(fid)) } : i
      );
      notify();
    }
    return { error };
  },

  removeFeeFromInvoice: async (invoiceId: string, feeId: string): Promise<{ error: unknown }> => {
    const inv = invoices.find((i) => i.id === invoiceId);
    invoices = invoices.map((i) =>
      i.id === invoiceId ? { ...i, feeIds: i.feeIds.filter((fid) => fid !== feeId) } : i
    );
    notify();

    const { error } = await supabase
      .from("client_invoice_fees")
      .delete()
      .eq("client_invoice_id", invoiceId)
      .eq("fee_id", feeId);
    if (error) {
      console.error("Failed to remove fee from client invoice:", errorMessage(error));
      if (inv) {
        invoices = invoices.map((i) => (i.id === invoiceId ? { ...i, feeIds: inv.feeIds } : i));
        notify();
      }
    }
    return { error };
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

supabase.auth.onAuthStateChange((event, session) => {
  _cachedUserId = session?.user?.id ?? null;
  if (event === "TOKEN_REFRESHED") {
    void clientInvoiceStore.loadInvoices();
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
