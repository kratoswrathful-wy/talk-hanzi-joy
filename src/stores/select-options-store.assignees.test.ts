import { describe, it, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
const getAuthenticatedUserMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock("@/lib/auth-ready", () => ({
  getAuthenticatedUser: () => getAuthenticatedUserMock(),
}));

vi.mock("./settings-persistence", () => ({
  loadSetting: vi.fn(async () => null),
  saveSetting: vi.fn(),
  markDirty: vi.fn(),
}));

const { selectOptionsStore } = await import("./select-options-store");

describe("loadAssignees single-flight", () => {
  beforeEach(() => {
    fromMock.mockReset();
    getAuthenticatedUserMock.mockReset();
    getAuthenticatedUserMock.mockResolvedValue({ id: "u1" });

    fromMock.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(async () => ({
            data: [
              {
                id: "p1",
                email: "a@x.com",
                display_name: "A",
                avatar_url: null,
                timezone: null,
                status_message: null,
              },
            ],
            error: null,
          })),
        };
      }
      if (table === "invitations") {
        return {
          select: vi.fn(() => ({
            is: vi.fn(async () => ({ data: [], error: null })),
          })),
        };
      }
      if (table === "member_translator_settings") {
        return {
          select: vi.fn(async () => ({ data: [], error: null })),
        };
      }
      return { select: vi.fn(async () => ({ data: [], error: null })) };
    });
  });

  it("concurrent loadAssignees do not unbounded-parallel query profiles", async () => {
    await Promise.all([
      selectOptionsStore.loadAssignees(),
      selectOptionsStore.loadAssignees(),
      selectOptionsStore.loadAssignees(),
    ]);

    const profileCalls = fromMock.mock.calls.filter((c) => c[0] === "profiles").length;
    // First load + at most one trailing refresh
    expect(profileCalls).toBeGreaterThanOrEqual(1);
    expect(profileCalls).toBeLessThanOrEqual(2);
  });
});
