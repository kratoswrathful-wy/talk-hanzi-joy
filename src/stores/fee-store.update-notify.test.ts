import { describe, it, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
const rpcMock = vi.fn();
const getAuthenticatedUserMock = vi.fn();
const getEnvironmentMock = vi.fn(() => "test");

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
  getEnvironment: () => getEnvironmentMock(),
}));

vi.mock("@/lib/realtime-poll", () => ({
  createPollFallback: () => ({ start: () => undefined, stop: () => undefined }),
  createFeesVisiblePollFallback: () => ({ start: () => undefined, stop: () => undefined }),
}));

const { feeStore } = await import("./fee-store");

describe("feeStore updateFee notify 收尾", () => {
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

  it("通知中再改不同欄不會無限通知，兩欄都留住", async () => {
    const draft = feeStore.createDraft();
    draft.updatedAt = "2026-09-24T10:00:00.000Z";
    let notifies = 0;
    const unsub = feeStore.subscribe(() => {
      notifies += 1;
      if (notifies > 20) throw new Error("unbounded notify");
      if (notifies === 1) {
        void feeStore.updateFee(draft.id, { assignee: "譯者一（測試）" });
      }
    });
    await feeStore.updateFee(draft.id, { title: "PO-連續" });
    unsub();
    const row = feeStore.getFeeById(draft.id);
    expect(notifies).toBeLessThan(20);
    expect(row?.title).toBe("PO-連續");
    expect(row?.assignee).toBe("譯者一（測試）");
  });

  it("通知丟錯後寫入中不會永久掛住", async () => {
    const draft = feeStore.createDraft();
    draft.updatedAt = "2026-09-24T10:00:00.000Z";
    const unsub = feeStore.subscribe(() => {
      throw new Error("listener fail");
    });
    await feeStore.updateFee(draft.id, { title: "仍要收尾" }).catch(() => undefined);
    unsub();
    expect(feeStore.hasUnconfirmedWrite(draft.id)).toBe(false);
    expect(feeStore.getWriteBanner(draft.id).inFlight).toBe(false);
  });
});
