import { useEffect, useRef, useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wrapLatestSetter } from "./commit-latest-state";
import { appendInvoiceEditLog, collectBufferedInvoiceFlushes, invoiceUpdatesWithOptionalLogs } from "./invoice-detail-commits";
import type { BurstMap, SimplePersistedLog } from "./edit-log-coalesce";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function InvoiceFieldEditor({
  persist,
  persistedTitle,
  persistedNote,
  started,
}: {
  persist: (updates: Record<string, unknown>) => void;
  persistedTitle: string;
  persistedNote: string;
  started: boolean;
}) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const titleRef = useRef(title);
  const noteRef = useRef(note);
  titleRef.current = title;
  noteRef.current = note;
  const logLatest = useRef<SimplePersistedLog[]>([]);
  const [logs, setLogsState] = useState<SimplePersistedLog[]>([]);
  const setLogs = wrapLatestSetter(logLatest, setLogsState);
  const burstMap = useRef<BurstMap>({});

  const commit = (field: "title" | "note", local: string, persisted: string) => {
    const nextLogs = appendInvoiceEditLog({
      latest: logLatest,
      setLogs,
      burstMap,
      started,
      field,
      fieldLabel: field,
      oldValue: persisted,
      newValue: local,
      author: "PM（測試）",
      formatTimestamp: () => "2026/09/25 20:30",
    });
    persist(invoiceUpdatesWithOptionalLogs({ [field]: local }, nextLogs));
  };

  useEffect(() => {
    return () => {
      const pending = collectBufferedInvoiceFlushes({
        title: { local: titleRef.current, persisted: persistedTitle },
        note: { local: noteRef.current, persisted: persistedNote },
      });
      for (const item of pending) {
        commit(item.field, item.local, item.persisted);
      }
    };
    // 只在卸載時送出未離開欄位的緩衝值，不跟每次打字重掛。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <input data-testid="title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => commit("title", title, persistedTitle)} />
      <textarea data-testid="note" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => commit("note", note, persistedNote)} />
      <button type="button" data-testid="type-title" onClick={() => setTitle("[AI驗收] 稿費請款 260925-02")}>打標題</button>
      <button type="button" data-testid="leave-title" onClick={() => commit("title", title, persistedTitle)}>離開標題</button>
      <button type="button" data-testid="type-note" onClick={() => setNote("AIQA-備註-260925-02")}>打備註</button>
      <span data-testid="log-count">{logs.length}</span>
    </div>
  );
}

describe("兩種請款修改紀錄真元件接線", () => {
  const containers: HTMLElement[] = [];
  const roots: Root[] = [];

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
          created_at: "2026-09-25T12:00:00.000Z",
          updated_at: "2026-09-25T12:00:00.000Z",
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

  afterEach(() => {
    act(() => {
      for (const root of roots) root.unmount();
    });
    roots.length = 0;
    for (const node of containers) node.remove();
    containers.length = 0;
  });

  it("稿費請款：離開欄位一次送完整標題與一筆紀錄，不逐字寫入", () => {
    const invoice = {
      id: crypto.randomUUID(),
      title: "譯者一（測試）_Invoice_202609",
      translator: "譯者一（測試）",
      status: "pending" as const,
      note: "",
      createdBy: "u1",
      createdAt: "2026-09-25T12:00:00.000Z",
      updatedAt: "2026-09-25T12:00:00.000Z",
      feeIds: [] as string[],
      payments: [],
      editLogStartedAt: "2026-09-25T12:00:00.000Z",
    };
    invoiceStore.ensureLocalPresent(invoice);
    const persistCalls: Array<Record<string, unknown>> = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    containers.push(container);
    let root: Root;
    act(() => {
      root = createRoot(container);
      root.render(
        <InvoiceFieldEditor
          persist={(updates) => {
            persistCalls.push(updates);
            void invoiceStore.updateInvoice(invoice.id, updates);
          }}
          persistedTitle={invoice.title}
          persistedNote=""
          started
        />,
      );
    });
    roots.push(root!);

    act(() => {
      container.querySelector("[data-testid='type-title']")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(persistCalls).toEqual([]);
    act(() => {
      container.querySelector("[data-testid='leave-title']")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(persistCalls).toHaveLength(1);
    expect(persistCalls[0]?.title).toBe("[AI驗收] 稿費請款 260925-02");
    expect(Array.isArray(persistCalls[0]?.edit_logs)).toBe(true);
    expect((persistCalls[0]?.edit_logs as unknown[]).length).toBe(1);
    expect(container.querySelector("[data-testid='log-count']")!.textContent).toBe("1");
  });

  it("客戶請款：打完直接卸載（模擬點側欄）仍送出 note 與紀錄", async () => {
    const invoice = await clientInvoiceStore.createInvoice("CCJK", [], { editLogFromCreation: true });
    if (!invoice) throw new Error("seed failed");
    const persistCalls: Array<Record<string, unknown>> = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    containers.push(container);
    let root: Root;
    act(() => {
      root = createRoot(container);
      root.render(
        <InvoiceFieldEditor
          persist={(updates) => {
            persistCalls.push(updates);
            void clientInvoiceStore.updateInvoice(invoice.id, updates);
          }}
          persistedTitle={invoice.title}
          persistedNote=""
          started
        />,
      );
    });
    roots.push(root!);

    act(() => {
      container.querySelector("[data-testid='type-note']")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(persistCalls).toEqual([]);

    act(() => {
      root!.unmount();
    });
    roots.length = 0;
    expect(persistCalls.some((row) => row.note === "AIQA-備註-260925-02")).toBe(true);
    const noteCall = persistCalls.find((row) => row.note === "AIQA-備註-260925-02");
    expect(Array.isArray(noteCall?.edit_logs)).toBe(true);
  });
});
