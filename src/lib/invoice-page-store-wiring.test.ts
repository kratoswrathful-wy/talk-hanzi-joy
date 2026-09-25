import { describe, expect, it, vi, beforeEach } from "vitest";
import { computeThenSet } from "./commit-latest-state";
import { applyEditLogFieldChange } from "./edit-log-coalesce";

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

const { invoiceStore } = await import("@/stores/invoice-store");
const { clientInvoiceStore } = await import("@/stores/client-invoice-store");

function seedTranslatorInvoice() {
  const now = "2026-09-24T10:00:00.000Z";
  const invoice = {
    id: crypto.randomUUID(),
    title: "譯者一（測試）_Invoice_202609",
    translator: "譯者一（測試）",
    status: "pending" as const,
    note: "",
    createdBy: "u1",
    createdAt: now,
    updatedAt: now,
    feeIds: [] as string[],
    payments: [],
    editLogStartedAt: now,
  };
  invoiceStore.ensureLocalPresent(invoice);
  return invoice;
}

async function seedClientInvoice() {
  const invoice = await clientInvoiceStore.createInvoice("CCJK", [], { editLogFromCreation: true });
  if (!invoice) throw new Error("client invoice seed failed");
  return invoice;
}

function pageTrackInvoiceChange(
  store: { updateInvoice: (id: string, updates: Record<string, unknown>) => Promise<{ error: unknown }> },
  invoiceId: string,
  setEditLog: (updater: (prev: ReturnType<typeof applyEditLogFieldChange>["nextLogs"]) => ReturnType<typeof applyEditLogFieldChange>["nextLogs"]) => void,
  burstBox: { current: Parameters<typeof applyEditLogFieldChange>[0]["burstMap"] },
  field: string,
  oldValue: string,
  newValue: string,
) {
  const nextLogs = computeThenSet(setEditLog, (prev) => {
    const { nextLogs: logs, nextBurstMap } = applyEditLogFieldChange({
      fieldKey: field,
      oldValue,
      newValue,
      now: Date.now(),
      author: "PM（測試）",
      formatTimestamp: () => "2026/09/24 18:08",
      fieldLabel: field,
      existingLogs: prev,
      burstMap: burstBox.current,
    });
    burstBox.current = nextBurstMap;
    return logs;
  });
  return store.updateInvoice(invoiceId, { edit_logs: nextLogs });
}

describe("兩種請款明細頁＋真 store 修改紀錄", () => {
  beforeEach(() => {
    fromMock.mockReset();
    getAuthenticatedUserMock.mockReset();
    getAuthenticatedUserMock.mockResolvedValue({ id: "u1" });
    fromMock.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.eq = () => chain;
      chain.select = () => chain;
      chain.maybeSingle = async () => ({
        data: {
          id: "keep",
          title: "keep",
          translator: "譯者一（測試）",
          client: "CCJK",
          status: "pending",
          transfer_date: null,
          note: "",
          created_by: "u1",
          created_at: "2026-09-24T10:00:00.000Z",
          updated_at: "2026-09-24T10:00:00.000Z",
          payments: [],
          edit_logs: [],
        },
        error: null,
      });
      chain.update = () => chain;
      chain.insert = async () => ({ data: null, error: null });
      chain.in = () => chain;
      return chain;
    });
  });

  it("稿費請款：紀錄開啟後連改兩欄，後值都在、不重入 updater", async () => {
    const invoice = seedTranslatorInvoice();
    const logsBox = { value: [] as ReturnType<typeof applyEditLogFieldChange>["nextLogs"] };
    const setEditLog = (updater: (prev: typeof logsBox.value) => typeof logsBox.value) => {
      logsBox.value = updater(logsBox.value);
    };
    const burstBox = { current: {} as Parameters<typeof applyEditLogFieldChange>[0]["burstMap"] };
    await pageTrackInvoiceChange(invoiceStore, invoice.id, setEditLog, burstBox, "名稱", invoice.title, "名稱後值");
    await pageTrackInvoiceChange(invoiceStore, invoice.id, setEditLog, burstBox, "備註", "", "備註後值");
    expect(logsBox.value.map((row) => row.fieldKey)).toEqual(["名稱", "備註"]);
    expect(logsBox.value).toHaveLength(2);
  });

  it("客戶請款：紀錄開啟後連改兩欄，後值都在、不重入 updater", async () => {
    const invoice = await seedClientInvoice();
    const logsBox = { value: [] as ReturnType<typeof applyEditLogFieldChange>["nextLogs"] };
    const setEditLog = (updater: (prev: typeof logsBox.value) => typeof logsBox.value) => {
      logsBox.value = updater(logsBox.value);
    };
    const burstBox = { current: {} as Parameters<typeof applyEditLogFieldChange>[0]["burstMap"] };
    await pageTrackInvoiceChange(clientInvoiceStore, invoice.id, setEditLog, burstBox, "名稱", invoice.title, "客戶名稱後值");
    await pageTrackInvoiceChange(clientInvoiceStore, invoice.id, setEditLog, burstBox, "備註", "", "客戶備註後值");
    expect(logsBox.value.map((row) => row.fieldKey)).toEqual(["名稱", "備註"]);
    expect(logsBox.value).toHaveLength(2);
  });

});
