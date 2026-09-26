import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database, Json } from "@/integrations/supabase/types";

const fromMock = vi.fn();
const getAuthenticatedUserMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      getSession: async () => ({ data: { session: { user: { id: "u1" } } }, error: null }),
    },
    channel: () => ({
      on: function on() {
        return this;
      },
      subscribe: () => ({}),
    }),
  },
}));

vi.mock("@/lib/auth-ready", () => ({
  getAuthenticatedUser: () => getAuthenticatedUserMock(),
}));

vi.mock("@/lib/environment", () => ({
  getEnvironment: () => "test",
}));

vi.mock("@/lib/realtime-poll", () => ({
  createPollFallback: () => ({ start: () => undefined, stop: () => undefined }),
}));

const { clientInvoiceFromDb, clientInvoiceStore } = await import("./client-invoice-store");

type DbClientInvoice = Database["public"]["Tables"]["client_invoices"]["Row"];

const persistedLog = {
  id: "log-1790422704410-a90dh5tq",
  fieldKey: "note",
  changedBy: "PM（測試）",
  timestamp: "2026/09/26 19:38 (UTC+8)",
  description: "客戶請款備註 AIQA-備註-260926-01 → AIQA-備註-260926-02",
};

function dbRow(editLogs: Json): DbClientInvoice {
  return {
    adjustment_lines: [],
    billing_channel: "",
    client: "CCJK",
    comments: [],
    created_at: "2026-09-26T11:28:00+00",
    created_by: "u1",
    edit_log_started_at: "2026-09-26T11:36:41+00",
    edit_logs: editLogs,
    env: "test",
    expected_collection_date: null,
    id: "3e942a76-b20a-4f04-94db-1855fe477207",
    invoice_number: "",
    is_record_only: false,
    note: "AIQA-備註-260926-02",
    payments: [],
    record_amount: 0,
    record_currency: null,
    status: "pending",
    title: "[AI驗收] 客戶請款 260926-01",
    transfer_date: null,
    updated_at: "2026-09-26T11:38:24+00",
  };
}

describe("客戶請款 dbToApp／store 讀回 edit_logs", () => {
  beforeEach(() => {
    getAuthenticatedUserMock.mockResolvedValue({ id: "u1" });
    fromMock.mockReset();
  });

  it("產品映射帶出同一筆完整紀錄，不是手寫替身", () => {
    const mapped = clientInvoiceFromDb(dbRow([persistedLog]), ["fee-1"]);
    expect(mapped.edit_logs).toEqual([persistedLog]);
    expect(mapped.note).toBe("AIQA-備註-260926-02");
    expect(mapped.feeIds).toEqual(["fee-1"]);
  });

  it("空陣列與缺欄相容", () => {
    expect(clientInvoiceFromDb(dbRow([]), []).edit_logs).toEqual([]);
    expect(clientInvoiceFromDb(dbRow({ not: "array" }), []).edit_logs).toBeUndefined();
  });

  it("fetchInvoiceById 重載後畫面用的 store 列仍有同一筆", async () => {
    const row = dbRow([persistedLog]);
    fromMock.mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: table === "client_invoices" ? row : null, error: null });
      chain.then = (resolve: (value: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({
          data: table === "client_invoice_fees" ? [{ fee_id: "fee-1" }] : null,
          error: null,
        }).then(resolve);
      return chain;
    });

    const fetched = await clientInvoiceStore.fetchInvoiceById(row.id);
    expect(fetched?.edit_logs).toEqual([persistedLog]);
    expect(clientInvoiceStore.getInvoiceById(row.id)?.edit_logs).toEqual([persistedLog]);
  });
});
