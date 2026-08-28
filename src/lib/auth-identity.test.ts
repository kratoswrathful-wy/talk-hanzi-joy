import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const profileSelect = vi.fn();
const rolesSelect = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => profileSelect(),
            }),
          }),
        };
      }
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () => rolesSelect(),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

vi.mock("@/lib/environment", () => ({
  setTestAccountFlag: vi.fn(),
}));

describe("auth-identity stale result guard", () => {
  beforeEach(async () => {
    vi.resetModules();
    profileSelect.mockReset();
    rolesSelect.mockReset();
    const mod = await import("./auth-identity");
    mod.__resetAuthIdentityForTests({ rolesTimeoutMs: 50, profileTimeoutMs: 50 });
  });

  afterEach(async () => {
    const mod = await import("./auth-identity");
    mod.__resetAuthIdentityForTests();
  });

  it("user A 的 PM／Executive roles 晚到不得覆寫 user B", async () => {
    let resolveA: ((v: unknown) => void) | null = null;
    let resolveB: ((v: unknown) => void) | null = null;

    rolesSelect
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveB = resolve;
          }),
      );

    profileSelect.mockResolvedValue({ data: null, error: null });

    const {
      beginIdentityLoad,
      invalidateIdentity,
      getCachedRoles,
    } = await import("./auth-identity");

    const genA = beginIdentityLoad("user-a");
    const loadA = genA.rolesPromise;

    invalidateIdentity();
    const genB = beginIdentityLoad("user-b");
    const loadB = genB.rolesPromise;

    resolveB?.({
      data: [{ role: "member" }],
      error: null,
    });
    await loadB;
    expect(getCachedRoles("user-b")).toEqual([{ role: "member" }]);

    // A 的 executive 晚到
    resolveA?.({
      data: [{ role: "executive" }, { role: "pm" }],
      error: null,
    });
    await loadA;

    expect(getCachedRoles("user-b")).toEqual([{ role: "member" }]);
    expect(getCachedRoles("user-a")).toBeNull();
  });

  it("SIGNED_OUT（invalidate）後晚到的 A roles 不得殘留", async () => {
    let resolveA: ((v: unknown) => void) | null = null;
    rolesSelect.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve;
        }),
    );
    profileSelect.mockResolvedValue({ data: null, error: null });

    const {
      beginIdentityLoad,
      invalidateIdentity,
      getCachedRoles,
      getIdentityGeneration,
    } = await import("./auth-identity");

    const gen = beginIdentityLoad("user-a");
    const beforeGen = getIdentityGeneration();
    invalidateIdentity();
    expect(getIdentityGeneration()).toBeGreaterThan(beforeGen);

    resolveA?.({ data: [{ role: "pm" }], error: null });
    await gen.rolesPromise;

    expect(getCachedRoles("user-a")).toBeNull();
  });

  it("同一 userId 多 consumer 共用 single-flight（只查一次 roles）", async () => {
    rolesSelect.mockResolvedValue({
      data: [{ role: "pm" }],
      error: null,
    });
    profileSelect.mockResolvedValue({
      data: { id: "u1", email: "a@b.c", display_name: "A" },
      error: null,
    });

    const { beginIdentityLoad } = await import("./auth-identity");
    const a = beginIdentityLoad("u1");
    const b = beginIdentityLoad("u1");
    expect(a.rolesPromise).toBe(b.rolesPromise);
    expect(a.profilePromise).toBe(b.profilePromise);

    const [rolesA, rolesB] = await Promise.all([a.rolesPromise, b.rolesPromise]);
    expect(rolesA).toEqual([{ role: "pm" }]);
    expect(rolesB).toEqual([{ role: "pm" }]);
    expect(rolesSelect).toHaveBeenCalledTimes(1);
  });
});
