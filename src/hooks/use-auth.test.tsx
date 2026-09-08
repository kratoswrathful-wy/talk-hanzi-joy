import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Session, User } from "@supabase/supabase-js";

type AuthCb = (event: string, session: Session | null) => void;

let authCallback: AuthCb | null = null;
let getSessionImpl: () => Promise<{ data: { session: Session | null }; error: null }>;
let signOutImpl: () => Promise<{ error: null }>;
let profileSelect = vi.fn();
let rolesSelect = vi.fn();

function makeUser(id: string): User {
  return { id, email: `${id}@example.com` } as User;
}
function makeSession(userId: string): Session {
  return { access_token: "tok", user: makeUser(userId) } as Session;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => getSessionImpl(),
      onAuthStateChange: (cb: AuthCb) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      signOut: () => signOutImpl(),
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => {
              const maybeSingle = () => profileSelect();
              return {
                abortSignal: () => ({ maybeSingle }),
                maybeSingle,
              };
            },
          }),
        };
      }
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () => {
              const result = rolesSelect();
              return Object.assign(result, {
                abortSignal: () => result,
              });
            },
          }),
        };
      }
      throw new Error(table);
    },
  },
}));

vi.mock("@/lib/environment", () => ({
  setTestAccountFlag: vi.fn(),
}));

describe("useAuth multi-consumer / identity / signOut", () => {
  beforeEach(async () => {
    vi.resetModules();
    authCallback = null;
    profileSelect = vi.fn().mockResolvedValue({
      data: { id: "u1", email: "a@b.c", display_name: "A" },
      error: null,
    });
    rolesSelect = vi.fn().mockResolvedValue({
      data: [{ role: "pm" }],
      error: null,
    });
    getSessionImpl = async () => ({
      data: { session: makeSession("u1") },
      error: null,
    });
    signOutImpl = async () => ({ error: null });

    const authReady = await import("@/lib/auth-ready");
    authReady.__resetAuthReadyForTests({ getSessionTimeoutMs: 200 });
    const identity = await import("@/lib/auth-identity");
    identity.__resetAuthIdentityForTests({ rolesTimeoutMs: 200, profileTimeoutMs: 200 });
  });

  afterEach(async () => {
    const authReady = await import("@/lib/auth-ready");
    authReady.__resetAuthReadyForTests();
    const identity = await import("@/lib/auth-identity");
    identity.__resetAuthIdentityForTests();
  });

  it("多個 useAuth() consumer 共用同一次 roles／profile 查詢", async () => {
    const { useAuth } = await import("./use-auth");
    const a = renderHook(() => useAuth());
    const b = renderHook(() => useAuth());

    await waitFor(() => {
      expect(a.result.current.loading).toBe(false);
      expect(b.result.current.loading).toBe(false);
    });

    expect(a.result.current.isAdmin).toBe(true);
    expect(b.result.current.isAdmin).toBe(true);
    expect(rolesSelect).toHaveBeenCalledTimes(1);
    expect(profileSelect).toHaveBeenCalledTimes(1);
  });

  it("A→B 切換時 A 的晚到 executive 不得覆寫 B", async () => {
    let resolveARoles: ((v: unknown) => void) | null = null;
    rolesSelect.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveARoles = resolve;
        }),
    );
    rolesSelect.mockResolvedValueOnce({
      data: [{ role: "member" }],
      error: null,
    });
    profileSelect.mockResolvedValue({ data: null, error: null });

    const { useAuth } = await import("./use-auth");
    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(authCallback).toBeTruthy());

    // 切到 B
    await act(async () => {
      authCallback!("SIGNED_IN", makeSession("user-b"));
    });

    await waitFor(() => {
      expect(result.current.user?.id).toBe("user-b");
      expect(result.current.loading).toBe(false);
    });

    // A 的 executive 晚到
    await act(async () => {
      resolveARoles?.({ data: [{ role: "executive" }], error: null });
    });

    expect(result.current.user?.id).toBe("user-b");
    expect(result.current.roles).toEqual([{ role: "member" }]);
    expect(result.current.isExecutive).toBe(false);
  });

  it("roles 暫時錯誤不得靜默當 member；retry 可恢復", async () => {
    rolesSelect
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } })
      .mockResolvedValueOnce({ data: [{ role: "pm" }], error: null });

    const { useAuth } = await import("./use-auth");
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.identityError).toBeTruthy();
    });
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.rolesTrusted).toBe(false);

    await act(async () => {
      await result.current.retryIdentity();
    });

    await waitFor(() => {
      expect(result.current.identityError).toBeNull();
      expect(result.current.isAdmin).toBe(true);
    });
  });

  it("profile 失敗不得被後到的 roles 成功清掉，且不與合法空 roles 混稱", async () => {
    let resolveProfile: ((v: unknown) => void) | null = null;
    let resolveRoles: ((v: unknown) => void) | null = null;
    profileSelect.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveProfile = resolve;
        }),
    );
    rolesSelect.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRoles = resolve;
        }),
    );

    const { useAuth } = await import("./use-auth");
    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.identityLoading).toBe(true));

    await act(async () => {
      resolveProfile?.({ data: null, error: { message: "profile boom" } });
    });
    await act(async () => {
      resolveRoles?.({ data: [{ role: "pm" }], error: null });
    });

    await waitFor(() => {
      expect(result.current.identityError).toBeTruthy();
      expect(result.current.identitySource).toBe("profile");
      expect(result.current.rolesTrusted).toBe(true);
      expect(result.current.isAdmin).toBe(true);
    });
  });

  it("合法空 roles 不是錯誤；不得當成已載入管理角色", async () => {
    rolesSelect.mockResolvedValue({ data: [], error: null });
    profileSelect.mockResolvedValue({
      data: { id: "u1", email: "a@b.c", display_name: "A" },
      error: null,
    });
    const { useAuth } = await import("./use-auth");
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.identityError).toBeNull();
    expect(result.current.rolesTrusted).toBe(true);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.primaryRole).toBe("member");
  });

  it("重試有界：超過上限不再發新請求", async () => {
    rolesSelect.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { useAuth } = await import("./use-auth");
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.identityError).toBeTruthy());
    const before = rolesSelect.mock.calls.length;

    await act(async () => {
      for (let i = 0; i < 8; i += 1) {
        await result.current.retryIdentity();
      }
    });

    expect(result.current.identityRetryCapped).toBe(true);
    expect(rolesSelect.mock.calls.length).toBeLessThanOrEqual(before + 5);

    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.identityRetryCapped).toBe(false);
    expect(result.current.identityRetryCount).toBe(0);
    expect(result.current.authPhase).toBe("anonymous");
  });

  it("refetchProfile 強制重新查詢", async () => {
    profileSelect
      .mockResolvedValueOnce({
        data: { id: "u1", email: "a@b.c", display_name: "Old" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: "u1", email: "a@b.c", display_name: "New" },
        error: null,
      });

    const { useAuth } = await import("./use-auth");
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.profile?.display_name).toBe("Old");
    });

    await act(async () => {
      result.current.refetchProfile();
    });

    await waitFor(() => {
      expect(result.current.profile?.display_name).toBe("New");
    });
    expect(profileSelect.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("signOut timeout 後再登入：晚到的 signOut 不得覆寫新狀態", async () => {
    let resolveSignOut: (() => void) | null = null;
    signOutImpl = () =>
      new Promise((resolve) => {
        resolveSignOut = () => resolve({ error: null });
      });

    const { useAuth, __setSignOutTimeoutMsForTests } = await import("./use-auth");
    __setSignOutTimeoutMsForTests(30);
    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.user?.id).toBe("u1"));

    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.authPhase).toBe("anonymous");

    await act(async () => {
      authCallback!("SIGNED_IN", makeSession("u2"));
    });
    await waitFor(() => expect(result.current.user?.id).toBe("u2"));

    await act(async () => {
      resolveSignOut?.();
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(result.current.user?.id).toBe("u2");
    expect(result.current.authPhase).toBe("authenticated");
    __setSignOutTimeoutMsForTests(null);
  });
});
