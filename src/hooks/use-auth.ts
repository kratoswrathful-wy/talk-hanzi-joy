import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import {
  getAuthSnapshot,
  subscribeAuthReady,
  waitForAuthReady,
  retryAuthInitialization,
  getAuthPhase,
  type AuthPhase,
  type AuthErrorKind,
} from "@/lib/auth-ready";
import {
  beginIdentityLoad,
  invalidateIdentity,
  isIdentityResultCurrent,
  type AuthProfile,
  type AuthUserRole,
} from "@/lib/auth-identity";
import { setTestAccountFlag } from "@/lib/environment";

type Profile = AuthProfile;
type UserRole = AuthUserRole;

export function useAuth() {
  const initialSnapshot = getAuthSnapshot();
  const [user, setUser] = useState<User | null>(initialSnapshot.user);
  const [session, setSession] = useState<Session | null>(initialSnapshot.session);
  const [authPhase, setAuthPhase] = useState<AuthPhase>(initialSnapshot.phase);
  const [authErrorKind, setAuthErrorKind] = useState<AuthErrorKind>(initialSnapshot.errorKind);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [identityLoading, setIdentityLoading] = useState(
    () => initialSnapshot.phase === "authenticated" || initialSnapshot.user != null,
  );
  const [authRetrying, setAuthRetrying] = useState(false);
  const userIdRef = useRef<string | null>(initialSnapshot.user?.id ?? null);

  useEffect(() => {
    let mounted = true;

    const unsubscribe = subscribeAuthReady((snapshot) => {
      if (!mounted) return;
      setSession(snapshot.session);
      setUser(snapshot.user);
      setAuthPhase(snapshot.phase);
      setAuthErrorKind(snapshot.errorKind);

      const nextId = snapshot.user?.id ?? null;
      if (nextId !== userIdRef.current) {
        userIdRef.current = nextId;
        if (!nextId) {
          invalidateIdentity();
          setProfile(null);
          setRoles([]);
          setTestAccountFlag(null);
          setIdentityLoading(false);
        } else {
          // 切換身分：先清舊角色，避免 A 的 PM 殘留到 B
          invalidateIdentity();
          setProfile(null);
          setRoles([]);
          setTestAccountFlag(null);
        }
      }
    });

    void waitForAuthReady()
      .then((snap) => {
        if (!mounted) return;
        setAuthPhase(snap.phase);
        setAuthErrorKind(snap.errorKind);
        if (snap.phase !== "authenticated") {
          setIdentityLoading(false);
        }
      })
      .catch((error) => {
        console.error("auth init error:", error);
        if (mounted) {
          setIdentityLoading(false);
          setAuthPhase(getAuthPhase());
        }
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const userId = user?.id;

  useEffect(() => {
    if (authPhase === "recoverable_error" || authPhase === "anonymous" || authPhase === "idle") {
      setIdentityLoading(false);
      return;
    }

    if (!userId || authPhase !== "authenticated") {
      return;
    }

    let active = true;
    setIdentityLoading(true);

    const { generation, profilePromise, rolesPromise } = beginIdentityLoad(userId);

    void profilePromise.then((nextProfile) => {
      if (!active || !isIdentityResultCurrent(userId, generation)) return;
      setProfile(nextProfile);
    });

    void rolesPromise
      .then((nextRoles) => {
        if (!active || !isIdentityResultCurrent(userId, generation)) return;
        setRoles(nextRoles);
      })
      .finally(() => {
        if (active && isIdentityResultCurrent(userId, generation)) {
          setIdentityLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [userId, authPhase]);

  // Auth session 初始化中 → 全畫面 loading；角色載入另計
  const authInitializing = authPhase === "initializing" || authPhase === "idle";
  const loading =
    authInitializing ||
    (authPhase === "authenticated" && identityLoading);

  const isAdmin = roles.some((r) => r.role === "pm" || r.role === "executive");
  const primaryRole: UserRole["role"] = (() => {
    if (roles.some((r) => r.role === "executive")) return "executive";
    if (roles.some((r) => r.role === "pm")) return "pm";
    if (roles.some((r) => r.role === "member")) return "member";
    return "member";
  })();

  const isExecutive = roles.some((r) => r.role === "executive");
  const isTestAccount =
    profile?.is_test === true ||
    (user?.email?.toLowerCase().endsWith("@test.local") ?? false);
  const isRealExecutive = isExecutive && !isTestAccount;

  const signOut = useCallback(async () => {
    try {
      localStorage.removeItem("keep_logged_in");
      sessionStorage.removeItem("session_active");
      const signOutPromise = supabase.auth.signOut({ scope: "local" });
      const timeout = new Promise<"timeout">((resolve) => {
        setTimeout(() => resolve("timeout"), 8_000);
      });
      await Promise.race([signOutPromise, timeout]);
    } catch (e) {
      console.error("Sign out error:", e);
    }
    invalidateIdentity();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
    setTestAccountFlag(null);
    setIdentityLoading(false);
    setAuthPhase("anonymous");
    setAuthErrorKind(null);
  }, []);

  const retryAuth = useCallback(async () => {
    if (authRetrying) return;
    setAuthRetrying(true);
    try {
      invalidateIdentity();
      setProfile(null);
      setRoles([]);
      const snap = await retryAuthInitialization();
      setAuthPhase(snap.phase);
      setAuthErrorKind(snap.errorKind);
      setUser(snap.user);
      setSession(snap.session);
    } finally {
      setAuthRetrying(false);
    }
  }, [authRetrying]);

  return {
    user,
    session,
    profile,
    roles,
    loading,
    authPhase,
    authErrorKind,
    authRetrying,
    identityLoading,
    isAdmin,
    primaryRole,
    isExecutive,
    isTestAccount,
    isRealExecutive,
    signOut,
    retryAuth,
    refetchProfile: () => {
      if (!user) return;
      const { generation, profilePromise } = beginIdentityLoad(user.id);
      void profilePromise.then((next) => {
        if (!isIdentityResultCurrent(user.id, generation)) return;
        setProfile(next);
      });
    },
  };
}
