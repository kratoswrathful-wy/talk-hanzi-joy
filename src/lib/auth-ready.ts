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
/** DEV／E2E：reload 後仍生效的故障注入鍵（僅測試建置讀取）。 */
const TEST_BLOCK_STORAGE_KEY = "__auth_ready_test_block";
const TEST_TIMEOUT_STORAGE_KEY = "__auth_ready_test_timeout_ms";

type GetSessionResult = {
  data: { session: Session | null };
  error: { message?: string; name?: string } | Error | null;
};

type AuthClient = {
  getSession: () => Promise<GetSessionResult>;
  onAuthStateChange: (
    cb: (event: string, session: Session | null) => void,
  ) => { data: { subscription: { unsubscribe: () => void } } };
};

let getSessionTimeoutMs = DEFAULT_GET_SESSION_TIMEOUT_MS;
let authClient: AuthClient = supabase.auth as AuthClient;

/** 測試／DEV 用：強制下一輪 getSession 永不 settle（模擬卡死）。 */
let testBlockGetSession = false;

function readTestFaultInjectionFromStorage() {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (sessionStorage.getItem(TEST_BLOCK_STORAGE_KEY) === "1") {
      testBlockGetSession = true;
    }
    const raw = sessionStorage.getItem(TEST_TIMEOUT_STORAGE_KEY);
    if (raw) {
      const ms = Number(raw);
      if (Number.isFinite(ms) && ms > 0) getSessionTimeoutMs = ms;
    }
  } catch {
    /* private mode／非瀏覽器 */
  }
}

function writeTestBlockToStorage(block: boolean) {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (block) sessionStorage.setItem(TEST_BLOCK_STORAGE_KEY, "1");
    else sessionStorage.removeItem(TEST_BLOCK_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function writeTestTimeoutToStorage(ms: number) {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (ms === DEFAULT_GET_SESSION_TIMEOUT_MS) {
      sessionStorage.removeItem(TEST_TIMEOUT_STORAGE_KEY);
    } else {
      sessionStorage.setItem(TEST_TIMEOUT_STORAGE_KEY, String(ms));
    }
  } catch {
    /* ignore */
  }
}

readTestFaultInjectionFromStorage();

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

/** 目前 attempt 的 timeout timer；event-first settle 時必須立刻清除。 */
let activeTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
let activeTimeoutAttempt = 0;

const listeners = new Set<(snapshot: AuthReadySnapshot) => void>();

let lastDiagAt = 0;
let lastDiagKey = "";

function diag(event: string, detail?: Record<string, string | number | boolean | null | undefined>) {
  const key = `${event}:${detail?.attemptId ?? ""}`;
  const now = Date.now();
  if (key === lastDiagKey && now - lastDiagAt < 2000) return;
  lastDiagKey = key;
  lastDiagAt = now;
  const visibility =
    typeof document !== "undefined" ? document.visibilityState : "unknown";
  console.info(DIAG_PREFIX, { event, visibility, ...detail });
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

function clearActiveTimeout(targetAttempt?: number) {
  if (targetAttempt != null && activeTimeoutAttempt !== targetAttempt) return;
  if (activeTimeoutTimer != null) {
    clearTimeout(activeTimeoutTimer);
    activeTimeoutTimer = null;
  }
  activeTimeoutAttempt = 0;
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

  // event-first／成功／失敗皆立刻取消該 attempt 的 timeout
  clearActiveTimeout(targetAttempt);

  if (phase === "authenticated") {
    markSessionActiveIfNeeded(session);
    ensureSessionActiveFlag(session);
  }

  // recoverable_error：保留既有 session／user（若有），不得假裝已登出清光
  const keepSession =
    phase === "authenticated"
      ? session
      : phase === "recoverable_error"
        ? snapshot.session
        : null;
  const keepUser =
    phase === "authenticated"
      ? (session?.user ?? null)
      : phase === "recoverable_error"
        ? snapshot.user
        : null;

  setSnapshot({
    ready: true,
    phase,
    session: keepSession,
    user: keepUser,
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
    settleAttempt(attemptId, "anonymous", null, null);
    return;
  }

  if (session?.user) {
    if (snapshot.phase === "initializing" && settleCurrentAttempt) {
      // 故障注入：模擬 getSession 卡死時，不得被 event-first INITIAL_SESSION 短路
      if (testBlockGetSession) {
        diag("event_first_skipped_fault_injection", {
          event,
          attemptId,
          hasUser: true,
        });
        return;
      }
      settleAttempt(attemptId, "authenticated", session, null);
      return;
    }
    // TOKEN_REFRESHED／SIGNED_IN：更新 session，不得拉回 initializing
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

  if (event === "INITIAL_SESSION") {
    if (testBlockGetSession && snapshot.phase === "initializing") {
      diag("event_first_skipped_fault_injection", {
        event,
        attemptId,
        hasUser: false,
      });
      return;
    }
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
  }
}

function ensureListenerInstalled() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  const { data } = authClient.onAuthStateChange((event, session) => {
    applyAuthEvent(event, session);
  });
  subscription = data.subscription;
  diag("listener_installed", { attemptId });
}

/**
 * 建立新 attempt：必須先進入 initializing 並掛好 settle deferred，
 * 再安裝／觸發 listener，避免同步 INITIAL_SESSION 被後續 initializing 覆寫。
 */
function beginAttempt(kind: "start" | "retry"): Promise<AuthReadySnapshot> {
  // reload／addInitScript 後再讀一次，確保故障注入早於 getSession
  readTestFaultInjectionFromStorage();

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

  diag(kind === "retry" ? "initialize_retry" : "initialize_start", {
    attemptId: targetAttempt,
  });

  initPromise = new Promise<AuthReadySnapshot>((resolve) => {
    settleCurrentAttempt = resolve;
  });

  // attempt 狀態就緒後才安裝 listener（同步 INITIAL_SESSION 可直接 settle）
  ensureListenerInstalled();

  // 若 listener 已同步 settle，不必再跑 getSession
  if (snapshot.phase !== "initializing") {
    return initPromise;
  }

  void runGetSessionAttempt(targetAttempt);
  return initPromise;
}

async function runGetSessionAttempt(targetAttempt: number): Promise<void> {
  const startedAt = Date.now();
  diag("getSession_start", { attemptId: targetAttempt });

  const getSessionPromise: Promise<GetSessionResult> = testBlockGetSession
    ? new Promise(() => {
        /* intentional hang for E2E / unit fault injection */
      })
    : authClient.getSession();
  digestPromise(getSessionPromise);

  clearActiveTimeout();
  const timeoutPromise = new Promise<"timeout">((resolve) => {
    activeTimeoutAttempt = targetAttempt;
    activeTimeoutTimer = setTimeout(() => resolve("timeout"), getSessionTimeoutMs);
  });

  try {
    const raced = await Promise.race([
      getSessionPromise.then(
        (result) => ({ kind: "result" as const, result }),
        (error: unknown) => ({ kind: "error" as const, error }),
      ),
      timeoutPromise.then(() => ({ kind: "timeout" as const })),
    ]);

    clearActiveTimeout(targetAttempt);

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

    // resolved result 仍可能帶 error（session restore／refresh 失敗）
    if (raced.result.error) {
      const err = raced.result.error;
      const message =
        err instanceof Error
          ? `${err.name}: ${err.message}`
          : typeof err.message === "string"
            ? err.message
            : "get_session_error";
      diag("getSession_result_error", {
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
    clearActiveTimeout(targetAttempt);
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
    if (snapshot.phase !== "initializing") {
      return Promise.resolve(snapshot);
    }
    return initPromise;
  }

  return beginAttempt("start");
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

export function retryAuthInitialization(): Promise<AuthReadySnapshot> {
  if (retryInFlight) return retryInFlight;

  if (snapshot.phase === "initializing" && initPromise) {
    return initPromise;
  }

  initPromise = null;
  retryInFlight = (async () => {
    try {
      return await beginAttempt("retry");
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
  clearActiveTimeout();
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
  testBlockGetSession = false;
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

export function __setTestBlockGetSession(block: boolean) {
  testBlockGetSession = block;
}

export function __setGetSessionTimeoutMsForTests(ms: number) {
  getSessionTimeoutMs = ms;
}

export function __hasActiveTimeoutTimerForTests() {
  return activeTimeoutTimer != null;
}

/** 僅 DEV／測試建置：供 Playwright 注入故障；production build 不掛全域後門。 */
export type AuthReadyTestHooks = {
  blockGetSession: (block: boolean) => void;
  setTimeoutMs: (ms: number) => void;
  getPhase: () => AuthPhase;
  getSnapshot: () => AuthReadySnapshot;
  retry: () => Promise<AuthReadySnapshot>;
  emit: (event: string, session: Session | null) => void;
};

declare global {
  interface Window {
    __authReadyTest?: AuthReadyTestHooks;
  }
}

export function installAuthReadyTestHooks() {
  if (!import.meta.env.DEV) return;
  window.__authReadyTest = {
    blockGetSession: (block) => {
      testBlockGetSession = block;
      writeTestBlockToStorage(block);
    },
    setTimeoutMs: (ms) => {
      getSessionTimeoutMs = ms;
      writeTestTimeoutToStorage(ms);
    },
    getPhase: () => snapshot.phase,
    getSnapshot: () => snapshot,
    retry: () => retryAuthInitialization(),
    emit: (event, session) => applyAuthEvent(event, session),
  };
}
