import { describe, expect, it, vi, beforeEach } from "vitest";
import { computeThenSet } from "./commit-latest-state";
import { applyEditLogFieldChange, type SimplePersistedLog } from "./edit-log-coalesce";

function simpleToFeeEditLogs(logs: SimplePersistedLog[]) {
  return logs.map((e) => ({
    id: e.id,
    author: e.changedBy,
    field: e.fieldKey ?? "",
    oldValue: "",
    newValue: e.description,
    timestamp: new Date().toISOString(),
    fieldKey: e.fieldKey,
  }));
}

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

function pageUpdateItem(
  setTaskItems: (updater: (prev: TaskItem[]) => TaskItem[]) => void,
  feeId: string,
  itemId: string,
  field: "unitPrice" | "unitCount",
  value: number,
) {
  const updated = computeThenSet(setTaskItems, (prev) =>
    prev.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)),
  );
  return feeStore.updateFee(feeId, { taskItems: updated });
}

function pageTrackChange(
  setEditLog: (updater: (prev: ReturnType<typeof applyEditLogFieldChange>["nextLogs"]) => ReturnType<typeof applyEditLogFieldChange>["nextLogs"]) => void,
  burstBox: { current: Parameters<typeof applyEditLogFieldChange>[0]["burstMap"] },
  feeId: string,
  field: string,
  oldValue: string | number,
  newValue: string | number,
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
  return feeStore.updateFee(feeId, { editLogs: simpleToFeeEditLogs(nextLogs) });
}

describe("費用明細頁＋真 store 連續改欄", () => {
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
      data: { ok: true, updated_at: "2026-09-24T10:00:01.000Z", status: "draft" },
      error: null,
    });
  });

  it("正常節奏改單價再改數量，兩欄都留在最新本地狀態", async () => {
    const draft = feeStore.createDraft();
    draft.updatedAt = "2026-09-24T10:00:00.000Z";
    const box = { value: [{ id: "item-a", unitPrice: 0, unitCount: 0 }] };
    const setTaskItems = (updater: (prev: TaskItem[]) => TaskItem[]) => {
      box.value = updater(box.value);
    };
    const first = pageUpdateItem(setTaskItems, draft.id, "item-a", "unitPrice", 1500);
    const second = pageUpdateItem(setTaskItems, draft.id, "item-a", "unitCount", 3);
    await Promise.all([first, second]);
    expect(box.value).toEqual([{ id: "item-a", unitPrice: 1500, unitCount: 3 }]);
    const stored = feeStore.getFeeById(draft.id)?.taskItems.find((row) => row.id === "item-a");
    expect(stored?.unitPrice).toBe(1500);
    expect(stored?.unitCount).toBe(3);
    expect(feeStore.getWriteBanner(draft.id).inFlight).toBe(false);
  });

  it("修改紀錄開啟時連改兩欄，後值與紀錄都在、不重入 updater", async () => {
    const draft = feeStore.createDraft();
    draft.updatedAt = "2026-09-24T10:00:00.000Z";
    const logsBox = { value: [] as ReturnType<typeof applyEditLogFieldChange>["nextLogs"] };
    const setEditLog = (
      updater: (prev: typeof logsBox.value) => typeof logsBox.value,
    ) => {
      logsBox.value = updater(logsBox.value);
    };
    const burstBox = { current: {} as Parameters<typeof applyEditLogFieldChange>[0]["burstMap"] };
    await pageTrackChange(setEditLog, burstBox, draft.id, "採購單號", "", "AIQA-PO-260924-05");
    await pageTrackChange(setEditLog, burstBox, draft.id, "備註", "", "連續第二欄");
    expect(logsBox.value.map((row) => row.fieldKey)).toEqual(["採購單號", "備註"]);
    expect(logsBox.value).toHaveLength(2);
    expect(feeStore.getFeeById(draft.id)?.editLogs?.length).toBe(2);
    expect(feeStore.getWriteBanner(draft.id).inFlight).toBe(false);
  });

  it("第一筆 persist 晚回時，後一欄本地值不被清掉，寫入中最後會收", async () => {
    let releaseFirst: (() => void) | undefined;
    rpcMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirst = () =>
            resolve({
              data: { ok: true, updated_at: "2026-09-24T10:00:02.000Z", status: "draft" },
              error: null,
            });
        }),
    );
    const draft = feeStore.createDraft();
    draft.updatedAt = "2026-09-24T10:00:00.000Z";
    const box = { value: [{ id: "item-a", unitPrice: 0, unitCount: 0 }] };
    const setTaskItems = (updater: (prev: TaskItem[]) => TaskItem[]) => {
      box.value = updater(box.value);
    };
    const first = pageUpdateItem(setTaskItems, draft.id, "item-a", "unitPrice", 1500);
    const second = pageUpdateItem(setTaskItems, draft.id, "item-a", "unitCount", 3);
    expect(box.value[0]).toEqual({ id: "item-a", unitPrice: 1500, unitCount: 3 });
    expect(feeStore.getFeeById(draft.id)?.taskItems.find((row) => row.id === "item-a")?.unitCount).toBe(3);
    await vi.waitFor(() => {
      if (!releaseFirst) throw new Error("first persist has not reached rpc yet");
    });
    releaseFirst();
    await Promise.all([first, second]);
    expect(feeStore.getFeeById(draft.id)?.taskItems.find((row) => row.id === "item-a")?.unitCount).toBe(3);
    expect(feeStore.getWriteBanner(draft.id).inFlight).toBe(false);
  });
});
