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
  beginForcedProfileRefresh,
  invalidateIdentity,
  isIdentityResultCurrent,
  setActiveUserId,
  type AuthProfile,
  type AuthUserRole,
  type ProfileLoadResult,
  type RolesLoadResult,
} from "@/lib/auth-identity";
import { setTestAccountFlag } from "@/lib/environment";

type Profile = AuthProfile;
type UserRole = AuthUserRole;

const DEFAULT_SIGN_OUT_TIMEOUT_MS = 8_000;
let signOutTimeoutMs = DEFAULT_SIGN_OUT_TIMEOUT_MS;

/** 測試用：縮短 signOut race timer。 */
export function __setSignOutTimeoutMsForTests(ms: number | null) {
  signOutTimeoutMs = ms ?? DEFAULT_SIGN_OUT_TIMEOUT_MS;
}

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
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identityRetrying, setIdentityRetrying] = useState(false);
  const [authRetrying, setAuthRetrying] = useState(false);
  const userIdRef = useRef<string | null>(initialSnapshot.user?.id ?? null);
  const signOutEpochRef = useRef(0);

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
        setActiveUserId(nextId);
        if (!nextId) {
          invalidateIdentity();
          setProfile(null);
          setRoles([]);
          setIdentityError(null);
          setTestAccountFlag(null);
          setIdentityLoading(false);
        } else {
          invalidateIdentity();
          setActiveUserId(nextId);
          setProfile(null);
          setRoles([]);
          setIdentityError(null);
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

  const loadIdentity = useCallback(
    (uid: string, opts?: { force?: boolean }) => {
      setIdentityLoading(true);
      setIdentityError(null);
      setActiveUserId(uid);

      const { generation, profilePromise, rolesPromise } = beginIdentityLoad(uid, opts);

      void profilePromise.then((result: ProfileLoadResult) => {
        if (!isIdentityResultCurrent(uid, generation)) return;
        // strictNullChecks:false 下 ok 字面量無法可靠收窄，改用 in 檢查
        if ("error" in result) {
          if (result.error !== "stale") {
            setIdentityError((prev) => prev ?? result.error);
          }
          return;
        }
        setProfile(result.profile);
      });

      void rolesPromise
        .then((result: RolesLoadResult) => {
          if (!isIdentityResultCurrent(uid, generation)) return;
          if ("error" in result) {
            if (result.error !== "stale") {
              setRoles([]);
              setIdentityError(result.error);
            }
            return;
          }
          setRoles(result.roles);
          setIdentityError(null);
        })
        .finally(() => {
          if (isIdentityResultCurrent(uid, generation)) {
            setIdentityLoading(false);
          }
        });

      return generation;
    },
    [],
  );

  useEffect(() => {
    if (authPhase === "recoverable_error" || authPhase === "anonymous" || authPhase === "idle") {
      setIdentityLoading(false);
      return;
    }

    if (!userId || authPhase !== "authenticated") {
      return;
    }

    let active = true;
    loadIdentity(userId);

    return () => {
      active = false;
      void active;
    };
  }, [userId, authPhase, loadIdentity]);

  const authInitializing = authPhase === "initializing" || authPhase === "idle";
  // 身分錯誤時結束 spinner（可重試），不得永久轉圈
  const loading =
    authInitializing ||
    (authPhase === "authenticated" && identityLoading && !identityError);

  const rolesTrusted = !identityError && !identityLoading;
  const isAdmin =
    rolesTrusted && roles.some((r) => r.role === "pm" || r.role === "executive");
  const primaryRole: UserRole["role"] = (() => {
    if (!rolesTrusted) return "member"; // 僅作 fail-closed 預設；UI 應先看 identityError
    if (roles.some((r) => r.role === "executive")) return "executive";
    if (roles.some((r) => r.role === "pm")) return "pm";
    if (roles.some((r) => r.role === "member")) return "member";
    return "member";
  })();

  const isExecutive = rolesTrusted && roles.some((r) => r.role === "executive");
  const isTestAccount =
    profile?.is_test === true ||
    (user?.email?.toLowerCase().endsWith("@test.local") ?? false);
  const isRealExecutive = isExecutive && !isTestAccount;

  const signOut = useCallback(async () => {
    const epoch = ++signOutEpochRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      localStorage.removeItem("keep_logged_in");
      sessionStorage.removeItem("session_active");
      const signOutPromise = supabase.auth.signOut({ scope: "local" });
      digestLateSignOut(signOutPromise, epoch, () => signOutEpochRef.current);

      const timed = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), signOutTimeoutMs);
      });
      await Promise.race([signOutPromise.then(() => "done" as const), timed]);
    } catch (e) {
      console.error("Sign out error:", e);
    } finally {
      if (timer) clearTimeout(timer);
    }

    // 逾時後若已有新登入／新的 signOut，不得覆寫新狀態
    if (epoch !== signOutEpochRef.current) return;

    invalidateIdentity();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
    setIdentityError(null);
    setTestAccountFlag(null);
    setIdentityLoading(false);
    setAuthPhase("anonymous");
    setAuthErrorKind(null);
  }, []);

  const retryAuth = useCallback(async () => {
    if (authRetrying) return;
    setAuthRetrying(true);
    try {
      // 取消任何進行中的 signOut 落地
      signOutEpochRef.current += 1;
      invalidateIdentity();
      setProfile(null);
      setRoles([]);
      setIdentityError(null);
      const snap = await retryAuthInitialization();
      setAuthPhase(snap.phase);
      setAuthErrorKind(snap.errorKind);
      setUser(snap.user);
      setSession(snap.session);
      if (snap.user?.id) {
        userIdRef.current = snap.user.id;
        setActiveUserId(snap.user.id);
      }
    } finally {
      setAuthRetrying(false);
    }
  }, [authRetrying]);

  const retryIdentity = useCallback(async () => {
    if (!userId || identityRetrying) return;
    setIdentityRetrying(true);
    try {
      loadIdentity(userId, { force: true });
    } finally {
      setIdentityRetrying(false);
    }
  }, [userId, identityRetrying, loadIdentity]);

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
    identityError,
    identityRetrying,
    rolesTrusted,
    isAdmin,
    primaryRole,
    isExecutive,
    isTestAccount,
    isRealExecutive,
    signOut,
    retryAuth,
    retryIdentity,
    refetchProfile: () => {
      if (!user) return;
      const uid = user.id;
      const { generation, profilePromise } = beginForcedProfileRefresh(uid);
      void profilePromise.then((result: ProfileLoadResult) => {
        if (!isIdentityResultCurrent(uid, generation)) return;
        if (!("error" in result)) {
          setProfile(result.profile);
        }
      });
    },
  };
}

function digestLateSignOut(
  promise: Promise<unknown>,
  epoch: number,
  getCurrentEpoch: () => number,
) {
  void promise.then(
    () => {
      if (epoch !== getCurrentEpoch()) {
        // 晚到的 signOut 已過期；不觸發額外 UI 寫入
      }
    },
    () => undefined,
  );
}
