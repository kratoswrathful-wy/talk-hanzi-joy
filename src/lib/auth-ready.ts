import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AuthPhase =
  | "idle"
  | "initializing"
  | "authenticated"
  | "anonymous"
  | "recoverable_error";

export type AuthErrorKind = "get_session_timeout" | "get_session_error" | null;

export interface AuthReadySnapshot {
  ready: boolean;
  phase: AuthPhase;
  session: Session | null;
  user: User | null;
  errorKind: AuthErrorKind;
  attemptId: number;
}

export class AuthRecoverableError extends Error {
  readonly code = "auth_recoverable_error" as const;
  readonly errorKind: AuthErrorKind;

  constructor(errorKind: AuthErrorKind = "get_session_timeout") {
    super("Auth initialization is in a recoverable error state");
    this.name = "AuthRecoverableError";
    this.errorKind = errorKind;
  }
}

const DEFAULT_GET_SESSION_TIMEOUT_MS = 10_000;
const DIAG_PREFIX = "[auth-ready]";

type AuthClient = {
  getSession: () => Promise<{ data: { session: Session | null }; error: Error | null }>;
  onAuthStateChange: (
    cb: (event: string, session: Session | null) => void,
  ) => { data: { subscription: { unsubscribe: () => void } } };
};

let getSessionTimeoutMs = DEFAULT_GET_SESSION_TIMEOUT_MS;
let authClient: AuthClient = supabase.auth as AuthClient;

let snapshot: AuthReadySnapshot = {
  ready: false,
  phase: "idle",
  session: null,
  user: null,
  errorKind: null,
  attemptId: 0,
};

let attemptId = 0;
let initPromise: Promise<AuthReadySnapshot> | null = null;
let retryInFlight: Promise<AuthReadySnapshot> | null = null;
let listenerInstalled = false;
let subscription: { unsubscribe: () => void } | null = null;
let settleCurrentAttempt: ((snap: AuthReadySnapshot) => void) | null = null;

const listeners = new Set<(snapshot: AuthReadySnapshot) => void>();

let lastDiagAt = 0;
let lastDiagKey = "";

function diag(event: string, detail?: Record<string, string | number | boolean | null | undefined>) {
  const key = `${event}:${detail?.attemptId ?? ""}`;
  const now = Date.now();
  // 節流：同一事件 2s 內不重複刷
  if (key === lastDiagKey && now - lastDiagAt < 2000) return;
  lastDiagKey = key;
  lastDiagAt = now;
  const visibility =
    typeof document !== "undefined" ? document.visibilityState : "unknown";
  const payload = {
    event,
    visibility,
    ...detail,
  };
  console.info(DIAG_PREFIX, payload);
}

function notify() {
  listeners.forEach((listener) => listener(snapshot));
}

function setSnapshot(next: Omit<AuthReadySnapshot, "attemptId"> & { attemptId?: number }) {
  snapshot = {
    ...next,
    attemptId: next.attemptId ?? attemptId,
  };
  notify();
}

function markSessionActiveIfNeeded(session: Session | null) {
  if (!session?.user) return;
  if (localStorage.getItem("keep_logged_in") !== "true") {
    sessionStorage.setItem("session_active", "true");
  }
}

function ensureSessionActiveFlag(session: Session | null) {
  if (!session) return;
  const keepLoggedIn = localStorage.getItem("keep_logged_in") === "true";
  const sessionActive = sessionStorage.getItem("session_active") === "true";
  if (!keepLoggedIn && !sessionActive) {
    sessionStorage.setItem("session_active", "true");
  }
}

function digestPromise(promise: Promise<unknown>) {
  void promise.then(
    () => undefined,
    () => undefined,
  );
}

function settleAttempt(
  targetAttempt: number,
  phase: "authenticated" | "anonymous" | "recoverable_error",
  session: Session | null,
  errorKind: AuthErrorKind,
) {
  if (targetAttempt !== attemptId) return snapshot;

  if (phase === "authenticated") {
    markSessionActiveIfNeeded(session);
    ensureSessionActiveFlag(session);
  }

  setSnapshot({
    ready: true,
    phase,
    session: phase === "authenticated" ? session : null,
    user: phase === "authenticated" ? (session?.user ?? null) : null,
    errorKind,
    attemptId: targetAttempt,
  });

  if (settleCurrentAttempt) {
    const resolve = settleCurrentAttempt;
    settleCurrentAttempt = null;
    resolve(snapshot);
  }

  diag(
    phase === "recoverable_error"
      ? "initialization_failed"
      : phase === "authenticated"
        ? "initialization_recovered_or_ok"
        : "initialization_anonymous",
    {
      attemptId: targetAttempt,
      phase,
      errorKind,
      hasUser: Boolean(snapshot.user),
    },
  );

  return snapshot;
}

function applyAuthEvent(event: string, session: Session | null) {
  diag("auth_event", {
    event,
    hasUser: Boolean(session?.user),
    phase: snapshot.phase,
    attemptId,
  });

  if (session?.user) {
    markSessionActiveIfNeeded(session);
  }

  if (event === "SIGNED_OUT") {
    // 結束任何進行中的 attempt
    settleAttempt(attemptId, "anonymous", null, null);
    return;
  }

  if (session?.user) {
    // event-first：initializing 期間立即完成；recoverable_error 可恢復
    // TOKEN_REFRESHED：更新 session，不得把 UI 拉回 initializing
    if (snapshot.phase === "initializing" && settleCurrentAttempt) {
      settleAttempt(attemptId, "authenticated", session, null);
      return;
    }
    setSnapshot({
      ready: true,
      phase: "authenticated",
      session,
      user: session.user,
      errorKind: null,
      attemptId,
    });
    return;
  }

  // 無 session：僅 INITIAL_SESSION（或等同首次）可在 initializing 時定案 anonymous
  if (event === "INITIAL_SESSION") {
    if (snapshot.phase === "initializing" && settleCurrentAttempt) {
      settleAttempt(attemptId, "anonymous", null, null);
    } else if (snapshot.phase !== "authenticated") {
      setSnapshot({
        ready: true,
        phase: "anonymous",
        session: null,
        user: null,
        errorKind: null,
        attemptId,
      });
    }
    return;
  }

  // 其他無 session 事件：不得把既有 authenticated 降成 anonymous
}

function ensureListenerInstalled() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  const { data } = authClient.onAuthStateChange((event, session) => {
    // 同步 callback：禁止 await getSession／refreshSession
    applyAuthEvent(event, session);
  });
  subscription = data.subscription;
  diag("listener_installed", { attemptId });
}

async function runGetSessionAttempt(targetAttempt: number): Promise<void> {
  const startedAt = Date.now();
  diag("getSession_start", { attemptId: targetAttempt });

  const getSessionPromise = authClient.getSession();
  digestPromise(getSessionPromise);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), getSessionTimeoutMs);
  });

  try {
    const raced = await Promise.race([
      getSessionPromise.then(
        (result) => ({ kind: "result" as const, result }),
        (error: unknown) => ({ kind: "error" as const, error }),
      ),
      timeoutPromise.then(() => ({ kind: "timeout" as const })),
    ]);

    if (timer) clearTimeout(timer);

    // 若 event-first 已 settle，消化 losing branch 即可
    if (targetAttempt !== attemptId || snapshot.phase !== "initializing") {
      return;
    }

    if (raced.kind === "timeout") {
      diag("getSession_timeout", {
        attemptId: targetAttempt,
        elapsedMs: Date.now() - startedAt,
      });
      settleAttempt(targetAttempt, "recoverable_error", null, "get_session_timeout");
      return;
    }

    if (raced.kind === "error") {
      const err = raced.error;
      const message =
        err instanceof Error ? `${err.name}: ${err.message}` : "unknown_error";
      diag("getSession_error", {
        attemptId: targetAttempt,
        elapsedMs: Date.now() - startedAt,
        message,
      });
      settleAttempt(targetAttempt, "recoverable_error", null, "get_session_error");
      return;
    }

    const session = raced.result.data.session ?? null;
    diag("getSession_success", {
      attemptId: targetAttempt,
      elapsedMs: Date.now() - startedAt,
      hasUser: Boolean(session?.user),
    });

    if (session?.user) {
      settleAttempt(targetAttempt, "authenticated", session, null);
    } else {
      settleAttempt(targetAttempt, "anonymous", null, null);
    }
  } catch (error) {
    if (timer) clearTimeout(timer);
    if (targetAttempt !== attemptId || snapshot.phase !== "initializing") return;
    const message =
      error instanceof Error ? `${error.name}: ${error.message}` : "unknown_error";
    diag("getSession_error", { attemptId: targetAttempt, message });
    settleAttempt(targetAttempt, "recoverable_error", null, "get_session_error");
  }
}

function startInitialization(): Promise<AuthReadySnapshot> {
  if (
    initPromise &&
    (snapshot.phase === "initializing" ||
      snapshot.phase === "authenticated" ||
      snapshot.phase === "anonymous" ||
      snapshot.phase === "recoverable_error")
  ) {
    // 已 settled 的 attempt：直接回傳快取；進行中則共用同一 promise
    if (snapshot.phase !== "initializing") {
      return Promise.resolve(snapshot);
    }
    return initPromise;
  }

  ensureListenerInstalled();
  attemptId += 1;
  const targetAttempt = attemptId;

  setSnapshot({
    ready: false,
    phase: "initializing",
    session: null,
    user: null,
    errorKind: null,
    attemptId: targetAttempt,
  });

  diag("initialize_start", { attemptId: targetAttempt });

  initPromise = new Promise<AuthReadySnapshot>((resolve) => {
    settleCurrentAttempt = resolve;
  });

  void runGetSessionAttempt(targetAttempt);
  return initPromise;
}

export function getAuthSnapshot() {
  return snapshot;
}

export function getAuthPhase(): AuthPhase {
  return snapshot.phase;
}

export function subscribeAuthReady(listener: (snapshot: AuthReadySnapshot) => void) {
  listeners.add(listener);
  if (snapshot.ready || snapshot.phase === "initializing") {
    listener(snapshot);
  }
  void startInitialization();
  return () => {
    listeners.delete(listener);
  };
}

export function waitForAuthReady() {
  return startInitialization();
}

/**
 * 僅由使用者明確觸發；同一時間只允許一個 retry attempt。
 */
export function retryAuthInitialization(): Promise<AuthReadySnapshot> {
  if (retryInFlight) return retryInFlight;

  if (snapshot.phase === "initializing" && initPromise) {
    return initPromise;
  }

  // 強制開啟新 attempt（即使前一次已 settled）
  initPromise = null;
  retryInFlight = (async () => {
    try {
      ensureListenerInstalled();
      attemptId += 1;
      const targetAttempt = attemptId;

      setSnapshot({
        ready: false,
        phase: "initializing",
        session: null,
        user: null,
        errorKind: null,
        attemptId: targetAttempt,
      });

      diag("initialize_retry", { attemptId: targetAttempt });

      initPromise = new Promise<AuthReadySnapshot>((resolve) => {
        settleCurrentAttempt = resolve;
      });

      void runGetSessionAttempt(targetAttempt);
      return await initPromise;
    } finally {
      retryInFlight = null;
    }
  })();

  return retryInFlight;
}

export async function getAuthenticatedSession() {
  const current = await waitForAuthReady();
  if (current.phase === "recoverable_error") {
    throw new AuthRecoverableError(current.errorKind);
  }
  return current.session;
}

export async function getAuthenticatedUser() {
  const current = await waitForAuthReady();
  if (current.phase === "recoverable_error") {
    throw new AuthRecoverableError(current.errorKind);
  }
  return current.user;
}

/** 測試用：重置模組狀態；production 不得依賴。 */
export function __resetAuthReadyForTests(opts?: {
  getSessionTimeoutMs?: number;
  authClient?: AuthClient;
}) {
  if (subscription) {
    try {
      subscription.unsubscribe();
    } catch {
      /* ignore */
    }
  }
  subscription = null;
  listenerInstalled = false;
  settleCurrentAttempt = null;
  initPromise = null;
  retryInFlight = null;
  attemptId = 0;
  listeners.clear();
  getSessionTimeoutMs = opts?.getSessionTimeoutMs ?? DEFAULT_GET_SESSION_TIMEOUT_MS;
  if (opts?.authClient) {
    authClient = opts.authClient;
  } else {
    authClient = supabase.auth as AuthClient;
  }
  snapshot = {
    ready: false,
    phase: "idle",
    session: null,
    user: null,
    errorKind: null,
    attemptId: 0,
  };
  lastDiagAt = 0;
  lastDiagKey = "";
}
