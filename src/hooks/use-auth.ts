import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { getAuthSnapshot, subscribeAuthReady, waitForAuthReady } from "@/lib/auth-ready";

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
}

interface UserRole {
  role: "member" | "pm" | "executive";
}

export function useAuth() {
  const initialSnapshot = getAuthSnapshot();
  const [user, setUser] = useState<User | null>(initialSnapshot.user);
  const [session, setSession] = useState<Session | null>(initialSnapshot.session);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(!initialSnapshot.ready);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("fetchProfile error:", error);
      setProfile(null);
      return;
    }

    setProfile(data);
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
        if (mounted) setLoading(false);
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

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setRoles([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    void Promise.all([fetchProfile(user.id), fetchRoles(user.id)]).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [user?.id, fetchProfile, fetchRoles]);

  const isAdmin = roles.some((r) => r.role === "pm" || r.role === "executive");
  const primaryRole = roles.length > 0 ? roles[0].role : "member";

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
    signOut,
    refetchProfile: () => user && fetchProfile(user.id),
  };
}
