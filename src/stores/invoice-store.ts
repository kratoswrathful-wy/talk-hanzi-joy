import type { Invoice, InvoiceStatus, PaymentRecord } from "@/data/invoice-types";
import type { SimplePersistedLog } from "@/lib/edit-log-coalesce";
import { supabase } from "@/integrations/supabase/client";
import { getEnvironment } from "@/lib/environment";
import { createPollFallback } from "@/lib/realtime-poll";
import { getAuthenticatedUser } from "@/lib/auth-ready";
import { invoiceCommentsFromJson, invoiceCommentsToJson } from "@/lib/invoice-comments";
import {
  classifyInvoiceWriteCertainty,
  decideInvoiceLinkCleanup,
  findLocalReusableInvoiceId,
  findReusableInvoiceId,
  interpretInvoiceDeleteResult,
  invoiceLinkFailureMessage,
  isInvoiceLinkAlreadyExists,
} from "@/lib/invoice-link-write";
import type { Json, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { toast } from "sonner";

type Listener = () => void;

let invoices: Invoice[] = [];
let loaded = false;
let loadPromise: Promise<{ error: unknown }> | null = null;
let reloadRequested = false;
let _invoiceAuthUserId: string | null = null;
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
  payments: Json;
  comments?: Json;
  edit_log_started_at?: string | null;
  edit_logs?: Json | null;
}

function editLogsFromJson(raw: Json | null | undefined): SimplePersistedLog[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SimplePersistedLog[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x as Record<string, Json>;
    if (typeof o.id !== "string" || typeof o.changedBy !== "string") continue;
    if (typeof o.description !== "string" || typeof o.timestamp !== "string") continue;
    out.push({
      id: o.id,
      changedBy: o.changedBy,
      description: o.description,
      timestamp: o.timestamp,
      ...(typeof o.fieldKey === "string" ? { fieldKey: o.fieldKey } : {}),
    });
  }
  return out;
}

function paymentsFromJson(raw: Json): PaymentRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: PaymentRecord[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x as Record<string, Json>;
    if (typeof o.id !== "string") continue;
    out.push({
      id: o.id,
      type: o.type === "partial" ? "partial" : "full",
      ...(typeof o.amount === "number" ? { amount: o.amount } : {}),
      timestamp: typeof o.timestamp === "string" ? o.timestamp : "",
    });
  }
  return out;
}

function paymentsToJson(payments: PaymentRecord[]): Json {
  return payments.map((p) => ({
    id: p.id,
    type: p.type,
    ...(p.amount !== undefined ? { amount: p.amount } : {}),
    timestamp: p.timestamp,
  }));
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
    payments: paymentsFromJson(row.payments),
    editLogStartedAt: row.edit_log_started_at || undefined,
    edit_logs: editLogsFromJson(row.edit_logs),
    comments: invoiceCommentsFromJson(row.comments),
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
}, 15000);

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

  /** Initial consumers share the current request without scheduling a trailing refresh. */
  ensureLoaded: async () => {
    if (loaded) return { error: null };
    if (loadPromise) return loadPromise;
    return invoiceStore.loadInvoices();
  },

  loadInvoices: async () => {
    if (loadPromise) {
      reloadRequested = true;
      return loadPromise;
    }

    loadPromise = (async () => {
      let lastResult: { error: unknown } = { error: null };
      try {
        do {
          reloadRequested = false;
          const user = await getAuthenticatedUser();
          if (!user) {
            invoices = [];
            loaded = false;
            notify();
            lastResult = { error: null };
            continue;
          }

          const env = getEnvironment();

          const { data: invData, error } = await supabase
            .from("invoices")
            .select("*")
            .eq("env", env)
            .order("created_at", { ascending: false });

          if (error || !invData) {
            lastResult = { error };
            continue;
          }

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

          invoices = (invData as DbInvoice[]).map((row) =>
            dbToApp(row, feeMap.get(row.id) || [])
          );
          loaded = true;
          notify();
          lastResult = { error: null };
        } while (reloadRequested);
      } finally {
        loadPromise = null;
      }
      return lastResult;
    })();

    return loadPromise;
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

    if (feeIds.length > 0) {
      const existing = await supabase
        .from("invoice_fees")
        .select("invoice_id, fee_id")
        .in("fee_id", feeIds)
        .eq("env", env);
      if (!existing.error && existing.data) {
        const reuseId = findReusableInvoiceId(
          existing.data.map((row) => ({ invoiceId: row.invoice_id, feeId: row.fee_id })),
          feeIds,
        );
        if (reuseId) {
          invoices = invoices.filter((item) => item.id !== id);
          notify();
          return invoices.find((item) => item.id === reuseId) ?? (await invoiceStore.fetchInvoiceById(reuseId));
        }
      }
      const localReuseId = findLocalReusableInvoiceId(invoices, feeIds, id);
      if (localReuseId) {
        invoices = invoices.filter((item) => item.id !== id);
        notify();
        const retryLinks = feeIds.map((feeId) => ({ invoice_id: localReuseId, fee_id: feeId, env }));
        const { error: retryErr } = await supabase.from("invoice_fees").insert(retryLinks);
        if (retryErr && !isInvoiceLinkAlreadyExists(retryErr)) {
          toast.error(invoiceLinkFailureMessage(decideInvoiceLinkCleanup(retryErr)));
          return null;
        }
        return invoices.find((item) => item.id === localReuseId) ?? (await invoiceStore.fetchInvoiceById(localReuseId));
      }
    }

    const { error } = await supabase.from("invoices").insert({
      id,
      title,
      translator,
      status: "pending",
      note: "",
      created_by: uid,
      env,
      ...(started ? { edit_log_started_at: started } : {}),
    } as TablesInsert<"invoices">);

    if (error) {
      console.error("Failed to create invoice:", error);
      if (classifyInvoiceWriteCertainty(error) === "unknown") {
        toast.error("新建請款單結果不明。請重整後核對，請勿再按一次新建。");
        return null;
      }
      invoices = invoices.filter((i) => i.id !== id);
      notify();
      return null;
    }

    if (feeIds.length > 0) {
      const links = feeIds.map((feeId) => ({ invoice_id: id, fee_id: feeId, env }));
      const { error: linkErr } = await supabase.from("invoice_fees").insert(links);
      if (linkErr && isInvoiceLinkAlreadyExists(linkErr)) {
        return newInvoice;
      }
      if (linkErr) {
        console.error("Failed to link fees:", linkErr);
        const decision = decideInvoiceLinkCleanup(linkErr);
        if (decision.action === "keep") {
          toast.error(invoiceLinkFailureMessage(decision));
          return null;
        }
        const { data: deleted, error: delErr } = await supabase.from("invoices").delete().eq("id", id).select("id");
        const deleteCheck = interpretInvoiceDeleteResult(delErr, deleted);
        toast.error(invoiceLinkFailureMessage(decision, deleteCheck));
        if (deleteCheck.kind === "deleted") {
          invoices = invoices.filter((i) => i.id !== id);
          notify();
        }
        return null;
      }
    }

    // 並行 loadInvoices 可能在 insert 期間覆寫記憶體；寫入成功後再確保本機列存在
    if (!invoices.some((i) => i.id === id)) {
      invoices = [newInvoice, ...invoices];
      notify();
    }

    return newInvoice;
  },

  updateInvoice: async (
    id: string,
    updates: Partial<Pick<Invoice, "status" | "transferDate" | "note" | "title" | "payments" | "editLogStartedAt" | "comments">> & Record<string, unknown>,
  ): Promise<{ error: unknown }> => {
    const existing = invoices.find((inv) => inv.id === id);
    if (!existing) {
      console.warn("[invoice-store] updateInvoice: 本地找不到 id=", id);
      return { error: new Error("找不到該筆請款") };
    }
    const previous = existing;
    invoices = invoices.map((inv) => (inv.id === id ? { ...inv, ...updates } : inv));
    notify();

    const dbUpdates: Record<string, Json> = {};
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.transferDate !== undefined) dbUpdates.transfer_date = updates.transferDate || null;
    if (updates.note !== undefined) dbUpdates.note = updates.note;
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.payments !== undefined) dbUpdates.payments = paymentsToJson(updates.payments);
    if (updates.comments !== undefined) dbUpdates.comments = invoiceCommentsToJson(updates.comments);
    if (updates.edit_logs !== undefined) dbUpdates.edit_logs = updates.edit_logs as Json;
    if (updates.editLogStartedAt !== undefined) dbUpdates.edit_log_started_at = updates.editLogStartedAt || null;

    if (Object.keys(dbUpdates).length === 0) return { error: null };

    const { data, error } = await supabase
      .from("invoices")
      .update(dbUpdates as TablesUpdate<"invoices">)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      console.error("Failed to update invoice:", error);
      invoices = invoices.map((inv) => (inv.id === id ? previous : inv));
      notify();
      return { error };
    }
    if (!data) {
      const blockedErr = new Error("更新未套用（可能被權限規則擋下或找不到該筆請款）");
      console.error("Failed to update invoice:", blockedErr.message);
      invoices = invoices.map((inv) => (inv.id === id ? previous : inv));
      notify();
      return { error: blockedErr };
    }

    invoices = invoices.map((inv) =>
      inv.id === id
        ? {
            ...dbToApp(data, previous.feeIds),
            ...Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined)),
          }
        : inv,
    );
    notify();
    return { error: null };
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

  addFeesToInvoice: async (invoiceId: string, feeIds: string[]): Promise<{ error: unknown }> => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { error: new Error("找不到該筆稿費請款") };

    const newFeeIds = feeIds.filter((fid) => !inv.feeIds.includes(fid));
    if (newFeeIds.length === 0) return { error: null };

    invoices = invoices.map((i) =>
      i.id === invoiceId ? { ...i, feeIds: [...i.feeIds, ...newFeeIds] } : i
    );
    notify();

    const links = newFeeIds.map((feeId) => ({ invoice_id: invoiceId, fee_id: feeId, env: getEnvironment() }));
    const { error } = await supabase.from("invoice_fees").insert(links);
    if (error) {
      console.error("Failed to add fees to invoice:", error);
      if (classifyInvoiceWriteCertainty(error) === "unknown") {
        toast.error("收錄結果不明。請重整後核對，請勿再按一次。");
        return { error };
      }
      invoices = invoices.map((i) =>
        i.id === invoiceId ? { ...i, feeIds: i.feeIds.filter((fid) => !newFeeIds.includes(fid)) } : i
      );
      notify();
    }
    return { error };
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

  /** 寫入後防並行 load 覆寫：若本地已無此列則重新放入。 */
  ensureLocalPresent: (invoice: Invoice) => {
    if (invoices.some((i) => i.id === invoice.id)) return;
    invoices = [invoice, ...invoices];
    notify();
  },

  /** 單筆補抓：list load 競態時供 agent.get／create 回讀使用。 */
  fetchInvoiceById: async (id: string): Promise<Invoice | null> => {
    const env = getEnvironment();
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .eq("env", env)
      .maybeSingle();
    if (error || !data) return null;
    const { data: linkData } = await supabase
      .from("invoice_fees")
      .select("fee_id")
      .eq("invoice_id", id)
      .eq("env", env);
    const feeIds = (linkData ?? []).map((l) => l.fee_id);
    const mapped = dbToApp(data as DbInvoice, feeIds);
    if (invoices.some((i) => i.id === id)) {
      invoices = invoices.map((i) => (i.id === id ? mapped : i));
    } else {
      invoices = [mapped, ...invoices];
    }
    notify();
    return mapped;
  },

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
  const nextUserId = session?.user?.id ?? null;

  if (event === "TOKEN_REFRESHED") {
    return;
  }

  if (!session || event === "SIGNED_OUT") {
    invoices = [];
    loaded = false;
    loadPromise = null;
    reloadRequested = false;
    _invoiceAuthUserId = null;
    notify();
    return;
  }

  if (
    (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
    loaded &&
    _invoiceAuthUserId &&
    nextUserId &&
    _invoiceAuthUserId === nextUserId
  ) {
    return;
  }

  if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
    loaded = false;
    _invoiceAuthUserId = nextUserId;
    notify();
    void invoiceStore.ensureLoaded();
  }
});
