import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      getSession: async () => ({ data: { session: { user: { id: "pm-1" } } }, error: null }),
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
  getAuthenticatedUser: async () => ({ id: "pm-1" }),
}));

vi.mock("@/lib/environment", () => ({
  getEnvironment: () => "test",
}));

vi.mock("@/lib/realtime-poll", () => ({
  createPollFallback: () => ({ start: () => undefined, stop: () => undefined }),
}));

const { invoiceStore } = await import("./invoice-store");

function seedKnownInvoice(id: string, known: boolean | undefined) {
  const invoice = {
    id,
    title: "譯者一（測試）_Invoice_202609",
    translator: "譯者一（測試）",
    status: "pending" as const,
    note: "",
    createdBy: "pm-1",
    createdAt: "2026-09-28T05:00:00.000Z",
    updatedAt: "2026-09-28T05:00:00.000Z",
    feeIds: [] as string[],
    payments: [],
    comments: [],
    internalComments: [
      { id: "old", author: "PM（測試）", content: "舊則", timestamp: "2026/09/28 13:00:00" },
    ],
    internalCommentsKnown: known,
  };
  invoiceStore.ensureLocalPresent(invoice);
  return invoice;
}

describe("invoiceStore 內部備註 D 讀取失敗再送", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("讀取未完成時拒絕寫入，舊則仍在、不鎖其他欄位", async () => {
    seedKnownInvoice("inv-d-block", false);
    const result = await invoiceStore.updateInvoice("inv-d-block", {
      internalComments: [
        { id: "old", author: "PM（測試）", content: "舊則", timestamp: "2026/09/28 13:00:00" },
        { id: "new", author: "PM（測試）", content: "不該寫入", timestamp: "2026/09/28 13:01:00" },
      ],
    });
    expect(result.error).toBeTruthy();
    expect(String(result.error)).toContain("讀取未完成");
    expect(fromMock).not.toHaveBeenCalled();
    const local = invoiceStore.getInvoiceById("inv-d-block");
    expect(local?.internalComments?.map((c) => c.id)).toEqual(["old"]);
    expect(local?.internalCommentsKnown).toBe(false);
  });

  it("讀取恢復後可正常送出", async () => {
    seedKnownInvoice("inv-d-ok", true);
    fromMock.mockImplementation((table: string) => {
      if (table === "invoice_internal_comments") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  invoice_id: "inv-d-ok",
                  comments: [
                    { id: "old", author: "PM（測試）", content: "舊則", timestamp: "2026/09/28 13:00:00" },
                  ],
                  updated_at: "t0",
                },
                error: null,
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: { invoice_id: "inv-d-ok" }, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        update: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      };
    });

    const result = await invoiceStore.updateInvoice("inv-d-ok", {
      internalComments: [
        { id: "old", author: "PM（測試）", content: "舊則", timestamp: "2026/09/28 13:00:00" },
        { id: "new", author: "PM（測試）", content: "恢復後新則", timestamp: "2026/09/28 13:02:00" },
      ],
    });
    expect(result.error).toBeNull();
    expect(invoiceStore.getInvoiceById("inv-d-ok")?.internalComments?.map((c) => c.id)).toEqual(["old", "new"]);
  });
});
