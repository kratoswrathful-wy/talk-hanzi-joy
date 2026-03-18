import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

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
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      setProfile(data);
    } catch (e) {
      console.error("fetchProfile error:", e);
    }
  }, []);

  const fetchRoles = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      setRoles((data as UserRole[]) || []);
    } catch (e) {
      console.error("fetchRoles error:", e);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // 1) Restore session from storage FIRST
    supabase.auth.getSession().then(({ data: { session: restored } }) => {
      if (!mounted) return;

      // "Keep logged in" check: if browser was restarted without the flag, clear session
      if (restored) {
        const keepLoggedIn = localStorage.getItem("keep_logged_in") === "true";
        const sessionActive = sessionStorage.getItem("session_active") === "true";
        if (!keepLoggedIn && !sessionActive) {
          supabase.auth.signOut({ scope: "local" });
          setSession(null);
          setUser(null);
          setProfile(null);
          setRoles([]);
          setLoading(false);
          return;
        }
      }

      setSession(restored);
      setUser(restored?.user ?? null);
      if (restored?.user) {
        fetchProfile(restored.user.id);
        fetchRoles(restored.user.id);
      }
      setLoading(false);
    });

    // 2) Listen for SUBSEQUENT auth changes (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!mounted) return;
        // Skip the initial session event — we already handled it above
        if (event === "INITIAL_SESSION") return;

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          // Fire-and-forget to avoid deadlocks in the callback
          setTimeout(() => {
            fetchProfile(newSession.user.id);
            fetchRoles(newSession.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile, fetchRoles]);

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
