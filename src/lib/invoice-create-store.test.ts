import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyInvoiceCreateOutcome, invoiceCreateOutcomeFeedback } from "./invoice-create-outcome";

const fromMock = vi.fn();

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

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

vi.mock("@/lib/environment", () => ({
  getEnvironment: () => "test",
}));

vi.mock("@/lib/realtime-poll", () => ({
  createPollFallback: () => ({ start: () => undefined, stop: () => undefined }),
}));

const { clientInvoiceStore } = await import("@/stores/client-invoice-store");

type LinkMode = "fetch-fail" | "missing-b" | "complete";

function thenableChain(handlers: {
  range?: () => Promise<{ data: unknown; error: unknown }>;
  maybeSingle?: () => Promise<{ data: unknown; error: unknown }>;
  insert?: (rows: unknown) => Promise<{ error: unknown }>;
  awaitResult?: () => Promise<{ data: unknown; error: unknown }>;
}) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.in = () => chain;
  chain.order = () => chain;
  chain.delete = () => chain;
  chain.range = () => (handlers.range ? handlers.range() : Promise.resolve({ data: [], error: null }));
  chain.maybeSingle = () =>
    handlers.maybeSingle ? handlers.maybeSingle() : Promise.resolve({ data: null, error: null });
  chain.insert = (rows: unknown) =>
    handlers.insert ? handlers.insert(rows) : Promise.resolve({ error: null });
  chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
    const pending = handlers.awaitResult
      ? handlers.awaitResult()
      : Promise.resolve({ data: [], error: null });
    return pending.then(resolve, reject);
  };
  return chain;
}

function mockCreateTables(mode: { links: LinkMode }) {
  fromMock.mockImplementation((table: string) =>
    thenableChain({
      range: async () => {
        if (table !== "client_invoice_fees") return { data: [], error: null };
        if (mode.links === "fetch-fail") {
          return { data: null, error: new Error("Failed to fetch") };
        }
        if (mode.links === "missing-b") {
          return { data: [{ id: "link-a", fee_id: "fee-a" }], error: null };
        }
        return {
          data: [
            { id: "link-a", fee_id: "fee-a" },
            { id: "link-b", fee_id: "fee-b" },
          ],
          error: null,
        };
      },
      maybeSingle: async () => {
        const local = clientInvoiceStore.getInvoices()[0];
        if (!local) return { data: null, error: null };
        return {
          data: {
            id: local.id,
            title: local.title,
            client: local.client,
            status: "pending",
            invoice_number: "",
            transfer_date: null,
            note: "",
            created_by: "u1",
            created_at: local.createdAt,
            updated_at: local.updatedAt,
            payments: [],
            edit_logs: [],
          },
          error: null,
        };
      },
      insert: async () => {
        if (table === "client_invoices") return { error: null };
        if (table === "client_invoice_fees") {
          if (mode.links === "complete") return { error: null };
          return { error: { code: "23505", message: "duplicate key" } };
        }
        return { error: null };
      },
      awaitResult: async () => {
        if (table === "client_invoices") return { data: [{ id: "deleted" }], error: null };
        return { data: [], error: null };
      },
    }),
  );
}

async function wipeLocalInvoices() {
  mockCreateTables({ links: "complete" });
  for (const inv of [...clientInvoiceStore.getInvoices()]) {
    await clientInvoiceStore.deleteInvoice(inv.id);
  }
}

describe("createInvoice 呼叫端＋store 故障注入（模擬回應，非隔離庫）", () => {
  beforeEach(async () => {
    fromMock.mockReset();
    await wipeLocalInvoices();
    fromMock.mockReset();
  });

  it("撞重複後讀回失敗：不完成、不導頁、本機仍留同一張", async () => {
    mockCreateTables({ links: "fetch-fail" });
    const beforeIds = clientInvoiceStore.getInvoices().map((row) => row.id);
    const outcome = await clientInvoiceStore.createInvoice("CCJK", ["fee-a", "fee-b"]);
    expect(outcome.complete).toBe(false);
    expect(outcome.uncertain).toBe(true);
    expect(outcome.invoice).toBeNull();
    const applied = applyInvoiceCreateOutcome(outcome, "已建立客戶請款單");
    expect(applied.navigate).toBe(false);
    expect(invoiceCreateOutcomeFeedback(outcome).message).not.toContain("費用關聯未寫入");
    const kept = clientInvoiceStore.getInvoices().filter((row) => !beforeIds.includes(row.id));
    expect(kept).toHaveLength(1);
    expect(kept[0]?.feeIds).toEqual(["fee-a", "fee-b"]);
  });

  it("讀回成功但仍缺 B：只補 B、不宣告完成", async () => {
    mockCreateTables({ links: "missing-b" });
    const outcome = await clientInvoiceStore.createInvoice("CCJK", ["fee-a", "fee-b"]);
    expect(outcome.complete).toBe(false);
    expect(outcome.missing).toEqual(["fee-b"]);
    expect(outcome.invoice?.id).toBeTruthy();
    const applied = applyInvoiceCreateOutcome(outcome, "已建立客戶請款單");
    expect(applied.navigate).toBe(false);
  });

  it("恢復後沿用同一張、關聯齊才完成", async () => {
    mockCreateTables({ links: "fetch-fail" });
    const first = await clientInvoiceStore.createInvoice("CCJK", ["fee-a", "fee-b"]);
    expect(first.complete).toBe(false);
    const firstId = clientInvoiceStore.getInvoices()[0]?.id;
    expect(firstId).toBeTruthy();
    mockCreateTables({ links: "complete" });
    const second = await clientInvoiceStore.createInvoice("CCJK", ["fee-a", "fee-b"]);
    expect(second.invoice?.id).toBe(firstId);
    expect(
      clientInvoiceStore.getInvoices().filter((row) => row.feeIds.includes("fee-a")).map((row) => row.id),
    ).toEqual([firstId]);
  });
});
