import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, User } from "@supabase/supabase-js";

type AuthCb = (event: string, session: Session | null) => void;

let authCallback: AuthCb | null = null;
let getSessionImpl: () => Promise<{
  data: { session: Session | null };
  error: { message: string } | Error | null;
}>;
let onAuthStateChangeCalls = 0;

function makeUser(id: string): User {
  return { id, email: `${id}@example.com` } as User;
}

function makeSession(userId: string): Session {
  return { access_token: "tok", user: makeUser(userId) } as Session;
}

let syncInitialSession: Session | null | undefined = undefined;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => getSessionImpl(),
      onAuthStateChange: (cb: AuthCb) => {
        onAuthStateChangeCalls += 1;
        authCallback = cb;
        if (syncInitialSession !== undefined) {
          cb("INITIAL_SESSION", syncInitialSession);
        }
        return {
          data: {
            subscription: {
              unsubscribe: () => undefined,
            },
          },
        };
      },
      signOut: vi.fn(async () => ({ error: null })),
    },
  },
}));

describe("auth-ready bounded initialization", () => {
  beforeEach(async () => {
    vi.resetModules();
    authCallback = null;
    onAuthStateChangeCalls = 0;
    syncInitialSession = undefined;
    getSessionImpl = () =>
      new Promise(() => {
        /* never settles */
      });
    const mod = await import("./auth-ready");
    mod.__resetAuthReadyForTests({ getSessionTimeoutMs: 40 });
  });

  afterEach(async () => {
    const mod = await import("./auth-ready");
    mod.__resetAuthReadyForTests();
  });

  it("getSession() 永不完成時必須在 timeout 內進入 recoverable_error", async () => {
    const { waitForAuthReady, getAuthPhase } = await import("./auth-ready");
    const snap = await waitForAuthReady();
    expect(snap.phase).toBe("recoverable_error");
    expect(getAuthPhase()).toBe("recoverable_error");
  });

  it("getSession resolved 帶 error 時進入 recoverable_error，不得當成 anonymous", async () => {
    getSessionImpl = async () => ({
      data: { session: null },
      error: { message: "session restore failed" },
    });
    const { waitForAuthReady, getAuthSnapshot, __resetAuthReadyForTests } =
      await import("./auth-ready");
    __resetAuthReadyForTests({ getSessionTimeoutMs: 200 });
    const snap = await waitForAuthReady();
    expect(snap.phase).toBe("recoverable_error");
    expect(snap.errorKind).toBe("get_session_error");
    expect(getAuthSnapshot().phase).not.toBe("anonymous");
  });

  it("listener 同步 INITIAL_SESSION 不得被後續 initializing 覆寫", async () => {
    getSessionImpl = async () => ({
      data: { session: null },
      error: null,
    });
    syncInitialSession = makeSession("sync-user");

    const { waitForAuthReady, getAuthSnapshot, __resetAuthReadyForTests } =
      await import("./auth-ready");
    __resetAuthReadyForTests({ getSessionTimeoutMs: 5000 });

    const snap = await waitForAuthReady();
    expect(snap.phase).toBe("authenticated");
    expect(snap.user?.id).toBe("sync-user");
    // getSession 晚到 null 也不得覆寫
    await Promise.resolve();
    expect(getAuthSnapshot().phase).toBe("authenticated");
    expect(getAuthSnapshot().user?.id).toBe("sync-user");
  });

  it("Auth event 在 pending getSession() 前先到 → 立即 authenticated，並清除 timeout timer", async () => {
    let releaseGetSession: ((session: Session | null) => void) | null = null;
    getSessionImpl = () =>
      new Promise((resolve) => {
        releaseGetSession = (session) =>
          resolve({ data: { session }, error: null });
      });

    const {
      waitForAuthReady,
      __resetAuthReadyForTests,
      __hasActiveTimeoutTimerForTests,
      getAuthSnapshot,
    } = await import("./auth-ready");
    __resetAuthReadyForTests({ getSessionTimeoutMs: 5000 });

    const pending = waitForAuthReady();
    await Promise.resolve();
    expect(authCallback).toBeTruthy();
    expect(__hasActiveTimeoutTimerForTests()).toBe(true);

    authCallback!("INITIAL_SESSION", makeSession("user-event-first"));
    const snap = await pending;
    expect(snap.phase).toBe("authenticated");
    expect(__hasActiveTimeoutTimerForTests()).toBe(false);

    releaseGetSession?.(null);
    await Promise.resolve();
    expect(getAuthSnapshot().user?.id).toBe("user-event-first");
  });

  it("timeout losing branch 晚到 reject 不得 unhandled rejection", async () => {
    const rejectionHandler = vi.fn();
    process.on("unhandledRejection", rejectionHandler);

    let rejectGetSession: ((err: Error) => void) | null = null;
    getSessionImpl = () =>
      new Promise((_, reject) => {
        rejectGetSession = reject;
      });

    const { waitForAuthReady, retryAuthInitialization, getAuthSnapshot } =
      await import("./auth-ready");
    await waitForAuthReady();

    getSessionImpl = async () => ({
      data: { session: makeSession("user-retry") },
      error: null,
    });
    await retryAuthInitialization();
    rejectGetSession?.(new Error("late getSession reject"));
    await new Promise((r) => setTimeout(r, 20));

    expect(getAuthSnapshot().phase).toBe("authenticated");
    expect(rejectionHandler).not.toHaveBeenCalled();
    process.off("unhandledRejection", rejectionHandler);
  });

  it("多 consumer 只註冊一次 Auth listener", async () => {
    getSessionImpl = async () => ({
      data: { session: makeSession("shared") },
      error: null,
    });

    const { waitForAuthReady, subscribeAuthReady, __resetAuthReadyForTests } =
      await import("./auth-ready");
    __resetAuthReadyForTests({ getSessionTimeoutMs: 200 });

    const unsub1 = subscribeAuthReady(() => undefined);
    const unsub2 = subscribeAuthReady(() => undefined);
    await Promise.all([waitForAuthReady(), waitForAuthReady()]);
    expect(onAuthStateChangeCalls).toBe(1);
    unsub1();
    unsub2();
  });

  it("recoverable_error 不得被 getAuthenticatedUser 誤判為 anonymous（null）", async () => {
    const { waitForAuthReady, getAuthenticatedUser, AuthRecoverableError } =
      await import("./auth-ready");
    await waitForAuthReady();
    await expect(getAuthenticatedUser()).rejects.toBeInstanceOf(AuthRecoverableError);
  });

  it("TOKEN_REFRESHED 保持 authenticated；SIGNED_OUT → anonymous", async () => {
    getSessionImpl = async () => ({
      data: { session: makeSession("u1") },
      error: null,
    });
    const { waitForAuthReady, getAuthSnapshot, __resetAuthReadyForTests } =
      await import("./auth-ready");
    __resetAuthReadyForTests({ getSessionTimeoutMs: 200 });
    await waitForAuthReady();

    authCallback!("TOKEN_REFRESHED", makeSession("u1"));
    expect(getAuthSnapshot().phase).toBe("authenticated");

    authCallback!("SIGNED_OUT", null);
    expect(getAuthSnapshot().phase).toBe("anonymous");
  });

  it("timeout 後有效 session event 可恢復 authenticated", async () => {
    const { waitForAuthReady, getAuthSnapshot } = await import("./auth-ready");
    await waitForAuthReady();
    expect(getAuthSnapshot().phase).toBe("recoverable_error");
    authCallback!("SIGNED_IN", makeSession("recovered"));
    expect(getAuthSnapshot().phase).toBe("authenticated");
  });
});
