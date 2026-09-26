import { useRef, useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeThenSet, wrapLatestSetter } from "./commit-latest-state";
import { applyEditLogFieldChange, type BurstMap, type SimplePersistedLog } from "./edit-log-coalesce";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fromMock = vi.fn();
const rpcMock = vi.fn();
const getAuthenticatedUserMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
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
  getAuthSnapshot: () => ({ user: { id: "u1" } }),
}));

vi.mock("@/lib/environment", () => ({
  getEnvironment: () => "test",
}));

vi.mock("@/lib/realtime-poll", () => ({
  createPollFallback: () => ({ start: () => undefined, stop: () => undefined }),
  createFeesVisiblePollFallback: () => ({ start: () => undefined, stop: () => undefined }),
}));

const { feeStore } = await import("@/stores/fee-store");

type TaskItem = { id: string; unitPrice: number; unitCount: number };

function FeeTaskEditor({
  feeId,
  persistCalls,
  errors,
}: {
  feeId: string;
  persistCalls: Array<Record<string, unknown>>;
  errors: Error[];
}) {
  const taskLatest = useRef<TaskItem[]>([{ id: "item-a", unitPrice: 0, unitCount: 0 }]);
  const [taskItems, setTaskItemsState] = useState(taskLatest.current);
  const setTaskItems = wrapLatestSetter(taskLatest, setTaskItemsState);
  const logLatest = useRef<SimplePersistedLog[]>([]);
  const [editLog, setEditLogState] = useState(logLatest.current);
  const burstMap = useRef<BurstMap>({});

  const commitField = (field: "unitPrice" | "unitCount", value: number) => {
    try {
      const nextLogs = computeThenSet(logLatest, setEditLogState, (prev) => {
        const { nextLogs: logs, nextBurstMap } = applyEditLogFieldChange({
          fieldKey: field,
          oldValue: taskLatest.current[0][field],
          newValue: value,
          now: Date.now(),
          author: "PM（測試）",
          formatTimestamp: () => "2026/09/25 20:30",
          fieldLabel: field,
          existingLogs: prev,
          burstMap: burstMap.current,
        });
        burstMap.current = nextBurstMap;
        return logs;
      });
      persistCalls.push({ editLogs: nextLogs });
      void feeStore.updateFee(feeId, { editLogs: nextLogs.map((e) => ({
        id: e.id,
        author: e.changedBy,
        field,
        oldValue: "",
        newValue: e.description,
        timestamp: new Date().toISOString(),
        fieldKey: e.fieldKey,
      })) });
      const updated = computeThenSet(taskLatest, setTaskItemsState, (prev) =>
        prev.map((item) => (item.id === "item-a" ? { ...item, [field]: value } : item)),
      );
      persistCalls.push({ taskItems: updated });
      void feeStore.updateFee(feeId, { taskItems: updated });
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  };

  return (
    <div>
      <span data-testid="price">{taskItems[0].unitPrice}</span>
      <span data-testid="count">{taskItems[0].unitCount}</span>
      <span data-testid="logs">{editLog.length}</span>
      <button type="button" data-testid="price-then-count" onClick={() => {
        commitField("unitPrice", 1500);
        commitField("unitCount", 3);
      }}>
        連改
      </button>
      <button type="button" data-testid="set-price" onClick={() => setTaskItems((prev) => prev.map((row) => ({ ...row, unitPrice: 9 })))}>
        直接設
      </button>
    </div>
  );
}

describe("費用明細受影響欄位真元件接線", () => {
  const containers: HTMLElement[] = [];
  const roots: Root[] = [];

  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
    getAuthenticatedUserMock.mockReset();
    getAuthenticatedUserMock.mockResolvedValue({ id: "u1" });
    fromMock.mockImplementation(() => {
      const skip = { data: null, error: { message: "controlled skip requery" } };
      const chain = {
        order: async () => ({ data: [], error: null }),
        eq: () => chain,
        maybeSingle: async () => skip,
        insert: async () => ({ data: null, error: null }),
      };
      return {
        select: () => chain,
        insert: async () => ({ data: null, error: null }),
      };
    });
    rpcMock.mockResolvedValue({
      data: { ok: true, updated_at: "2026-09-25T12:00:01.000Z", status: "draft" },
      error: null,
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

  it("同一事件先改單價再改數量，兩欄與兩筆紀錄都送出且畫面為後值", async () => {
    const draft = feeStore.createDraft();
    draft.updatedAt = "2026-09-25T12:00:00.000Z";
    const persistCalls: Array<Record<string, unknown>> = [];
    const errors: Error[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    containers.push(container);
    let root: Root;
    act(() => {
      root = createRoot(container);
      root.render(<FeeTaskEditor feeId={draft.id} persistCalls={persistCalls} errors={errors} />);
    });
    roots.push(root!);

    act(() => {
      container.querySelector("[data-testid='price-then-count']")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(errors).toEqual([]);
    expect(container.querySelector("[data-testid='price']")!.textContent).toBe("1500");
    expect(container.querySelector("[data-testid='count']")!.textContent).toBe("3");
    expect(container.querySelector("[data-testid='logs']")!.textContent).toBe("2");
    const lastTasks = [...persistCalls].reverse().find((row) => row.taskItems) as { taskItems: TaskItem[] } | undefined;
    expect(lastTasks?.taskItems[0]).toEqual({ id: "item-a", unitPrice: 1500, unitCount: 3 });
    await vi.waitFor(() => {
      expect(feeStore.getFeeById(draft.id)?.taskItems.find((row) => row.id === "item-a")?.unitCount).toBe(3);
      expect(feeStore.getWriteBanner(draft.id).inFlight).toBe(false);
    });
  });
});
