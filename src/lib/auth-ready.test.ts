import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, User } from "@supabase/supabase-js";

type AuthCb = (event: string, session: Session | null) => void;

let authCallback: AuthCb | null = null;
let getSessionImpl: () => Promise<{ data: { session: Session | null }; error: null }>;
let onAuthStateChangeCalls = 0;
let unsubscribeCalls = 0;

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
        onAuthStateChangeCalls += 1;
        authCallback = cb;
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                unsubscribeCalls += 1;
              },
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
    unsubscribeCalls = 0;
    getSessionImpl = () =>
      new Promise(() => {
        /* never settles — reproduces production hang */
      });
    const mod = await import("./auth-ready");
    mod.__resetAuthReadyForTests({ getSessionTimeoutMs: 40 });
  });

  afterEach(async () => {
    const mod = await import("./auth-ready");
    mod.__resetAuthReadyForTests();
  });

  it("getSession() 永不完成時必須在 timeout 內進入 recoverable_error（不得永久卡住）", async () => {
    const { waitForAuthReady, getAuthPhase } = await import("./auth-ready");
    const snap = await waitForAuthReady();
    expect(snap.phase).toBe("recoverable_error");
    expect(snap.ready).toBe(true);
    expect(snap.user).toBeNull();
    expect(getAuthPhase()).toBe("recoverable_error");
  });

  it("Auth event 在 pending getSession() 前先到 → 立即 authenticated，不等 timeout", async () => {
    let releaseGetSession: ((session: Session | null) => void) | null = null;
    getSessionImpl = () =>
      new Promise((resolve) => {
        releaseGetSession = (session) =>
          resolve({ data: { session }, error: null });
      });

    const { waitForAuthReady, __resetAuthReadyForTests } = await import("./auth-ready");
    __resetAuthReadyForTests({ getSessionTimeoutMs: 5000 });

    const pending = waitForAuthReady();
    // 讓 listener 註冊完成
    await Promise.resolve();
    expect(authCallback).toBeTruthy();

    const session = makeSession("user-event-first");
    authCallback!("INITIAL_SESSION", session);

    const snap = await pending;
    expect(snap.phase).toBe("authenticated");
    expect(snap.user?.id).toBe("user-event-first");

    // losing getSession 晚到不得覆寫
    releaseGetSession?.(null);
    await Promise.resolve();
    const { getAuthSnapshot } = await import("./auth-ready");
    expect(getAuthSnapshot().user?.id).toBe("user-event-first");
    expect(getAuthSnapshot().phase).toBe("authenticated");
  });

  it("timeout losing branch 晚到 reject 不得 unhandled rejection，且不覆寫新狀態", async () => {
    const rejectionHandler = vi.fn();
    process.on("unhandledRejection", rejectionHandler);

    let rejectGetSession: ((err: Error) => void) | null = null;
    getSessionImpl = () =>
      new Promise((_, reject) => {
        rejectGetSession = reject;
      });

    const { waitForAuthReady, retryAuthInitialization, getAuthSnapshot } =
      await import("./auth-ready");
    const first = await waitForAuthReady();
    expect(first.phase).toBe("recoverable_error");

    // retry 時 getSession 成功
    getSessionImpl = async () => ({
      data: { session: makeSession("user-retry") },
      error: null,
    });
    const second = await retryAuthInitialization();
    expect(second.phase).toBe("authenticated");

    rejectGetSession?.(new Error("late getSession reject"));
    await new Promise((r) => setTimeout(r, 20));

    expect(getAuthSnapshot().phase).toBe("authenticated");
    expect(getAuthSnapshot().user?.id).toBe("user-retry");
    expect(rejectionHandler).not.toHaveBeenCalled();
    process.off("unhandledRejection", rejectionHandler);
  });

  it("多 consumer 只註冊一次 Auth listener，且共用同一次 getSession attempt", async () => {
    let getSessionCalls = 0;
    getSessionImpl = async () => {
      getSessionCalls += 1;
      return { data: { session: makeSession("shared") }, error: null };
    };

    const {
      waitForAuthReady,
      subscribeAuthReady,
      __resetAuthReadyForTests,
    } = await import("./auth-ready");
    __resetAuthReadyForTests({ getSessionTimeoutMs: 200 });

    const unsub1 = subscribeAuthReady(() => undefined);
    const unsub2 = subscribeAuthReady(() => undefined);
    const [a, b] = await Promise.all([waitForAuthReady(), waitForAuthReady()]);

    expect(onAuthStateChangeCalls).toBe(1);
    expect(getSessionCalls).toBe(1);
    expect(a.user?.id).toBe("shared");
    expect(b.user?.id).toBe("shared");
    unsub1();
    unsub2();
  });

  it("recoverable_error 不得被 getAuthenticatedUser 誤判為 anonymous（null）", async () => {
    const { waitForAuthReady, getAuthenticatedUser, AuthRecoverableError } =
      await import("./auth-ready");
    await waitForAuthReady();
    await expect(getAuthenticatedUser()).rejects.toBeInstanceOf(AuthRecoverableError);
  });

  it("SIGNED_OUT → anonymous；TOKEN_REFRESHED 不進入 recoverable／不清 session", async () => {
    getSessionImpl = async () => ({
      data: { session: makeSession("u1") },
      error: null,
    });
    const { waitForAuthReady, getAuthSnapshot, __resetAuthReadyForTests } =
      await import("./auth-ready");
    __resetAuthReadyForTests({ getSessionTimeoutMs: 200 });
    await waitForAuthReady();
    expect(getAuthSnapshot().phase).toBe("authenticated");

    const refreshed = makeSession("u1");
    authCallback!("TOKEN_REFRESHED", refreshed);
    expect(getAuthSnapshot().phase).toBe("authenticated");
    expect(getAuthSnapshot().user?.id).toBe("u1");

    authCallback!("SIGNED_OUT", null);
    expect(getAuthSnapshot().phase).toBe("anonymous");
    expect(getAuthSnapshot().user).toBeNull();
  });

  it("timeout 後有效 session event 可恢復 authenticated", async () => {
    const { waitForAuthReady, getAuthSnapshot } = await import("./auth-ready");
    await waitForAuthReady();
    expect(getAuthSnapshot().phase).toBe("recoverable_error");

    authCallback!("SIGNED_IN", makeSession("recovered"));
    expect(getAuthSnapshot().phase).toBe("authenticated");
    expect(getAuthSnapshot().user?.id).toBe("recovered");
  });
});
