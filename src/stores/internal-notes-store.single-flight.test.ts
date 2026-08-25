import { beforeEach, describe, expect, it, vi } from "vitest";

type AuthCallback = (
  event: string,
  session: { user: { id: string } } | null,
) => void;

const fromMock = vi.fn();
const getAuthenticatedUserMock = vi.fn();
const authCallbacks: AuthCallback[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    auth: {
      onAuthStateChange: (callback: AuthCallback) => {
        authCallbacks.push(callback);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
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
  getEnvironment: () => "production",
}));

vi.mock("@/lib/realtime-poll", () => ({
  createPollFallback: () => ({
    start: () => undefined,
    stop: () => undefined,
  }),
}));

const { internalNotesStore } = await import("./internal-notes-store");

describe("internalNotesStore initial load", () => {
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

  it("shares concurrent initial load and ignores TOKEN_REFRESHED", async () => {
    await Promise.all([
      internalNotesStore.ensureLoaded(),
      internalNotesStore.ensureLoaded(),
      internalNotesStore.ensureLoaded(),
    ]);
    expect(fromMock).toHaveBeenCalledTimes(1);

    fromMock.mockClear();
    authCallbacks[0]?.("TOKEN_REFRESHED", { user: { id: "u1" } });
    await Promise.resolve();
    expect(fromMock).not.toHaveBeenCalled();
  });
});
