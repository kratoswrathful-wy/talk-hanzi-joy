import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { getAuthSnapshot, subscribeAuthReady, waitForAuthReady } from "@/lib/auth-ready";
import { PROFILE_SELECT_COLUMNS } from "@/lib/profile-columns";
import { setTestAccountFlag } from "@/lib/environment";

interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string;
  timezone: string | null;
  status_message: string | null;
  phone: string | null;
  mobile: string | null;
  bio: string | null;
  /** PM/Executive: receive Slack DMs when someone accepts/declines a case (server-side filter). */
  receive_translator_case_reply_slack_dms?: boolean | null;
  /** Optional suffixes for automatic case-reply Slack DMs (JSON from DB). */
  slack_message_defaults?: unknown;
  /** 測試帳號（假人）旗標；true 代表此帳號一律屬於測試環境。 */
  is_test?: boolean | null;
}

interface UserRole {
  role: "member" | "pm" | "executive";
}

/**
 * PROFILE_SELECT_COLUMNS 是 join(", ") 組出的一般 string（非字面量型別），
 * supabase-js 無法從中推導出精確欄位型別（退回 GenericStringError），故在此以
 * Record<string, unknown> 逐欄位防禦性讀取，而非整包 as unknown as Profile。
 */
function profileFromRow(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id ?? ""),
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
    email: typeof row.email === "string" ? row.email : "",
    timezone: typeof row.timezone === "string" ? row.timezone : null,
    status_message: typeof row.status_message === "string" ? row.status_message : null,
    phone: typeof row.phone === "string" ? row.phone : null,
    mobile: typeof row.mobile === "string" ? row.mobile : null,
    bio: typeof row.bio === "string" ? row.bio : null,
    receive_translator_case_reply_slack_dms:
      typeof row.receive_translator_case_reply_slack_dms === "boolean"
        ? row.receive_translator_case_reply_slack_dms
        : null,
    slack_message_defaults: row.slack_message_defaults,
    is_test: typeof row.is_test === "boolean" ? row.is_test : null,
  };
}

/** 只擋「角色」載入；profile 另載入，避免 profiles 欄位／資料問題卡住全站 member */
const ROLES_LOAD_TIMEOUT_MS = 12000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

export function useAuth() {
  const initialSnapshot = getAuthSnapshot();
  const [user, setUser] = useState<User | null>(initialSnapshot.user);
  const [session, setSession] = useState<Session | null>(initialSnapshot.session);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  // 已登入時在讀取 profile / user_roles 完成前必須維持 loading，否則會有一瞬間 roles=[] → isAdmin=false（設定頁誤判）
  const [loading, setLoading] = useState(
    () => !initialSnapshot.ready || initialSnapshot.user != null,
  );

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT_COLUMNS)
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("fetchProfile error:", error);
      setProfile(null);
      return;
    }

    if (!data) {
      setProfile(null);
      return;
    }

    const profileData = profileFromRow(data as Record<string, unknown>);
    setProfile(profileData);
    // 將 profiles.is_test 寫入環境模組（權威來源），供 getEnvironment() 身分優先判斷。
    setTestAccountFlag(profileData.is_test === true);
  }, []);

  const fetchRoles = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (error) {
      console.error("fetchRoles error:", error);
      setRoles([]);
      return;
    }

    setRoles((data as UserRole[]) || []);
  }, []);

  useEffect(() => {
    let mounted = true;

    const unsubscribe = subscribeAuthReady((snapshot) => {
      if (!mounted) return;
      setSession(snapshot.session);
      setUser(snapshot.user);
    });

    void waitForAuthReady()
      .then(() => {
        if (!mounted) return;
        // 僅在未登入時關閉 loading；已登入時由「讀取 profile + user_roles」的流程負責 setLoading(false)
        const snap = getAuthSnapshot();
        if (!snap.user) setLoading(false);
      })
      .catch((error) => {
        console.error("auth init error:", error);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // 取出 user?.id 為獨立的原始值依賴：user 物件其他欄位變動（例如 token 刷新產生的新物件參考）
  // 不應重跑 profile/roles 載入，effect 內只讀 userId（非整個 user 物件），exhaustive-deps 可自然滿足。
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setRoles([]);
      setTestAccountFlag(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    // profile 不阻塞全螢幕 loading（缺 migration 欄位、大 JSON 等不應讓 member 永遠轉圈）
    void fetchProfile(userId);

    void withTimeout(fetchRoles(userId), ROLES_LOAD_TIMEOUT_MS, "fetchRoles")
      .catch((e) => {
        console.error("[useAuth] fetchRoles failed:", e);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId, fetchProfile, fetchRoles]);

  const isAdmin = roles.some((r) => r.role === "pm" || r.role === "executive");
  // user_roles can return multiple rows with no guaranteed order; pick highest privilege.
  const primaryRole: UserRole["role"] = (() => {
    if (roles.some((r) => r.role === "executive")) return "executive";
    if (roles.some((r) => r.role === "pm")) return "pm";
    if (roles.some((r) => r.role === "member")) return "member";
    return "member";
  })();

  const isExecutive = roles.some((r) => r.role === "executive");
  // 測試帳號：profiles.is_test，或 email 以 @test.local 結尾（profile 尚未載入時的退路）。
  const isTestAccount =
    profile?.is_test === true ||
    (user?.email?.toLowerCase().endsWith("@test.local") ?? false);
  // 真人執行長：executive 且非測試帳號 —— 唯一可開啟測試模式、管理假人專區的身分。
  const isRealExecutive = isExecutive && !isTestAccount;

  const signOut = useCallback(async () => {
    try {
      localStorage.removeItem("keep_logged_in");
      sessionStorage.removeItem("session_active");
      await supabase.auth.signOut({ scope: "local" });
    } catch (e) {
      console.error("Sign out error:", e);
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
    setTestAccountFlag(null);
    setLoading(false);
  }, []);

  return {
    user,
    session,
    profile,
    roles,
    loading,
    isAdmin,
    primaryRole,
    isExecutive,
    isTestAccount,
    isRealExecutive,
    signOut,
    refetchProfile: () => user && fetchProfile(user.id),
  };
}
