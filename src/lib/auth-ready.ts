import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface AuthReadySnapshot {
  ready: boolean;
  session: Session | null;
  user: User | null;
}

let snapshot: AuthReadySnapshot = {
  ready: false,
  session: null,
  user: null,
};

let initialized = false;
let initPromise: Promise<AuthReadySnapshot> | null = null;
const listeners = new Set<(snapshot: AuthReadySnapshot) => void>();

function notify() {
  listeners.forEach((listener) => listener(snapshot));
}

function updateSnapshot(session: Session | null, ready = true) {
  snapshot = {
    ready,
    session,
    user: session?.user ?? null,
  };
  notify();
}

async function resolveInitialSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      const keepLoggedIn = localStorage.getItem("keep_logged_in") === "true";
      const sessionActive = sessionStorage.getItem("session_active") === "true";

      // 先前邏輯：未勾「保持登入」且無 session_active 就 signOut。
      // 經信箱驗證／OAuth／Magic link 回站的使用者不會走登入表單，永遠不會設 session_active，
      // 會被誤踢或與還原流程打架。改為：有此 Supabase session 即視為本分頁工作階段有效。
      if (!keepLoggedIn && !sessionActive) {
        sessionStorage.setItem("session_active", "true");
      }
    }

    updateSnapshot(session, true);
    return snapshot;
  } catch (error) {
    console.error("Failed to restore auth session:", error);
    updateSnapshot(null, true);
    return snapshot;
  }
}

function initialize() {
  if (initialized) {
    return initPromise ?? Promise.resolve(snapshot);
  }

  initialized = true;

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user && localStorage.getItem("keep_logged_in") !== "true") {
      sessionStorage.setItem("session_active", "true");
    }
    if (event === "SIGNED_OUT") {
      updateSnapshot(null, true);
      return;
    }
    if (!session?.user) {
      try {
        const { data: { session: recovered } } = await supabase.auth.getSession();
        updateSnapshot(recovered ?? null, true);
      } catch {
        updateSnapshot(null, true);
      }
      return;
    }
    updateSnapshot(session, true);
  });

  initPromise = resolveInitialSession();
  return initPromise;
}

export function getAuthSnapshot() {
  return snapshot;
}

export function subscribeAuthReady(listener: (snapshot: AuthReadySnapshot) => void) {
  listeners.add(listener);
  if (snapshot.ready) {
    listener(snapshot);
  }
  void initialize();
  return () => listeners.delete(listener);
}

export function waitForAuthReady() {
  return initialize();
}

export async function getAuthenticatedSession() {
  const current = await waitForAuthReady();
  return current.session;
}

export async function getAuthenticatedUser() {
  const current = await waitForAuthReady();
  return current.user;
}
