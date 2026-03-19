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

function initialize() {
  if (initialized) {
    return initPromise ?? Promise.resolve(snapshot);
  }

  initialized = true;

  supabase.auth.onAuthStateChange((_event, session) => {
    updateSnapshot(session, true);
  });

  initPromise = supabase.auth
    .getSession()
    .then(({ data: { session } }) => {
      updateSnapshot(session, true);
      return snapshot;
    })
    .catch((error) => {
      console.error("Failed to restore auth session:", error);
      updateSnapshot(null, true);
      return snapshot;
    });

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
