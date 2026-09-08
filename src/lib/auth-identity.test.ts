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
              abortSignal: () => ({
                maybeSingle: () => profileSelect(),
              }),
            }),
          }),
        };
      }
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () => ({
              abortSignal: () => rolesSelect(),
            }),
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

describe("auth-identity stale guard / single-flight", () => {
  beforeEach(async () => {
    vi.resetModules();
    profileSelect.mockReset();
    rolesSelect.mockReset();
    const mod = await import("./auth-identity");
    mod.__resetAuthIdentityForTests({ rolesTimeoutMs: 80, profileTimeoutMs: 80 });
  });

  afterEach(async () => {
    const mod = await import("./auth-identity");
    mod.__resetAuthIdentityForTests();
  });

  it("user A 的 PM／Executive roles 晚到不得覆寫 user B（比對 activeUserId）", async () => {
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
      isIdentityResultCurrent,
      setActiveUserId,
    } = await import("./auth-identity");

    const genA = beginIdentityLoad("user-a");
    invalidateIdentity();
    setActiveUserId("user-b");
    const genB = beginIdentityLoad("user-b");

    resolveB?.({ data: [{ role: "member" }], error: null });
    const rolesB = await genB.rolesPromise;
    expect(rolesB).toEqual({ ok: true, roles: [{ role: "member" }] });
    expect(getCachedRoles("user-b")).toEqual([{ role: "member" }]);

    resolveA?.({ data: [{ role: "executive" }, { role: "pm" }], error: null });
    const rolesA = await genA.rolesPromise;
    expect(rolesA.ok).toBe(false);
    expect(isIdentityResultCurrent("user-a", genA.generation)).toBe(false);
    expect(getCachedRoles("user-a")).toBeNull();
    expect(getCachedRoles("user-b")).toEqual([{ role: "member" }]);
  });

  it("settled 後清除 flight；force refresh 必定重新查詢", async () => {
    rolesSelect.mockResolvedValue({ data: [{ role: "pm" }], error: null });
    profileSelect
      .mockResolvedValueOnce({
        data: { id: "u1", email: "a@b.c", display_name: "A1" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: "u1", email: "a@b.c", display_name: "A2" },
        error: null,
      });

    const {
      beginIdentityLoad,
      beginForcedProfileRefresh,
      getPendingFlightForTests,
    } = await import("./auth-identity");

    const first = beginIdentityLoad("u1");
    const firstProfile = await first.profilePromise;
    expect(firstProfile).toEqual({
      ok: true,
      profile: expect.objectContaining({ display_name: "A1" }),
    });
    await first.rolesPromise;
    await Promise.resolve();
    expect(getPendingFlightForTests()).toBeNull();

    // 無 pending 時再 begin 會開新 flight；force refresh 必須再打一次 profile
    const forced = beginForcedProfileRefresh("u1");
    const refreshed = await forced.profilePromise;
    expect(refreshed).toEqual({
      ok: true,
      profile: expect.objectContaining({ display_name: "A2" }),
    });
    expect(profileSelect).toHaveBeenCalledTimes(2);
  });

  it("roles 查詢錯誤不得快取為空角色（避免 PM 降級）", async () => {
    profileSelect.mockResolvedValue({ data: null, error: null });
    rolesSelect.mockResolvedValue({
      data: null,
      error: { message: "roles boom" },
    });

    const { beginIdentityLoad, getCachedRoles, getPendingFlightForTests } =
      await import("./auth-identity");
    const load = beginIdentityLoad("pm-user");
    const roles = await load.rolesPromise;
    await load.profilePromise;
    expect(roles).toEqual({ ok: false, error: "roles boom", kind: "http" });
    expect(getCachedRoles("pm-user")).toBeNull();
    await Promise.resolve();
    expect(getPendingFlightForTests()).toBeNull();
  });

  it("錯誤後 force retry 可恢復 PM 角色", async () => {
    profileSelect.mockResolvedValue({ data: null, error: null });
    rolesSelect
      .mockResolvedValueOnce({ data: null, error: { message: "transient" } })
      .mockResolvedValueOnce({ data: [{ role: "pm" }], error: null });

    const { beginIdentityLoad, getCachedRoles } = await import("./auth-identity");
    const fail = await beginIdentityLoad("pm-user").rolesPromise;
    expect(fail.ok).toBe(false);
    expect(getCachedRoles("pm-user")).toBeNull();

    const ok = await beginIdentityLoad("pm-user", { force: true }).rolesPromise;
    expect(ok).toEqual({ ok: true, roles: [{ role: "pm" }] });
    expect(getCachedRoles("pm-user")).toEqual([{ role: "pm" }]);
  });

  it("同一 userId 多 consumer 共用 pending single-flight", async () => {
    let resolveRoles: ((v: unknown) => void) | null = null;
    rolesSelect.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRoles = resolve;
        }),
    );
    profileSelect.mockResolvedValue({ data: null, error: null });

    const { beginIdentityLoad, getPendingFlightForTests } =
      await import("./auth-identity");
    const a = beginIdentityLoad("u1");
    const b = beginIdentityLoad("u1");
    expect(a.rolesPromise).toBe(b.rolesPromise);
    expect(getPendingFlightForTests()).not.toBeNull();

    resolveRoles?.({ data: [{ role: "member" }], error: null });
    await a.rolesPromise;
    await b.rolesPromise;
    expect(rolesSelect).toHaveBeenCalledTimes(1);
    expect(getPendingFlightForTests()).toBeNull();
  });

  it("isIdentityResultCurrent 必須同時驗證 activeUserId 與 generation", async () => {
    const { beginIdentityLoad, invalidateIdentity, isIdentityResultCurrent, setActiveUserId } =
      await import("./auth-identity");
    profileSelect.mockResolvedValue({ data: null, error: null });
    rolesSelect.mockResolvedValue({ data: [], error: null });

    const load = beginIdentityLoad("user-a");
    expect(isIdentityResultCurrent("user-a", load.generation)).toBe(true);
    expect(isIdentityResultCurrent("user-b", load.generation)).toBe(false);

    invalidateIdentity();
    setActiveUserId("user-b");
    expect(isIdentityResultCurrent("user-a", load.generation)).toBe(false);
    expect(isIdentityResultCurrent("user-b", load.generation)).toBe(false);
  });

  it("合法空 roles 是成功而非失敗", async () => {
    profileSelect.mockResolvedValue({ data: null, error: null });
    rolesSelect.mockResolvedValue({ data: [], error: null });
    const { beginIdentityLoad } = await import("./auth-identity");
    const roles = await beginIdentityLoad("u1").rolesPromise;
    expect(roles).toEqual({ ok: true, roles: [] });
  });

  it("逾時分類為 timeout，且 force 在 pending 時重用同一 flight", async () => {
    rolesSelect.mockImplementation(() => new Promise(() => undefined));
    profileSelect.mockResolvedValue({ data: null, error: null });
    const { beginIdentityLoad } = await import("./auth-identity");
    const a = beginIdentityLoad("u1");
    const b = beginIdentityLoad("u1", { force: true });
    expect(a.rolesPromise).toBe(b.rolesPromise);
    const roles = await a.rolesPromise;
    expect(roles).toEqual({ ok: false, error: "timeout", kind: "timeout" });
  });

  it("classifyIdentityFailure 區分 timeout／http／lost／stale", async () => {
    const { classifyIdentityFailure } = await import("./auth-identity");
    expect(classifyIdentityFailure(new Error("x"), "timeout").kind).toBe("timeout");
    expect(classifyIdentityFailure(new Error("x"), "switch").kind).toBe("stale");
    expect(classifyIdentityFailure(new Error("Failed to fetch"), null).kind).toBe("lost");
    expect(classifyIdentityFailure(new Error("column missing"), null)).toEqual({
      ok: false,
      error: "column missing",
      kind: "http",
    });
  });
});
