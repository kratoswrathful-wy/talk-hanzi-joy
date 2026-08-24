import { describe, it, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
const getAuthenticatedUserMock = vi.fn();
const getEnvironmentMock = vi.fn(() => "production");

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
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
  getEnvironment: () => getEnvironmentMock(),
}));

vi.mock("@/lib/realtime-poll", () => ({
  createPollFallback: () => ({ start: () => undefined, stop: () => undefined }),
  createFeesVisiblePollFallback: () => ({ start: () => undefined, stop: () => undefined }),
}));

const { feeStore } = await import("./fee-store");

describe("feeStore.loadFees single-flight", () => {
  beforeEach(() => {
    fromMock.mockReset();
    getAuthenticatedUserMock.mockReset();
    getAuthenticatedUserMock.mockResolvedValue({ id: "u1" });

    fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: [], error: null }),
        }),
      }),
    }));
  });

  it("concurrent loadFees do not unbounded-parallel query fees_visible", async () => {
    await Promise.all([feeStore.loadFees(), feeStore.loadFees(), feeStore.loadFees()]);
    expect(fromMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(fromMock.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
